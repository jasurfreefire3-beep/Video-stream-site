import express, { Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { 
  getDbPool, 
  checkDbHealth, 
  getDbConfig, 
  updateDbCredentials,
  getLocalVideos,
  saveLocalVideo,
  deleteLocalVideo
} from './db.js';
import { verifyAdminPassword, generateAdminToken, requireAdminAuth, AuthRequest } from './auth.js';
import { isRequestAuthorized, refererOriginMiddleware, generateStreamToken, getAllowedDomains, updateAllowedDomains } from './security.js';
import { handleVideoStream, restoreVideoFromPostgres, backupVideoToPostgres } from './stream.js';
import { convertMp4ToHls, isHlsReady, getHlsDir } from './hls.js';
import { generateUzbekSubtitles } from './subtitles-ai.js';

const router = express.Router();

// Ensure upload directories exist
const UPLOAD_DIR = path.join(process.cwd(), 'uploads', 'videos');
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const TEMP_DIR = path.join(process.cwd(), 'uploads', 'temp');
if (!fs.existsSync(TEMP_DIR)) {
  fs.mkdirSync(TEMP_DIR, { recursive: true });
}

// Storage setup for standard Multer
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOAD_DIR);
  },
  filename: (req, file, cb) => {
    const cleanName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    const uniqueSuffix = Date.now() + '_' + Math.round(Math.random() * 1e6);
    const ext = path.extname(cleanName) || '.mp4';
    cb(null, `anime_${uniqueSuffix}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: 4 * 1024 * 1024 * 1024, // 4GB max per video
  },
});

// Storage setup for Chunked Uploads
const chunkStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadId = (req.query.uploadId as string) || (req.body && req.body.uploadId);
    if (!uploadId || typeof uploadId !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(uploadId)) {
      return cb(new Error('Yaroqsiz uploadId sessiyasi'), '');
    }
    const dir = path.join(TEMP_DIR, uploadId);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const chunkIndex = (req.query.chunkIndex as string) || (req.body && req.body.chunkIndex) || '0';
    cb(null, `chunk_${chunkIndex}`);
  },
});

const uploadChunk = multer({
  storage: chunkStorage,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB per chunk max
  },
});

/* ==================== AUTHENTICATION ==================== */

// Login with password
router.post('/auth/login', (req: Request, res: Response) => {
  const { password } = req.body;
  if (!password) {
    return res.status(400).json({ error: 'Parol kiritilishi shart.' });
  }

  if (verifyAdminPassword(password)) {
    const token = generateAdminToken();
    return res.json({
      success: true,
      token,
      message: 'Muvaffaqiyatli tizimga kirildi.',
    });
  }

  return res.status(401).json({ error: 'Noto\'g\'ri parol kiritildi.' });
});

// Check auth status
const checkAuthHandler = (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.json({ authenticated: false });
  }

  const token = authHeader.split(' ')[1];
  try {
    const jwt = require('jsonwebtoken');
    const JWT_SECRET = process.env.JWT_SECRET || 'animem-uz-secure-jwt-key-2026';
    jwt.verify(token, JWT_SECRET);
    return res.json({ authenticated: true });
  } catch (err) {
    return res.json({ authenticated: false });
  }
};

router.get('/auth/status', checkAuthHandler);
router.get('/auth/check', checkAuthHandler);

/* ==================== DATABASE HEALTH & CONFIG ==================== */

const getHealthHandler = async (req: Request, res: Response) => {
  const health = await checkDbHealth();
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    ...health,
  });
};

router.get('/health', getHealthHandler);
router.get('/database/status', getHealthHandler);

router.post('/database/config', requireAdminAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { host, port, database, user, password } = req.body;
    updateDbCredentials({
      ...(host && { host }),
      ...(port && { port: parseInt(port, 10) }),
      ...(database && { database }),
      ...(user && { user }),
      ...(password && { password }),
    });

    const health = await checkDbHealth();
    res.json({
      success: true,
      message: health.connected ? 'PostgreSQL ga muvaffaqiyatli ulandi!' : 'Ulanishda xatolik: ' + health.error,
      health,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/* ==================== VIDEO UPLOAD & CRUD (POSTGRESQL + LOCAL + HLS) ==================== */

// 1. Initialize Chunk Upload
router.post('/videos/upload-chunk-init', requireAdminAuth, (req: AuthRequest, res: Response) => {
  const uploadId = 'up_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 8);
  const dir = path.join(TEMP_DIR, uploadId);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  res.json({
    success: true,
    uploadId,
    chunkSize: 5 * 1024 * 1024,
    message: 'Bo\'laklab yuklash sessiyasi ochildi.',
  });
});

// 2. Upload Single Chunk Slice
router.post('/videos/upload-chunk', requireAdminAuth, (req: AuthRequest, res: Response) => {
  uploadChunk.single('chunk')(req, res, (err: any) => {
    if (err) {
      console.error('[Upload Chunk Error]:', err.message);
      return res.status(400).json({ error: err.message || 'Bo\'lakni yuklashda xatolik yuz berdi.' });
    }
    try {
      const uploadId = (req.query.uploadId as string) || req.body?.uploadId;
      const chunkIndex = (req.query.chunkIndex as string) || req.body?.chunkIndex;
      if (!req.file) {
        return res.status(400).json({ error: 'Bo\'lak fayli kelmadi.' });
      }
      res.json({
        success: true,
        uploadId,
        chunkIndex: parseInt(chunkIndex || '0', 10),
        receivedBytes: req.file.size,
      });
    } catch (routeErr: any) {
      res.status(500).json({ error: routeErr.message });
    }
  });
});

// 3. Complete & Merge Chunk Upload, Save to DB & trigger fast HLS conversion
router.post('/videos/upload-chunk-complete', requireAdminAuth, async (req: AuthRequest, res: Response) => {
  try {
    const {
      uploadId,
      totalChunks,
      fileName,
      title,
      anime_title,
      episode_number,
      season_number,
      quality,
      language,
      duration,
      poster_url,
      allowed_domain,
      description,
      genres,
      release_year,
      metadata,
    } = req.body;

    if (!uploadId || !totalChunks) {
      return res.status(400).json({ error: 'uploadId va totalChunks ko\'rsatilishi shart.' });
    }

    const chunkDir = path.join(TEMP_DIR, uploadId);
    if (!fs.existsSync(chunkDir)) {
      return res.status(404).json({ error: 'Yuklangan bo\'laklar vaqtincha papkada topilmadi.' });
    }

    const cleanName = (fileName || 'anime.mp4').replace(/[^a-zA-Z0-9._-]/g, '_');
    const uniqueSuffix = Date.now() + '_' + Math.round(Math.random() * 1e6);
    const ext = path.extname(cleanName) || '.mp4';
    const finalFileName = `anime_${uniqueSuffix}${ext}`;
    const finalFilePath = path.join(UPLOAD_DIR, finalFileName);

    const total = parseInt(totalChunks, 10);
    if (fs.existsSync(finalFilePath)) {
      fs.unlinkSync(finalFilePath);
    }

    let totalSize = 0;
    for (let i = 0; i < total; i++) {
      const chunkPath = path.join(chunkDir, `chunk_${i}`);
      if (!fs.existsSync(chunkPath)) {
        if (fs.existsSync(finalFilePath)) fs.unlinkSync(finalFilePath);
        return res.status(400).json({ error: `Bo'lak ${i + 1}/${total} topilmadi. Qaytadan yuklang.` });
      }
      const chunkBuffer = fs.readFileSync(chunkPath);
      totalSize += chunkBuffer.length;
      fs.appendFileSync(finalFilePath, chunkBuffer);
    }

    // Clean up temporary chunk files safely in background
    setTimeout(() => {
      try {
        fs.rmSync(chunkDir, { recursive: true, force: true });
      } catch (e) {}
    }, 1000);

    const videoId = 'vid_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 7);
    const videoTitle = title || cleanName.replace(/\.[^/.]+$/, '');
    const animeTitle = anime_title || 'Noma\'lum Anime';
    const epNum = parseInt(episode_number, 10) || 1;
    const seasonNum = parseInt(season_number, 10) || 1;
    const vidQuality = quality || '1080p';
    const vidLang = language || 'O\'zbekcha (Tarjima)';
    const vidDuration = parseFloat(duration) || 0;
    const vidDomain = allowed_domain || 'animem.uz';
    const vidDesc = description || null;
    const vidGenres = genres || null;
    const vidYear = release_year ? parseInt(release_year, 10) : null;
    const vidMeta = metadata || null;

    const videoRecord = {
      id: videoId,
      title: videoTitle,
      anime_title: animeTitle,
      episode_number: epNum,
      season_number: seasonNum,
      quality: vidQuality,
      language: vidLang,
      file_name: finalFileName,
      file_path: finalFilePath,
      file_size: totalSize,
      duration: vidDuration,
      mime_type: 'video/mp4',
      views_count: 0,
      is_active: true,
      allowed_domain: vidDomain,
      poster_url: poster_url || null,
      description: vidDesc,
      genres: vidGenres,
      release_year: vidYear,
      metadata: vidMeta,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    // Save metadata immediately to PostgreSQL and local storage
    try {
      const pool = await getDbPool();
      if (pool) {
        await pool.query(
          `INSERT INTO videos (
            id, title, anime_title, episode_number, season_number, quality, language,
            file_name, file_path, file_size, duration, mime_type, allowed_domain, poster_url,
            description, genres, release_year, metadata
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
          ON CONFLICT (id) DO UPDATE SET
            title = EXCLUDED.title,
            anime_title = EXCLUDED.anime_title,
            episode_number = EXCLUDED.episode_number,
            season_number = EXCLUDED.season_number,
            quality = EXCLUDED.quality,
            language = EXCLUDED.language,
            poster_url = EXCLUDED.poster_url,
            description = EXCLUDED.description,
            genres = EXCLUDED.genres,
            release_year = EXCLUDED.release_year,
            metadata = EXCLUDED.metadata,
            updated_at = NOW()`,
          [
            videoId,
            videoTitle,
            animeTitle,
            epNum,
            seasonNum,
            vidQuality,
            vidLang,
            finalFileName,
            finalFilePath,
            totalSize,
            vidDuration,
            'video/mp4',
            vidDomain,
            poster_url || null,
            vidDesc,
            vidGenres,
            vidYear,
            vidMeta ? JSON.stringify(vidMeta) : null,
          ]
        );
      }

      // Asynchronous background chunk backup into PostgreSQL
      setTimeout(() => {
        backupVideoToPostgres(videoId, finalFilePath).catch(err => {
          console.warn('[Background PG Chunk Backup Warning]:', err);
        });
      }, 100);
    } catch (pgErr: any) {
      console.warn('[PostgreSQL Save Warning, falling back to local]', pgErr.message);
    }

    saveLocalVideo(videoRecord);

    // Fast background HLS conversion (uses codec copy, runs in 1-2s with minimal RAM)
    convertMp4ToHls(videoId, finalFilePath).catch((err) => {
      console.warn('[Background HLS Convert Warning]:', err);
    });

    const streamToken = generateStreamToken(videoId, 1440);
    const baseUrl = `${req.protocol}://${req.get('host')}`;

    res.status(201).json({
      success: true,
      message: 'Video muvaffaqiyatli yuklandi va HLS oqimiga tayyorlandi!',
      video: {
        ...videoRecord,
        embed_url: `${baseUrl}/embed/${videoId}`,
        stream_url: `${baseUrl}/api/stream/${videoId}?token=${streamToken}`,
        hls_url: `${baseUrl}/api/hls/${videoId}/index.m3u8?token=${streamToken}`,
      },
    });
  } catch (err: any) {
    console.error('[Upload Chunk Complete Error]', err);
    res.status(500).json({ error: 'Yuklashda xatolik: ' + err.message });
  }
});

// 4. Cancel Chunk Upload
router.post('/videos/upload-chunk-cancel', requireAdminAuth, (req: AuthRequest, res: Response) => {
  const { uploadId } = req.body;
  if (uploadId) {
    const chunkDir = path.join(TEMP_DIR, uploadId);
    if (fs.existsSync(chunkDir)) {
      fs.rmSync(chunkDir, { recursive: true, force: true });
    }
  }
  res.json({ success: true, message: 'Bekor qilindi.' });
});

// Single Video Upload endpoint
router.post('/videos/upload', requireAdminAuth, upload.single('video'), async (req: AuthRequest, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Hech qanday video fayl tanlanmadi.' });
    }

    const {
      title,
      anime_title,
      episode_number,
      season_number,
      quality,
      language,
      duration,
      poster_url,
      allowed_domain,
      description,
      genres,
      release_year,
      metadata,
    } = req.body;

    const videoId = 'vid_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 7);
    const videoTitle = title || req.file.originalname.replace(/\.[^/.]+$/, '');
    const animeTitle = anime_title || 'Noma\'lum Anime';
    const epNum = parseInt(episode_number, 10) || 1;
    const seasonNum = parseInt(season_number, 10) || 1;
    const vidQuality = quality || '1080p';
    const vidLang = language || 'O\'zbekcha (Tarjima)';
    const vidDuration = parseFloat(duration) || 0;
    const vidDomain = allowed_domain || 'animem.uz';
    const vidDesc = description || null;
    const vidGenres = genres || null;
    const vidYear = release_year ? parseInt(release_year, 10) : null;
    const vidMeta = metadata || null;

    const videoRecord = {
      id: videoId,
      title: videoTitle,
      anime_title: animeTitle,
      episode_number: epNum,
      season_number: seasonNum,
      quality: vidQuality,
      language: vidLang,
      file_name: req.file.filename,
      file_path: req.file.path,
      file_size: req.file.size,
      duration: vidDuration,
      mime_type: req.file.mimetype || 'video/mp4',
      views_count: 0,
      is_active: true,
      allowed_domain: vidDomain,
      poster_url: poster_url || null,
      description: vidDesc,
      genres: vidGenres,
      release_year: vidYear,
      metadata: vidMeta,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    try {
      const pool = await getDbPool();
      if (pool) {
        await pool.query(
          `INSERT INTO videos (
            id, title, anime_title, episode_number, season_number, quality, language,
            file_name, file_path, file_size, duration, mime_type, allowed_domain, poster_url,
            description, genres, release_year, metadata
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
          ON CONFLICT (id) DO UPDATE SET
            title = EXCLUDED.title,
            anime_title = EXCLUDED.anime_title,
            episode_number = EXCLUDED.episode_number,
            season_number = EXCLUDED.season_number,
            quality = EXCLUDED.quality,
            language = EXCLUDED.language,
            poster_url = EXCLUDED.poster_url,
            description = EXCLUDED.description,
            genres = EXCLUDED.genres,
            release_year = EXCLUDED.release_year,
            metadata = EXCLUDED.metadata,
            updated_at = NOW()`,
          [
            videoId,
            videoTitle,
            animeTitle,
            epNum,
            seasonNum,
            vidQuality,
            vidLang,
            req.file.filename,
            req.file.path,
            req.file.size,
            vidDuration,
            req.file.mimetype || 'video/mp4',
            vidDomain,
            poster_url || null,
            vidDesc,
            vidGenres,
            vidYear,
            vidMeta ? JSON.stringify(vidMeta) : null,
          ]
        );
      }

      // Asynchronous background chunk backup into PostgreSQL
      setTimeout(() => {
        backupVideoToPostgres(videoId, req.file!.path).catch(err => {
          console.warn('[Background PG Chunk Backup Warning]:', err);
        });
      }, 100);
    } catch (pgErr: any) {
      console.warn('[PostgreSQL Upload Warning, saving locally]', pgErr.message);
    }

    saveLocalVideo(videoRecord);

    // Fast background HLS conversion
    convertMp4ToHls(videoId, req.file.path).catch((err) => {
      console.warn('[Background HLS Convert Warning]:', err);
    });

    const streamToken = generateStreamToken(videoId, 1440);
    const baseUrl = `${req.protocol}://${req.get('host')}`;

    res.status(201).json({
      success: true,
      message: 'Video muvaffaqiyatli yuklandi va HLS ga o\'tkazildi!',
      video: {
        ...videoRecord,
        embed_url: `${baseUrl}/embed/${videoId}`,
        stream_url: `${baseUrl}/api/stream/${videoId}?token=${streamToken}`,
        hls_url: `${baseUrl}/api/hls/${videoId}/index.m3u8?token=${streamToken}`,
      },
    });
  } catch (err: any) {
    console.error('[Upload Error]', err);
    res.status(500).json({ error: 'Video yuklashda xatolik yuz berdi: ' + err.message });
  }
});

// List all videos with search and filters
// Apply Referer / Origin domain protection middleware (Animem.uz Domain restriction)
router.use(refererOriginMiddleware);

router.get('/videos', async (req: Request, res: Response) => {
  try {
    const search = ((req.query.search as string) || '').toLowerCase();
    const anime = (req.query.anime as string) || '';
    const quality = (req.query.quality as string) || '';
    const baseUrl = `${req.protocol}://${req.get('host')}`;

    let videoList: any[] = [];

    try {
      const pool = await getDbPool();
      if (!pool) throw new Error('Database pool not ready');
      let query = 'SELECT * FROM videos WHERE is_active = TRUE';
      const params: any[] = [];
      let pIdx = 1;

      if (search) {
        query += ` AND (title ILIKE $${pIdx} OR anime_title ILIKE $${pIdx + 1})`;
        params.push(`%${search}%`, `%${search}%`);
        pIdx += 2;
      }

      if (anime) {
        query += ` AND anime_title = $${pIdx}`;
        params.push(anime);
        pIdx += 1;
      }

      if (quality) {
        query += ` AND quality = $${pIdx}`;
        params.push(quality);
        pIdx += 1;
      }

      query += ` ORDER BY created_at DESC`;
      const result = await pool.query(query, params);
      videoList = result.rows;
    } catch (dbErr: any) {
      console.warn('[DB Query Fallback to Local]', dbErr.message);
      let localList = getLocalVideos().filter(v => v.is_active !== false);
      if (search) {
        localList = localList.filter(v => 
          v.title?.toLowerCase().includes(search) || 
          v.anime_title?.toLowerCase().includes(search)
        );
      }
      if (anime) {
        localList = localList.filter(v => v.anime_title === anime);
      }
      if (quality) {
        localList = localList.filter(v => v.quality === quality);
      }
      videoList = localList;
    }

    const enhanced = videoList.map((v) => ({
      ...v,
      is_hls_ready: isHlsReady(v.id),
      embed_url: `${baseUrl}/embed/${v.id}`,
      stream_url: `${baseUrl}/api/stream/${v.id}`,
      hls_url: `${baseUrl}/api/hls/${v.id}/index.m3u8`,
    }));

    return res.json({ success: true, videos: enhanced });
  } catch (err: any) {
    console.error('[List Videos Error]', err);
    res.status(200).json({ success: true, videos: getLocalVideos() });
  }
});

// Get single video details
router.get('/videos/:id', async (req: Request, res: Response) => {
  try {
    let video: any = null;
    try {
      const pool = await getDbPool();
      const result = await pool.query('SELECT * FROM videos WHERE id = $1', [req.params.id]);
      if (result.rows && result.rows.length > 0) {
        video = result.rows[0];
      }
    } catch (e) {
      // fallback
    }

    if (!video) {
      video = getLocalVideos().find(v => v.id === req.params.id);
    }

    if (!video) {
      return res.status(404).json({ error: 'Video topilmadi.' });
    }

    const streamToken = generateStreamToken(video.id, 180);
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const hlsReady = isHlsReady(video.id);

    // If HLS is not generated yet, attempt generation in background
    if (!hlsReady && fs.existsSync(video.file_path)) {
      convertMp4ToHls(video.id, video.file_path).catch(() => {});
    }

    res.json({
      success: true,
      video: {
        ...video,
        is_hls_ready: hlsReady,
        hls_url: `${baseUrl}/api/hls/${video.id}/index.m3u8?token=${streamToken}`,
        stream_url: `${baseUrl}/api/stream/${video.id}?token=${streamToken}`,
        embed_url: `${baseUrl}/embed/${video.id}`,
      },
      embed_url: `${baseUrl}/embed/${video.id}`,
      stream_url: `${baseUrl}/api/stream/${video.id}?token=${streamToken}`,
      hls_url: `${baseUrl}/api/hls/${video.id}/index.m3u8?token=${streamToken}`,
      token: streamToken,
      is_hls_ready: hlsReady,
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Ma\'lumot olishda xatolik: ' + err.message });
  }
});

// Update video metadata
router.put('/videos/:id', requireAdminAuth, async (req: AuthRequest, res: Response) => {
  try {
    const {
      title,
      anime_title,
      episode_number,
      season_number,
      quality,
      language,
      poster_url,
      allowed_domain,
      description,
      genres,
      release_year,
      metadata,
    } = req.body;
    
    try {
      const pool = await getDbPool();
      if (pool) {
        await pool.query(
          `UPDATE videos SET
            title = COALESCE($1, title),
            anime_title = COALESCE($2, anime_title),
            episode_number = COALESCE($3, episode_number),
            season_number = COALESCE($4, season_number),
            quality = COALESCE($5, quality),
            language = COALESCE($6, language),
            poster_url = COALESCE($7, poster_url),
            allowed_domain = COALESCE($8, allowed_domain),
            description = COALESCE($9, description),
            genres = COALESCE($10, genres),
            release_year = COALESCE($11, release_year),
            metadata = COALESCE($12, metadata),
            updated_at = NOW()
          WHERE id = $13`,
          [
            title,
            anime_title,
            episode_number ? parseInt(episode_number, 10) : null,
            season_number ? parseInt(season_number, 10) : null,
            quality,
            language,
            poster_url,
            allowed_domain,
            description,
            genres,
            release_year ? parseInt(release_year, 10) : null,
            metadata ? JSON.stringify(metadata) : null,
            req.params.id,
          ]
        );
      }
    } catch (e) {
      // ignore
    }

    saveLocalVideo({
      id: req.params.id,
      title,
      anime_title,
      episode_number: episode_number ? parseInt(episode_number, 10) : undefined,
      season_number: season_number ? parseInt(season_number, 10) : undefined,
      quality,
      language,
      poster_url,
      allowed_domain,
      description,
      genres,
      release_year: release_year ? parseInt(release_year, 10) : undefined,
      metadata,
      updated_at: new Date().toISOString(),
    });

    res.json({ success: true, message: 'Video va uning barcha metama\'lumotlari PostgreSQL ga saqlandi.' });
  } catch (err: any) {
    res.status(500).json({ error: 'Yangilashda xatolik: ' + err.message });
  }
});

// Delete video
router.delete('/videos/:id', requireAdminAuth, async (req: AuthRequest, res: Response) => {
  try {
    const pool = await getDbPool().catch(() => null);
    if (pool) {
      const result = await pool.query('SELECT * FROM videos WHERE id = $1', [req.params.id]).catch(() => null);
      if (result && result.rows && result.rows.length > 0) {
        const video = result.rows[0];
        if (fs.existsSync(video.file_path)) {
          try { fs.unlinkSync(video.file_path); } catch (e) {}
        }
      }
      await pool.query('DELETE FROM videos WHERE id = $1', [req.params.id]).catch(() => {});
    }

    // Clean up HLS directory
    const hlsDir = getHlsDir(req.params.id);
    if (fs.existsSync(hlsDir)) {
      try { fs.rmSync(hlsDir, { recursive: true, force: true }); } catch (e) {}
    }

    deleteLocalVideo(req.params.id);
    res.json({ success: true, message: 'Video to\'liq o\'chirildi.' });
  } catch (err: any) {
    deleteLocalVideo(req.params.id);
    res.json({ success: true, message: 'Video o\'chirildi.' });
  }
});

/* ==================== HLS (M3U8 & TS) STREAMING ==================== */

// Handle CORS Preflight for HLS and Streaming
router.options(['/hls/:id', '/hls/:id/:file', '/stream/:id'], (req: Request, res: Response) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Range, Authorization');
  res.sendStatus(204);
});

// Single Unified & Robust HLS Handler (m3u8 playlist + .ts chunks)
router.get('/hls/:id/:file?', async (req: Request, res: Response) => {
  try {
    const videoId = req.params.id;
    let requestedFile = (req.params.file || 'index.m3u8').trim();
    const token = req.query.token as string;
    const preview = req.query.preview === '1';

    // Set open CORS headers on all HLS responses
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Range, Authorization');

    // Security & Hotlink protection check
    if (!preview) {
      const auth = await isRequestAuthorized(req, token);
      if (!auth.authorized) {
        return res.status(403).json({
          error: 'Hotlink Protection Blocked',
          message: auth.reason || 'Ushbu video faqat Animem.uz domenida ko\'rish uchun himoyalangan!',
        });
      }
    }

    let video: any = null;
    try {
      const pool = await getDbPool();
      if (pool) {
        const result = await pool.query('SELECT * FROM videos WHERE id = $1', [videoId]);
        if (result.rows && result.rows.length > 0) {
          video = result.rows[0];
        }
      }
    } catch (e) {}

    if (!video) {
      video = getLocalVideos().find(v => v.id === videoId);
    }

    if (!video) {
      return res.status(404).json({ error: 'Video topilmadi.' });
    }

    const hlsDir = getHlsDir(videoId);
    const m3u8Path = path.join(hlsDir, 'index.m3u8');
    
    let filePath = video.file_path;
    const fileName = video.file_name || (filePath ? path.basename(filePath) : `${video.id}.mp4`);
    const UPLOAD_DIR = path.join(process.cwd(), 'uploads', 'videos');
    const localUploadPath = path.join(UPLOAD_DIR, fileName);
    
    if (fs.existsSync(localUploadPath)) {
      filePath = localUploadPath;
    }

    // If HLS does not exist yet, generate on the fly
    if (!fs.existsSync(m3u8Path)) {
      let mp4Exists = fs.existsSync(filePath);
      if (!mp4Exists) {
        console.log(`[HLS] MP4 not found on disk. Restoring from PostgreSQL for ${videoId}...`);
        mp4Exists = await restoreVideoFromPostgres(videoId, localUploadPath);
        if (mp4Exists) filePath = localUploadPath;
      }
      
      if (mp4Exists) {
        await convertMp4ToHls(videoId, filePath);
      } else {
        return res.status(404).json({ error: 'HLS video fayli mavjud emas.' });
      }
    }

    // 1. Serve M3U8 Master / Media Playlist
    if (requestedFile === 'index.m3u8' || requestedFile.endsWith('.m3u8') || !requestedFile.includes('.')) {
      if (!fs.existsSync(m3u8Path)) {
        return res.status(404).json({ error: 'Playlist topilmadi.' });
      }

      let content = fs.readFileSync(m3u8Path, 'utf-8');

      // Append token & preview parameters to all .ts chunk URLs in playlist
      const queryParams: string[] = [];
      if (token) queryParams.push(`token=${encodeURIComponent(token)}`);
      if (preview) queryParams.push(`preview=1`);
      const queryString = queryParams.length > 0 ? `?${queryParams.join('&')}` : '';

      if (queryString) {
        content = content.replace(/^(index\d+\.ts|[a-zA-Z0-9_-]+\.ts)/gm, (match) => `${match}${queryString}`);
      }

      res.setHeader('Content-Type', 'application/vnd.apple.mpegurl; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      return res.send(content);
    }

    // 2. Serve .TS Video Segments (e.g. index0.ts, index1.ts...)
    if (requestedFile.endsWith('.ts')) {
      const safeFile = requestedFile.replace(/[^a-zA-Z0-9._-]/g, '');
      const segmentPath = path.join(hlsDir, safeFile);

      if (!fs.existsSync(segmentPath)) {
        return res.status(404).send('Segment not found');
      }

      res.setHeader('Content-Type', 'video/MP2T');
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      const readStream = fs.createReadStream(segmentPath);
      return readStream.pipe(res);
    }

    return res.status(404).send('Not found');
  } catch (err: any) {
    console.error('[HLS Route Error]', err);
    res.status(500).json({ error: 'HLS oqimida xatolik: ' + err.message });
  }
});

/* ==================== STANDARD HTTP 206 MP4 STREAMING ==================== */

router.get('/stream/:id', async (req: Request, res: Response) => {
  try {
    const videoId = req.params.id;
    const token = req.query.token as string;
    const preview = req.query.preview === '1';

    if (!preview) {
      const auth = await isRequestAuthorized(req, token);
      if (!auth.authorized) {
        return res.status(403).json({
          error: 'Hotlink Protection Blocked',
          message: auth.reason || 'Ushbu video faqat Animem.uz domenida ko\'rish uchun himoyalangan!',
        });
      }
    }

    let video: any = null;
    try {
      const pool = await getDbPool();
      const result = await pool.query('SELECT * FROM videos WHERE id = $1', [videoId]);
      if (result.rows && result.rows.length > 0) {
        video = result.rows[0];
      }
    } catch (e) {}

    if (!video) {
      video = getLocalVideos().find(v => v.id === videoId);
    }

    if (!video) {
      return res.status(404).json({ error: 'Video topilmadi.' });
    }

    await handleVideoStream(req, res, video);
  } catch (err: any) {
    console.error('[Stream Error]', err);
    res.status(500).json({ error: 'Video oqimida xatolik: ' + err.message });
  }
});

router.get('/stream/:id/token', async (req: Request, res: Response) => {
  const videoId = req.params.id;
  const token = generateStreamToken(videoId, 180);
  res.json({
    token,
    stream_url: `/api/stream/${videoId}?token=${token}`,
    hls_url: `/api/hls/${videoId}/index.m3u8?token=${token}`,
    expires_in: 180 * 60,
  });
});

/* ==================== SETTINGS & DOMAINS ==================== */

router.get('/settings/domains', async (req: Request, res: Response) => {
  const domains = await getAllowedDomains();
  res.json({ domains });
});

router.post('/settings/domains', requireAdminAuth, async (req: AuthRequest, res: Response) => {
  const { domains } = req.body;
  if (!Array.isArray(domains)) {
    return res.status(400).json({ error: 'Domenlar ro\'yxati massiv bo\'lishi kerak.' });
  }
  await updateAllowedDomains(domains);
  res.json({ success: true, domains, message: 'Domenlar ro\'yxati saqlandi.' });
});

/* ==================== PUBLIC API ==================== */

router.get('/v1/anime-list', async (req: Request, res: Response) => {
  try {
    const pool = await getDbPool();
    const result = await pool.query(`
      SELECT 
        anime_title,
        COUNT(*)::int as total_episodes,
        MAX(created_at) as latest_upload,
        MAX(poster_url) as poster_url
      FROM videos
      WHERE is_active = TRUE
      GROUP BY anime_title
      ORDER BY latest_upload DESC
    `);
    res.json({ success: true, anime_list: result.rows });
  } catch (err: any) {
    const allVideos = getLocalVideos();
    const grouped = Array.from(new Set(allVideos.map(v => v.anime_title))).map(title => ({
      anime_title: title,
      total_episodes: allVideos.filter(v => v.anime_title === title).length,
      latest_upload: new Date().toISOString(),
      poster_url: allVideos.find(v => v.anime_title === title)?.poster_url || null,
    }));
    res.json({ success: true, anime_list: grouped });
  }
});

router.get('/v1/anime/:animeTitle/episodes', async (req: Request, res: Response) => {
  try {
    const animeTitle = req.params.animeTitle;
    let episodes: any[] = [];
    try {
      const pool = await getDbPool();
      const result = await pool.query(
        `SELECT id, title, anime_title, episode_number, season_number, quality, language, duration, poster_url, created_at
         FROM videos 
         WHERE anime_title = $1 AND is_active = TRUE
         ORDER BY episode_number ASC`,
        [animeTitle]
      );
      episodes = result.rows;
    } catch (e) {
      episodes = getLocalVideos().filter(v => v.anime_title === animeTitle);
    }

    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const formatted = episodes.map((ep: any) => ({
      ...ep,
      embed_url: `${baseUrl}/embed/${ep.id}`,
      stream_url: `${baseUrl}/api/stream/${ep.id}?token=${generateStreamToken(ep.id, 1440)}`,
      hls_url: `${baseUrl}/api/hls/${ep.id}/index.m3u8?token=${generateStreamToken(ep.id, 1440)}`,
    }));

    res.json({
      success: true,
      anime_title: animeTitle,
      total_episodes: formatted.length,
      episodes: formatted,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// AI Subtitle Generation & Serving
router.post('/videos/:id/generate-subtitles', requireAdminAuth, async (req: AuthRequest, res: Response) => {
  try {
    const videoId = req.params.id;
    const force = req.query.force === 'true';
    const result = await generateUzbekSubtitles(videoId, force);
    if (!result.success) {
      return res.status(400).json({ error: result.error || 'Subtitr yaratishda xatolik yuz berdi.' });
    }
    res.json({
      success: true,
      message: 'O\'zbekcha subtitr muvaffaqiyatli generatsiya qilindi!',
      subtitle_url: result.subtitleUrl,
    });
  } catch (err: any) {
    console.error('[AI Subtitle Error]', err);
    res.status(500).json({ error: 'AI subtitr yaratishda xatolik: ' + err.message });
  }
});

router.get('/subtitles/:id', async (req: Request, res: Response) => {
  try {
    const videoId = req.params.id;
    const cleanId = videoId.replace(/\.vtt$/, '');
    const subtitlePath = path.join(process.cwd(), 'uploads', 'subtitles', `${cleanId}.vtt`);
    if (!fs.existsSync(subtitlePath)) {
      return res.status(404).send('WEBVTT\n\n1\n00:00:01.000 --> 00:00:04.000\nSubtitr topilmadi yoki hali generatsiya qilinmagan.');
    }
    res.setHeader('Content-Type', 'text/vtt; charset=utf-8');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    const content = fs.readFileSync(subtitlePath, 'utf-8');
    res.send(content);
  } catch (err: any) {
    res.status(500).send('WEBVTT');
  }
});

export default router;
