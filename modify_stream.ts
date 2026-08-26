import fs from 'fs';

const code = fs.readFileSync('server/stream.ts', 'utf8');

const serveDirectlyFunc = `
const currentlyRestoring = new Set<string>();

async function serveDirectlyFromPostgres(req: Request, res: Response, videoRecord: any) {
  const CHUNK_SIZE = 5 * 1024 * 1024; // DB chunk size
  const fileSize = parseInt(videoRecord.file_size, 10);
  const range = req.headers.range;

  if (!range || range.startsWith('bytes=0-')) {
    incrementVideoViews(videoRecord.id).catch(() => {});
  }

  if (req.method === 'HEAD') {
    res.setHeader('Content-Type', videoRecord.mime_type || 'video/mp4');
    res.setHeader('Content-Length', fileSize);
    return res.status(200).end();
  }

  let start = 0;
  let end = fileSize - 1;

  if (range) {
    const parts = range.replace(/bytes=/, '').split('-');
    start = parseInt(parts[0], 10);
    end = parts[1] ? parseInt(parts[1], 10) : end;
    
    if (isNaN(start) || start >= fileSize) {
      res.status(416).setHeader('Content-Range', \`bytes */\${fileSize}\`);
      return res.end();
    }
    if (isNaN(end) || end >= fileSize) {
      // 16MB standard request size
      end = Math.min(start + (1024 * 1024 * 16) - 1, fileSize - 1);
    }
    
    res.writeHead(206, {
      'Content-Range': \`bytes \${start}-\${end}/\${fileSize}\`,
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
    if (!pool) return res.end();

    const startChunk = Math.floor(start / CHUNK_SIZE);
    const endChunk = Math.floor(end / CHUNK_SIZE);

    for (let c = startChunk; c <= endChunk; c++) {
      // Fetch only the specific chunk needed
      const dbRes = await pool.query('SELECT data FROM video_chunks WHERE video_id = $1 AND chunk_index = $2', [videoRecord.id, c]);
      if (dbRes.rows.length > 0) {
        let chunkData: Buffer = dbRes.rows[0].data;
        let chunkStartOffset = (c === startChunk) ? start % CHUNK_SIZE : 0;
        let chunkEndOffset = (c === endChunk) ? end % CHUNK_SIZE : chunkData.length - 1;
        
        const slice = chunkData.subarray(chunkStartOffset, chunkEndOffset + 1);
        const canContinue = res.write(slice);
        
        if (!canContinue) {
          await new Promise<void>(resolve => res.once('drain', resolve));
        }
      }
    }
    res.end();
  } catch (err) {
    console.error('[DB Stream error]', err);
    if (!res.headersSent) res.status(500).end();
    else res.end();
  }
}
`;

// Replace the disk-restore logic in handleVideoStream
let newCode = code.replace(
  `  } else if (!filePath || !fs.existsSync(filePath)) {
    // If missing on disk, try restoring from database
    const recovered = await restoreVideoFromPostgres(videoRecord.id, localUploadPath);
    if (recovered) {
      filePath = localUploadPath;
    } else {
      console.error(\`[handleVideoStream] File not found on disk (\${localUploadPath}) or DB for video:\`, videoRecord.id);
      return res.status(404).json({ error: 'Video fayli topilmadi.' });
    }
  }`,
  `  } else if (!filePath || !fs.existsSync(localUploadPath)) {
    // If missing on disk, serve instantly directly from database!
    if (!currentlyRestoring.has(videoRecord.id)) {
      currentlyRestoring.add(videoRecord.id);
      // Run disk restore in background so subsequent streams are purely disk I/O
      restoreVideoFromPostgres(videoRecord.id, localUploadPath)
        .finally(() => currentlyRestoring.delete(videoRecord.id))
        .catch(console.error);
    }
    return serveDirectlyFromPostgres(req, res, videoRecord);
  }`
);

// Append the serveDirectlyFunc and currentlyRestoring var just before restoreVideoFromPostgres
newCode = newCode.replace(
  'export async function restoreVideoFromPostgres',
  serveDirectlyFunc + '\\nexport async function restoreVideoFromPostgres'
);

fs.writeFileSync('server/stream.ts', newCode);
console.log('Successfully updated stream.ts');
