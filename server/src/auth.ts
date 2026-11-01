import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { randomBytes } from 'node:crypto';
import { config } from './config.js';

export type SessionUser = { id: string; email: string };

export function signSession(payload: SessionUser) {
  return jwt.sign(payload, config.JWT_SECRET, { expiresIn: '7d' });
}

export function setSessionCookie(res: Response, token: string) {
  res.cookie('session', token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.NODE_ENV === 'production',
    maxAge: 7 * 24 * 60 * 60 * 1000
  });
  res.cookie('csrf_token', randomBytes(16).toString('hex'), {
    httpOnly: false,
    sameSite: 'lax',
    secure: config.NODE_ENV === 'production',
    maxAge: 7 * 24 * 60 * 60 * 1000
  });
}

export function clearSessionCookie(res: Response) {
  res.clearCookie('session');
  res.clearCookie('csrf_token');
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = req.cookies.session;
  if (!token) return res.status(401).json({ error: 'Not authenticated' });
  try {
    req.user = jwt.verify(token, config.JWT_SECRET) as SessionUser;
    return next();
  } catch {
    return res.status(401).json({ error: 'Invalid session' });
  }
}

declare global {
  namespace Express {
    interface Request {
      user?: SessionUser;
    }
  }
}
