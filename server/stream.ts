import fs from 'fs';
import path from 'path';
import { Request, Response } from 'express';
import { getDbPool } from './db.js';

const CHUNK_SIZE = 1024 * 1024 * 16; // 16MB optimal chunk size for supercharged buffering & instant seek
const UPLOAD_DIR = path.join(process.cwd(), 'uploads', 'videos');

export async function handleVideoStream(req: Request, res: Response, videoRecord: any) {
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

  // Check disk paths
  if (fs.existsSync(localUploadPath)) {
    filePath = localUploadPath;
  } else if (!filePath || !fs.existsSync(filePath)) {
    // If missing on disk, try restoring from database
    const recovered = await restoreVideoFromPostgres(videoRecord.id, localUploadPath);
    if (recovered) {
      filePath = localUploadPath;
    } else {
      console.error(`[handleVideoStream] File not found on disk (${localUploadPath}) or DB for video:`, videoRecord.id);
      return res.status(404).json({ error: 'Video fayli topilmadi.' });
    }
  }

  const stat = fs.statSync(filePath);
  const fileSize = stat.size || parseInt(videoRecord.file_size, 10);
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
}

async function restoreVideoFromPostgres(videoId: string, targetPath: string): Promise<boolean> {
  try {
    const pool = await getDbPool();
    const result = await pool.query(
      `SELECT chunk_index, data FROM video_chunks WHERE video_id = $1 ORDER BY chunk_index ASC`,
      [videoId]
    );

    if (result.rows.length === 0) {
      return false;
    }

    const dir = path.dirname(targetPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const writeStream = fs.createWriteStream(targetPath);
    for (const row of result.rows) {
      writeStream.write(row.data);
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

async function incrementVideoViews(videoId: string) {
  try {
    const pool = await getDbPool();
    await pool.query('UPDATE videos SET views_count = views_count + 1 WHERE id = $1', [videoId]);
  } catch (err) {
    // Ignore tracking errors to not affect playback
  }
}
