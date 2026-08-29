import fs from 'fs';
import path from 'path';
import { Request, Response } from 'express';
import { getDbPool } from './db.js';

const CHUNK_SIZE = 1024 * 1024 * 16; // 16MB optimal chunk size for supercharged buffering & instant seek
const UPLOAD_DIR = path.join(process.cwd(), 'uploads', 'videos');

export async function handleVideoStream(req: Request, res: Response, videoRecord: any) {
  try {
    // Disable Nagle's algorithm for instant streaming packet delivery
    if (res.socket) {
      res.socket.setNoDelay(true);
    }
    // Ensure upload directory exists
    if (!fs.existsSync(UPLOAD_DIR)) {
      fs.mkdirSync(UPLOAD_DIR, { recursive: true });
    }

    let filePath = videoRecord.file_path;
    const fileName = videoRecord.file_name || (filePath ? path.basename(filePath) : `${videoRecord.id}.mp4`);
    const localUploadPath = path.join(UPLOAD_DIR, fileName);

    let hasLocalFile = false;
    // Check disk paths
    if (fs.existsSync(localUploadPath)) {
      filePath = localUploadPath;
      hasLocalFile = true;
    } else if (filePath && fs.existsSync(filePath)) {
      hasLocalFile = true;
    }

    if (!hasLocalFile) {
      // If missing on disk, serve instantly directly from database!
      if (!currentlyRestoring.has(videoRecord.id)) {
        currentlyRestoring.add(videoRecord.id);
        // Run disk restore in background so subsequent streams are purely disk I/O
        restoreVideoFromPostgres(videoRecord.id, localUploadPath)
          .finally(() => currentlyRestoring.delete(videoRecord.id))
          .catch(console.error);
      }
      return await serveDirectlyFromPostgres(req, res, videoRecord);
    }

    const stat = fs.statSync(filePath);
    const fileSize = stat.size || parseInt(videoRecord.file_size, 10) || 0;
    const range = req.headers.range;
    const etag = `"mp4-${videoRecord.id}-${fileSize}-${Math.floor(stat.mtimeMs)}"`;
    const lastModified = stat.mtime.toUTCString();

    // CORS and standard Cloudflare-grade media headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    res.setHeader('Access-Control-Expose-Headers', 'Content-Range, Accept-Ranges, Content-Length, Content-Type, ETag, Last-Modified');
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('ETag', etag);
    res.setHeader('Last-Modified', lastModified);

    // Handle client cache verification
    if (req.headers['if-none-match'] === etag || req.headers['if-modified-since'] === lastModified) {
      return res.status(304).end();
    }

    // Asynchronously increment view count in PostgreSQL on first play
    if (!range || range.startsWith('bytes=0-')) {
      incrementVideoViews(videoRecord.id).catch(() => {});
    }

    // Handle HEAD requests (instant video metadata without transferring body)
    if (req.method === 'HEAD') {
      res.setHeader('Content-Type', videoRecord.mime_type || 'video/mp4');
      res.setHeader('Content-Length', fileSize);
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      return res.status(200).end();
    }

    // Handle HTTP 206 Partial Content (Byte Range Request - Instant Seek)
    if (range) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      let end = parts[1] ? parseInt(parts[1], 10) : NaN;

      if (isNaN(start) || start >= fileSize) {
        res.status(416).setHeader('Content-Range', `bytes */${fileSize}`);
        return res.end();
      }

      if (isNaN(end) || end >= fileSize) {
        end = Math.min(start + CHUNK_SIZE - 1, fileSize - 1);
      }

      const chunksize = end - start + 1;
      const fileStream = fs.createReadStream(filePath, { 
        start, 
        end, 
        highWaterMark: 1024 * 1024 // 1MB internal buffer for ultra-fast I/O throughput
      });

      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Content-Length': chunksize,
        'Content-Type': videoRecord.mime_type || 'video/mp4',
        'Cache-Control': 'public, max-age=31536000, immutable',
      });

      fileStream.pipe(res);
      fileStream.on('error', (err) => {
        console.error('[Stream error]', err);
        if (!res.headersSent) res.status(500).end();
      });
    } else {
      // Standard 200 Full Stream (fast linear streaming)
      res.writeHead(200, {
        'Content-Length': fileSize,
        'Content-Type': videoRecord.mime_type || 'video/mp4',
        'Cache-Control': 'public, max-age=86400',
      });
      fs.createReadStream(filePath, { highWaterMark: 1024 * 1024 }).pipe(res);
    }
  } catch (err: any) {
    console.error('[handleVideoStream error]', err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Video oqimida xatolik: ' + err.message });
    }
  }
}

const currentlyRestoring = new Set<string>();

async function serveDirectlyFromPostgres(req: Request, res: Response, videoRecord: any) {
  const CHUNK_SIZE = 5 * 1024 * 1024; // DB chunk size
  const fileSize = parseInt(videoRecord.file_size, 10) || 0;
  const range = req.headers.range;

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  res.setHeader('Access-Control-Expose-Headers', 'Content-Range, Accept-Ranges, Content-Length, Content-Type, ETag, Last-Modified');
  res.setHeader('Accept-Ranges', 'bytes');
  res.setHeader('X-Content-Type-Options', 'nosniff');

  if (!range || range.startsWith('bytes=0-')) {
    incrementVideoViews(videoRecord.id).catch(() => {});
  }

  if (req.method === 'HEAD') {
    res.setHeader('Content-Type', videoRecord.mime_type || 'video/mp4');
    res.setHeader('Content-Length', fileSize);
    return res.status(200).end();
  }

  if (fileSize <= 0) {
    res.status(404).json({ error: 'Video fayli ma\'lumotlar bazasida topilmadi.' });
    return;
  }

  let start = 0;
  let end = fileSize - 1;

  if (range) {
    const parts = range.replace(/bytes=/, '').split('-');
    start = parseInt(parts[0], 10);
    end = parts[1] ? parseInt(parts[1], 10) : end;
    
    if (isNaN(start) || start >= fileSize) {
      res.status(416).setHeader('Content-Range', `bytes */${fileSize}`);
      return res.end();
    }
    if (isNaN(end) || end >= fileSize) {
      // 8MB standard buffer window
      end = Math.min(start + (1024 * 1024 * 8) - 1, fileSize - 1);
    }
    
    res.writeHead(206, {
      'Content-Range': `bytes ${start}-${end}/${fileSize}`,
      'Content-Length': end - start + 1,
      'Content-Type': videoRecord.mime_type || 'video/mp4',
      'Cache-Control': 'public, max-age=31536000, immutable',
    });
  } else {
    res.writeHead(200, {
      'Content-Length': fileSize,
      'Content-Type': videoRecord.mime_type || 'video/mp4',
      'Cache-Control': 'public, max-age=86400',
    });
  }

  try {
    const pool = await getDbPool();
    if (!pool) {
      return res.end();
    }

    const startChunk = Math.floor(start / CHUNK_SIZE);
    const endChunk = Math.floor(end / CHUNK_SIZE);

    for (let c = startChunk; c <= endChunk; c++) {
      // Fetch only the specific chunk needed
      const dbRes = await pool.query('SELECT data FROM video_chunks WHERE video_id = $1 AND chunk_index = $2', [videoRecord.id, c]);
      if (dbRes.rows.length > 0) {
        let chunkData: Buffer = dbRes.rows[0].data;
        if (!Buffer.isBuffer(chunkData)) {
          chunkData = Buffer.from(chunkData);
        }
        let chunkStartOffset = (c === startChunk) ? start % CHUNK_SIZE : 0;
        let chunkEndOffset = (c === endChunk) ? end % CHUNK_SIZE : chunkData.length - 1;
        
        // Ensure bounds are valid
        chunkStartOffset = Math.max(0, Math.min(chunkStartOffset, chunkData.length - 1));
        chunkEndOffset = Math.max(chunkStartOffset, Math.min(chunkEndOffset, chunkData.length - 1));

        const slice = chunkData.subarray(chunkStartOffset, chunkEndOffset + 1);
        const canContinue = res.write(slice);
        
        if (!canContinue) {
          await new Promise<void>(resolve => res.once('drain', resolve));
        }
      }
    }
    res.end();
  } catch (err: any) {
    console.error('[DB Stream error]', err);
    if (!res.headersSent) res.status(500).end();
    else res.end();
  }
}

export async function restoreVideoFromPostgres(videoId: string, targetPath: string): Promise<boolean> {
  try {
    const pool = await getDbPool();
    // Check if video has chunks
    const chunkCountRes = await pool.query('SELECT COUNT(*) as count FROM video_chunks WHERE video_id = $1', [videoId]);
    const totalChunks = parseInt(chunkCountRes.rows[0].count, 10);

    if (totalChunks === 0) {
      return false;
    }

    // Verify if backup is complete
    const videoRes = await pool.query('SELECT file_size FROM videos WHERE id = $1', [videoId]);
    if (videoRes.rows.length > 0) {
      const fileSize = parseInt(videoRes.rows[0].file_size, 10);
      const expectedChunks = Math.ceil(fileSize / (5 * 1024 * 1024));
      if (totalChunks < expectedChunks) {
        console.error(`[PostgreSQL] Warning: Video (${videoId}) backup is incomplete. Found ${totalChunks}/${expectedChunks} chunks.`);
        // Note: we still try to restore what we have, as partial video is better than no video.
      }
    }

    const dir = path.dirname(targetPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const writeStream = fs.createWriteStream(targetPath);
    console.log(`[PostgreSQL] Restoring video (${videoId}) to disk cache in ${totalChunks} chunks...`);

    for (let c = 0; c < totalChunks; c++) {
      const res = await pool.query(
        `SELECT data FROM video_chunks WHERE video_id = $1 AND chunk_index = $2`,
        [videoId, c]
      );
      if (res.rows.length > 0) {
        writeStream.write(res.rows[0].data);
      }
    }
    
    writeStream.end();

    await new Promise<void>((resolve, reject) => {
      writeStream.on('finish', () => resolve());
      writeStream.on('error', reject);
    });

    console.log(`[PostgreSQL] Video (${videoId}) restored successfully from database to disk cache.`);
    return true;
  } catch (err) {
    console.error(`[PostgreSQL] Failed to restore video from database:`, err);
    return false;
  }
}

export async function backupVideoToPostgres(videoId: string, filePath: string) {
  try {
    const pool = await getDbPool();
    if (!pool || !fs.existsSync(filePath)) return false;

    console.log(`[PostgreSQL] Starting background backup for video ${videoId}...`);
    
    // Check if it already exists (resume/skip check)
    const existingRes = await pool.query('SELECT COUNT(*) as count FROM video_chunks WHERE video_id = $1', [videoId]);
    const existingChunks = parseInt(existingRes.rows[0].count, 10);
    
    const CHUNK_SIZE = 5 * 1024 * 1024; // 5MB
    const stats = fs.statSync(filePath);
    const totalChunks = Math.ceil(stats.size / CHUNK_SIZE);
    
    if (existingChunks >= totalChunks) {
      console.log(`[PostgreSQL] Backup for ${videoId} already complete.`);
      return true;
    }
    
    // Open file to read chunks safely without huge RAM allocations
    const fd = fs.openSync(filePath, 'r');
    const buffer = Buffer.alloc(CHUNK_SIZE);

    for (let c = 0; c < totalChunks; c++) {
      const bytesRead = fs.readSync(fd, buffer, 0, CHUNK_SIZE, c * CHUNK_SIZE);
      if (bytesRead > 0) {
        const slice = buffer.subarray(0, bytesRead);
        await pool.query(
          `INSERT INTO video_chunks (video_id, chunk_index, data, chunk_size)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (video_id, chunk_index) DO UPDATE SET data = $3, chunk_size = $4`,
          [videoId, c, slice, bytesRead]
        );
      }
    }
    
    fs.closeSync(fd);
    console.log(`[PostgreSQL] Video (${videoId}) successfully backed up in ${totalChunks} chunks.`);
    return true;
  } catch (err) {
    console.error(`[PostgreSQL] Failed to backup video ${videoId}:`, err);
    return false;
  }
}

async function incrementVideoViews(videoId: string) {
  try {
    const pool = await getDbPool();
    await pool.query('UPDATE videos SET views_count = views_count + 1 WHERE id = $1', [videoId]);
  } catch (err) {
    // Ignore tracking errors to not affect playback
  }
}
