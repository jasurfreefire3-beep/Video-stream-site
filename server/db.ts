import pg from 'pg';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

dotenv.config();

const { Pool } = pg;

// Local in-memory / JSON fallback store
const LOCAL_STORE_FILE = path.join(process.cwd(), 'uploads', 'local_metadata.json');
let localVideosStore: any[] = [];
let localSettings: Record<string, string> = {
  allowed_domains: 'animem.uz,www.animem.uz,localhost,127.0.0.1',
};

function loadLocalStore() {
  try {
    if (fs.existsSync(LOCAL_STORE_FILE)) {
      const data = JSON.parse(fs.readFileSync(LOCAL_STORE_FILE, 'utf-8'));
      if (Array.isArray(data.videos)) localVideosStore = data.videos;
      if (data.settings) localSettings = { ...localSettings, ...data.settings };
    }
  } catch (e) {
    // ignore
  }
}
loadLocalStore();

function saveLocalStore() {
  try {
    const dir = path.dirname(LOCAL_STORE_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(LOCAL_STORE_FILE, JSON.stringify({ videos: localVideosStore, settings: localSettings }, null, 2));
  } catch (e) {
    // ignore
  }
}

// Database configuration state
let dbConfig = {
  host: process.env.PG_HOST || process.env.POSTGRES_HOST || 'psql.fr-roub1.bengt.wasmernet.com',
  port: parseInt(process.env.PG_PORT || process.env.POSTGRES_PORT || '20184', 10),
  database: process.env.PG_DATABASE || process.env.POSTGRES_DB || 'video',
  user: process.env.PG_USER || process.env.POSTGRES_USER || 'user_9f0a1bbd',
  password: process.env.PG_PASSWORD || process.env.POSTGRES_PASSWORD || 'pw_Nkmiu3Ab8L9fPXRfjABNHImvr6carZ0',
  type: 'PostgreSQL',
};

let pool: pg.Pool | null = null;
let isConnected = false;
let lastError: string | null = null;
let connectionAttemptInProgress: Promise<pg.Pool | null> | null = null;
let lastAttemptTime = 0;

export function getDbConfig() {
  return {
    ...dbConfig,
    password: dbConfig.password ? '••••••••••••' : '',
  };
}

export function updateDbCredentials(newConfig: Partial<typeof dbConfig>) {
  dbConfig = { ...dbConfig, ...newConfig };
  if (pool) {
    pool.end().catch(() => {});
    pool = null;
  }
  isConnected = false;
  lastError = null;
  lastAttemptTime = 0;
}

export async function getDbPool(): Promise<pg.Pool | null> {
  if (pool && isConnected) return pool;

  // Rate limit failed reconnection attempts to once every 10 seconds to keep app blazing fast
  const now = Date.now();
  if (!isConnected && lastError && now - lastAttemptTime < 10000) {
    return null;
  }

  if (connectionAttemptInProgress) {
    return connectionAttemptInProgress;
  }

  connectionAttemptInProgress = (async () => {
    lastAttemptTime = Date.now();
    const candidatePasswords = Array.from(
      new Set([
        dbConfig.password,
        'pw_Nkmiu3Ab8L9fPXRfjABNHImvr6carZ0',
        'pw_Nkmiu3Ab8L9fPXRfjABNHImvr6carZO',
      ])
    ).filter(Boolean);

    let lastErr: any = null;

    for (const pwd of candidatePasswords) {
      try {
        const candidatePool = new Pool({
          host: dbConfig.host,
          port: dbConfig.port,
          database: dbConfig.database,
          user: dbConfig.user,
          password: pwd,
          max: 10,
          idleTimeoutMillis: 30000,
          connectionTimeoutMillis: 3000,
          ssl: { rejectUnauthorized: false },
        });

        const client = await candidatePool.connect();
        client.release();

        console.log(`[PostgreSQL] Successfully connected to ${dbConfig.host}:${dbConfig.port}/${dbConfig.database}`);
        dbConfig.password = pwd;
        pool = candidatePool;
        isConnected = true;
        lastError = null;

        pool.on('error', (err) => {
          console.warn('[PostgreSQL Pool Warning]:', err.message);
          isConnected = false;
          lastError = err.message;
        });

        initDatabaseTables(pool).catch(() => {});
        return pool;
      } catch (err: any) {
        lastErr = err;
      }
    }

    isConnected = false;
    lastError = lastErr?.message || 'PostgreSQL ulanishda xatolik';
    return null;
  })().finally(() => {
    connectionAttemptInProgress = null;
  });

  return connectionAttemptInProgress;
}

export async function initDatabaseTables(dbPool: pg.Pool) {
  try {
    await dbPool.query(`
      CREATE TABLE IF NOT EXISTS videos (
        id VARCHAR(64) PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        anime_title VARCHAR(255) NOT NULL,
        episode_number INT DEFAULT 1,
        season_number INT DEFAULT 1,
        quality VARCHAR(32) DEFAULT '1080p',
        language VARCHAR(64) DEFAULT 'O''zbekcha (Tarjima)',
        file_name VARCHAR(255) NOT NULL,
        file_path VARCHAR(500) NOT NULL,
        file_size BIGINT NOT NULL,
        duration DOUBLE PRECISION DEFAULT 0,
        mime_type VARCHAR(64) DEFAULT 'video/mp4',
        views_count BIGINT DEFAULT 0,
        is_active BOOLEAN DEFAULT TRUE,
        allowed_domain VARCHAR(255) DEFAULT 'animem.uz',
        poster_url TEXT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_videos_anime ON videos(anime_title);
      CREATE INDEX IF NOT EXISTS idx_videos_episode ON videos(episode_number);
    `);

    await dbPool.query(`
      CREATE TABLE IF NOT EXISTS video_chunks (
        video_id VARCHAR(64) NOT NULL,
        chunk_index INT NOT NULL,
        data BYTEA NOT NULL,
        chunk_size INT NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        PRIMARY KEY (video_id, chunk_index),
        FOREIGN KEY (video_id) REFERENCES videos(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_video_chunks_id ON video_chunks(video_id);
    `);

    await dbPool.query(`
      CREATE TABLE IF NOT EXISTS stream_tokens (
        id SERIAL PRIMARY KEY,
        video_id VARCHAR(64) NOT NULL,
        token VARCHAR(128) NOT NULL UNIQUE,
        referer VARCHAR(255) NULL,
        ip_address VARCHAR(64) NULL,
        expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_stream_tokens_token ON stream_tokens(token);
      CREATE INDEX IF NOT EXISTS idx_stream_tokens_expires ON stream_tokens(expires_at);
    `);

    await dbPool.query(`
      CREATE TABLE IF NOT EXISTS cdn_settings (
        setting_key VARCHAR(64) PRIMARY KEY,
        setting_value TEXT NOT NULL,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
      INSERT INTO cdn_settings (setting_key, setting_value)
      VALUES ('allowed_domains', 'animem.uz,www.animem.uz,localhost,127.0.0.1')
      ON CONFLICT (setting_key) DO NOTHING;
    `);

    console.log('[PostgreSQL] Database tables & schemas verified');
  } catch (err: any) {
    console.warn('[PostgreSQL] Table init notice:', err.message);
  }
}

export async function checkDbHealth(): Promise<{
  connected: boolean;
  latency_ms: number;
  host?: string;
  port?: number;
  database?: string;
  user?: string;
  error?: string;
  stats?: {
    total_videos: number;
    total_size_bytes: number;
    total_views: number;
    anime_count: number;
  };
}> {
  const start = Date.now();
  try {
    const currentPool = await getDbPool();
    if (!currentPool || !isConnected) {
      throw new Error(lastError || 'PostgreSQL ga ulanish kutilyapti');
    }

    const result = await currentPool.query(`
      SELECT 
        COUNT(*)::bigint as total_videos,
        COALESCE(SUM(file_size), 0)::bigint as total_size_bytes,
        COALESCE(SUM(views_count), 0)::bigint as total_views,
        COUNT(DISTINCT anime_title)::bigint as anime_count
      FROM videos
    `);

    const latency = Date.now() - start;
    const row = result.rows[0] || {};

    return {
      connected: true,
      latency_ms: latency,
      host: dbConfig.host,
      port: dbConfig.port,
      database: dbConfig.database,
      user: dbConfig.user,
      stats: {
        total_videos: parseInt(row.total_videos || '0', 10),
        total_size_bytes: parseInt(row.total_size_bytes || '0', 10),
        total_views: parseInt(row.total_views || '0', 10),
        anime_count: parseInt(row.anime_count || '0', 10),
      },
    };
  } catch (err: any) {
    const latency = Date.now() - start;
    return {
      connected: false,
      latency_ms: latency,
      host: dbConfig.host,
      port: dbConfig.port,
      database: dbConfig.database,
      user: dbConfig.user,
      error: err.message || lastError || 'PostgreSQL ulanishida xatolik',
      stats: {
        total_videos: localVideosStore.length,
        total_size_bytes: localVideosStore.reduce((acc, v) => acc + (v.file_size || 0), 0),
        total_views: localVideosStore.reduce((acc, v) => acc + (v.views_count || 0), 0),
        anime_count: new Set(localVideosStore.map(v => v.anime_title)).size,
      }
    };
  }
}

// Fallback Helper functions for local video CRUD
export function getLocalVideos() {
  return localVideosStore;
}

export function saveLocalVideo(video: any) {
  const existingIdx = localVideosStore.findIndex(v => v.id === video.id);
  if (existingIdx >= 0) {
    localVideosStore[existingIdx] = { ...localVideosStore[existingIdx], ...video };
  } else {
    localVideosStore.unshift(video);
  }
  saveLocalStore();
}

export function deleteLocalVideo(id: string) {
  localVideosStore = localVideosStore.filter(v => v.id !== id);
  saveLocalStore();
}

export function getLocalSettings(key: string, defaultVal: string) {
  return localSettings[key] || defaultVal;
}

export function setLocalSettings(key: string, val: string) {
  localSettings[key] = val;
  saveLocalStore();
}
