import crypto from 'crypto';
import { Request } from 'express';
import { getDbPool } from './db.js';

const STREAM_SECRET = process.env.STREAM_SECRET || 'animem_uz_secret_stream_token_2026';

let cachedAllowedDomains: string[] = ['animem.uz', 'www.animem.uz', 'localhost', '127.0.0.1', '*.run.app', '*.googleusercontent.com'];
let lastDomainFetch = 0;

export async function getAllowedDomains(): Promise<string[]> {
  if (Date.now() - lastDomainFetch < 30000 && cachedAllowedDomains.length > 0) {
    return cachedAllowedDomains;
  }

  try {
    const pool = await getDbPool();
    const result = await pool.query(
      `SELECT setting_value FROM cdn_settings WHERE setting_key = $1`,
      ['allowed_domains']
    );
    if (result.rows.length > 0 && result.rows[0].setting_value) {
      const userDomains = result.rows[0].setting_value
        .split(',')
        .map((d: string) => d.trim().toLowerCase())
        .filter(Boolean);
      cachedAllowedDomains = Array.from(new Set(['animem.uz', 'www.animem.uz', 'localhost', '127.0.0.1', '*.run.app', '*.googleusercontent.com', ...userDomains]));
      lastDomainFetch = Date.now();
    }
  } catch (e) {
    // fallback
  }
  return cachedAllowedDomains;
}

export async function updateAllowedDomains(domains: string[]): Promise<void> {
  const cleanList = domains.map(d => d.trim().toLowerCase()).filter(Boolean);
  cachedAllowedDomains = cleanList;
  const pool = await getDbPool();
  await pool.query(
    `INSERT INTO cdn_settings (setting_key, setting_value) VALUES ($1, $2)
     ON CONFLICT (setting_key) DO UPDATE SET setting_value = $2, updated_at = NOW()`,
    ['allowed_domains', cleanList.join(',')]
  );
}

/**
 * Checks if request is from animem.uz or authorized domain
 */

import { Response, NextFunction } from 'express';

/**
 * Express middleware to check HTTP Referer and Origin headers.
 * If request is not from animem.uz or authorized domain, rejects with 403 Forbidden.
 */
export async function refererOriginMiddleware(req: Request, res: Response, next: NextFunction) {
  if (req.method === 'OPTIONS' || req.query?.preview === '1' || req.path === '/health' || req.path === '/auth/status' || req.path === '/auth/check') {
    return next();
  }

  const token = (req.query.token as string) || (req.headers['x-stream-token'] as string);
  const auth = await isRequestAuthorized(req, token);

  if (!auth.authorized) {
    return res.status(403).json({
      error: '403 Forbidden',
      message: auth.reason || 'So\'rov faqat animem.uz domeni orqali bajarilishi mumkin!',
    });
  }

  next();
}

export async function isRequestAuthorized(req: Request, token?: string): Promise<{ authorized: boolean; reason?: string }> {
  // 0. If preview mode explicitly requested via query parameter
  if (req.query?.preview === '1') {
    return { authorized: true };
  }

  // 1. If signed token provided, check validity
  if (token) {
    const valid = verifyStreamToken(token);
    if (valid.valid) {
      return { authorized: true };
    }
  }

  // 2. Check Referer / Origin header
  const referer = req.headers.referer || req.headers.referrer || '';
  const origin = req.headers.origin || '';
  const host = req.headers.host || '';
  const forwardedHost = (req.headers['x-forwarded-host'] as string) || '';

  const sourceUrl = (origin || referer) as string;

  // If internal request or direct same-host admin preview
  if (!sourceUrl || (host && sourceUrl.includes(host)) || (forwardedHost && sourceUrl.includes(forwardedHost))) {
    return { authorized: true };
  }

  const allowedDomains = await getAllowedDomains();

  try {
    const parsed = new URL(sourceUrl);
    const hostname = parsed.hostname.toLowerCase();

    // Check against allowed domains list
    const isMatch = allowedDomains.some(allowed => {
      if (allowed === '*' || allowed === '*.*') return true;
      if (allowed.startsWith('*.')) {
        const root = allowed.substring(2);
        return hostname === root || hostname.endsWith('.' + root);
      }
      return hostname === allowed || hostname.endsWith('.' + allowed);
    });

    if (isMatch) {
      return { authorized: true };
    }

    return { 
      authorized: false, 
      reason: `Ruxsat berilmagan domen: ${hostname}. Ushbu video faqat Animem.uz domenida ishlaydi!` 
    };
  } catch (e) {
    return { authorized: true }; // On invalid URL format fallback allow rather than breaking playback
  }
}

/**
 * Generate secure HMAC signed stream token
 */
export function generateStreamToken(videoId: string, expiresInMinutes = 180): string {
  const expiresAt = Date.now() + expiresInMinutes * 60 * 1000;
  const payload = `${videoId}:${expiresAt}`;
  const hmac = crypto.createHmac('sha256', STREAM_SECRET).update(payload).digest('hex');
  const token = Buffer.from(JSON.stringify({ v: videoId, exp: expiresAt, sig: hmac })).toString('base64url');
  return token;
}

/**
 * Verify HMAC stream token
 */
export function verifyStreamToken(tokenStr: string): { valid: boolean; videoId?: string } {
  try {
    const raw = Buffer.from(tokenStr, 'base64url').toString('utf-8');
    const data = JSON.parse(raw);
    if (!data.v || !data.exp || !data.sig) {
      return { valid: false };
    }

    if (Date.now() > data.exp) {
      return { valid: false };
    }

    const payload = `${data.v}:${data.exp}`;
    const expectedSig = crypto.createHmac('sha256', STREAM_SECRET).update(payload).digest('hex');

    if (crypto.timingSafeEqual(Buffer.from(data.sig), Buffer.from(expectedSig))) {
      return { valid: true, videoId: data.v };
    }
    return { valid: false };
  } catch (e) {
    return { valid: false };
  }
}
