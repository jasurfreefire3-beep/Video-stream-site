const fs = require('fs');

let content = fs.readFileSync('server/security.ts', 'utf8');

const middlewareCode = `
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
      message: auth.reason || 'So\\'rov faqat animem.uz domeni orqali bajarilishi mumkin!',
    });
  }

  next();
}
`;

if (!content.includes('refererOriginMiddleware')) {
  content = content.replace('export async function isRequestAuthorized', middlewareCode + '\nexport async function isRequestAuthorized');
  fs.writeFileSync('server/security.ts', content);
  console.log('Successfully added refererOriginMiddleware to server/security.ts');
} else {
  console.log('Already present');
}
