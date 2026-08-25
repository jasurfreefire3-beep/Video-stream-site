import jwt from 'jsonwebtoken';
import { Request, Response, NextFunction } from 'express';
import dotenv from 'dotenv';
dotenv.config();

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '1213234';
const JWT_SECRET = process.env.JWT_SECRET || 'animem-uz-secure-jwt-key-2026';

export interface AuthRequest extends Request {
  user?: {
    role: string;
    authenticatedAt: number;
  };
}

export function verifyAdminPassword(password: string): boolean {
  return password.trim() === ADMIN_PASSWORD.trim();
}

export function generateAdminToken(): string {
  return jwt.sign(
    { role: 'animem_admin', authenticatedAt: Date.now() },
    JWT_SECRET,
    { expiresIn: '30d' }
  );
}

export function requireAdminAuth(req: AuthRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.substring(7) : (req.query.auth_token as string);

  if (!token) {
    return res.status(401).json({ error: 'Avtorizatsiyadan o\'tilmagan. Parol talab qilinadi.' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { role: string; authenticatedAt: number };
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(403).json({ error: 'Yaroqsiz yoki muddati tugagan sessiya tokeni.' });
  }
}
