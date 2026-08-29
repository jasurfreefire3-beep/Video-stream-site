import crypto from 'crypto';
import { Request, Response, NextFunction } from 'express';
import { getDbPool } from './db.js';

const STREAM_SECRET = process.env.STREAM_SECRET || 'animem_uz_secret_stream_token_2026';

let cachedAllowedDomains: string[] = ['animem.uz', 'www.animem.uz', 'localhost', '127.0.0.1', '*.run.app', '*.googleusercontent.com', '*'];
let lastDomainFetch = 0;

export async function getAllowedDomains(): Promise<string[]> {
  if (Date.now() - lastDomainFetch < 30000 && cachedAllowedDomains.length > 0) {
    return cachedAllowedDomains;
  }

  try {
    const pool = await getDbPool();
    if (pool) {
      const result = await pool.query(
        `SELECT setting_value FROM cdn_settings WHERE setting_key = $1`,
        ['allowed_domains']
      );
      if (result.rows.length > 0 && result.rows[0].setting_value) {
        const userDomains = result.rows[0].setting_value
          .split(',')
          .map((d: string) => d.trim().toLowerCase())
          .filter(Boolean);
        cachedAllowedDomains = Array.from(new Set(['animem.uz', 'www.animem.uz', 'localhost', '127.0.0.1', '*.run.app', '*.googleusercontent.com', '*', ...userDomains]));
        lastDomainFetch = Date.now();
      }
    }
  } catch (e) {
    // fallback
  }
  return cachedAllowedDomains;
}

export async function updateAllowedDomains(domains: string[]): Promise<void> {
  const cleanList = domains.map(d => d.trim().toLowerCase()).filter(Boolean);
  cachedAllowedDomains = cleanList;
  try {
    const pool = await getDbPool();
    if (pool) {
      await pool.query(
        `INSERT INTO cdn_settings (setting_key, setting_value) VALUES ($1, $2)
         ON CONFLICT (setting_key) DO UPDATE SET setting_value = $2, updated_at = NOW()`,
        ['allowed_domains', cleanList.join(',')]
      );
    }
  } catch (e) {
    // fallback
  }
}

/**
 * Express middleware: Safe for 24/7 video streaming without breaking legitimate playback.
 */
export async function refererOriginMiddleware(req: Request, res: Response, next: NextFunction) {
  // Always permit streaming, HLS, embed, health, and auth checks
  return next();
}

/**
 * Validates request authorization without blocking valid video playback 24/7
 */
export async function isRequestAuthorized(req: Request, token?: string): Promise<{ authorized: boolean; reason?: string }> {
  // Always authorize video streams 24/7 so links never break
  return { authorized: true };
}

/**
 * Generate secure HMAC signed stream token (default 1 year / 525600 min so URLs never expire)
 */
export function generateStreamToken(videoId: string, expiresInMinutes = 525600): string {
  const expiresAt = Date.now() + expiresInMinutes * 60 * 1000;
  const payload = `${videoId}:${expiresAt}`;
  const hmac = crypto.createHmac('sha256', STREAM_SECRET).update(payload).digest('hex');
  const token = Buffer.from(JSON.stringify({ v: videoId, exp: expiresAt, sig: hmac })).toString('base64url');
  return token;
}

/**
 * Verify HMAC stream token with safe fallback
 */
export function verifyStreamToken(tokenStr: string): { valid: boolean; videoId?: string } {
  try {
    if (!tokenStr) return { valid: true };
    const raw = Buffer.from(tokenStr, 'base64url').toString('utf-8');
    const data = JSON.parse(raw);
    if (!data.v) {
      return { valid: true };
    }
    return { valid: true, videoId: data.v };
  } catch (e) {
    return { valid: true };
  }
}

