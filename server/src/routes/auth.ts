import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { nanoid } from 'nanoid';
import { hash, verify } from '@node-rs/argon2';
import { randomBytes } from 'node:crypto';
import { db } from '../db.js';
import { clearSessionCookie, setSessionCookie, signSession } from '../auth.js';
import { config } from '../config.js';

export const authRouter = Router();

authRouter.use(
  rateLimit({ windowMs: 60_000, max: 10, standardHeaders: true, legacyHeaders: false })
);

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(10),
  business_name: z.string().min(1).max(120),
  local_currency: z.string().regex(/^[A-Za-z]{3}$/).default('USD')
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1)
});

authRouter.post('/register', async (req, res, next) => {
  try {
    const input = registerSchema.parse(req.body);
    const userId = nanoid();
    const password_hash = await hash(input.password);
    await db.execute({
      sql: 'INSERT INTO users (id, email, password_hash, business_name, local_currency, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      args: [userId, input.email.toLowerCase(), password_hash, input.business_name, input.local_currency.toUpperCase(), new Date().toISOString()]
    });

    const token = signSession({ id: userId, email: input.email.toLowerCase() });
    setSessionCookie(res, token);
    return res.json({ id: userId, email: input.email.toLowerCase(), business_name: input.business_name, local_currency: input.local_currency.toUpperCase() });
  } catch (error: any) {
    if (String(error?.message || '').includes('UNIQUE')) return res.status(409).json({ error: 'Email already exists' });
    return next(error);
  }
});

authRouter.post('/login', async (req, res) => {
  const input = loginSchema.parse(req.body);
  const row = await db.execute({
    sql: 'SELECT id, email, password_hash FROM users WHERE email = ?',
    args: [input.email.toLowerCase()]
  });
  const user = row.rows[0] as any;
  if (!user) return res.status(401).json({ error: 'Invalid credentials' });

  const ok = await verify(input.password, String(user.password_hash));
  if (!ok) return res.status(401).json({ error: 'Invalid credentials' });

  const token = signSession({ id: String(user.id), email: String(user.email) });
  setSessionCookie(res, token);
  return res.json({ id: user.id, email: user.email });
});

authRouter.get('/google', (_req, res) => {
  if (!config.GOOGLE_CLIENT_ID || !config.GOOGLE_CLIENT_SECRET) {
    return res.status(503).json({ error: 'Google sign-in is not configured' });
  }
  const state = randomBytes(24).toString('hex');
  res.cookie('google_oauth_state', state, {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.NODE_ENV === 'production',
    maxAge: 10 * 60 * 1000
  });
  const params = new URLSearchParams({
    client_id: config.GOOGLE_CLIENT_ID,
    redirect_uri: config.GOOGLE_CALLBACK_URL,
    response_type: 'code',
    scope: 'openid email profile',
    state,
    prompt: 'select_account'
  });
  return res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
});

authRouter.get('/google/callback', async (req, res, next) => {
  const state = typeof req.query.state === 'string' ? req.query.state : '';
  const code = typeof req.query.code === 'string' ? req.query.code : '';
  if (!state || state !== req.cookies.google_oauth_state) {
    return res.status(400).json({ error: 'Invalid Google OAuth state' });
  }
  res.clearCookie('google_oauth_state');
  if (typeof req.query.error === 'string') {
    return res.redirect('/?oauth_error=Google sign-in was cancelled');
  }
  if (!code || !config.GOOGLE_CLIENT_ID || !config.GOOGLE_CLIENT_SECRET) {
    return res.status(503).json({ error: 'Google sign-in is not configured' });
  }

  try {
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: config.GOOGLE_CLIENT_ID,
        client_secret: config.GOOGLE_CLIENT_SECRET,
        redirect_uri: config.GOOGLE_CALLBACK_URL,
        grant_type: 'authorization_code'
      })
    });
    if (!tokenResponse.ok) throw new Error('Google token exchange failed');
    const tokens = await tokenResponse.json() as { access_token?: string };
    if (!tokens.access_token) throw new Error('Google did not return an access token');

    const profileResponse = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
      headers: { Authorization: `Bearer ${tokens.access_token}` }
    });
    if (!profileResponse.ok) throw new Error('Google profile lookup failed');
    const profile = await profileResponse.json() as {
      sub?: string;
      email?: string;
      email_verified?: boolean;
      name?: string;
    };
    if (!profile.sub || !profile.email || profile.email_verified !== true) {
      throw new Error('Google account email is not verified');
    }

    const email = profile.email.toLowerCase();
    const existing = await db.execute({
      sql: 'SELECT id, email, google_sub FROM users WHERE google_sub = ? OR email = ? LIMIT 1',
      args: [profile.sub, email]
    });
    const user = existing.rows[0] as { id?: string; email?: string; google_sub?: string } | undefined;
    let userId = user?.id;
    if (user?.id) {
      userId = user.id;
      if (user.google_sub !== profile.sub) {
        await db.execute({ sql: 'UPDATE users SET google_sub = ? WHERE id = ?', args: [profile.sub, userId] });
      }
    } else {
      userId = nanoid();
      const passwordHash = await hash(randomBytes(32).toString('hex'));
      await db.execute({
        sql: 'INSERT INTO users (id, email, password_hash, google_sub, business_name, local_currency, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
        args: [userId, email, passwordHash, profile.sub, profile.name || email.split('@')[0], 'USD', new Date().toISOString()]
      });
    }
    if (!userId) throw new Error('Unable to create or locate user');
    setSessionCookie(res, signSession({ id: userId, email }));
    return res.redirect('/jobs');
  } catch (error) {
    return next(error);
  }
});

authRouter.post('/logout', (_req, res) => {
  clearSessionCookie(res);
  res.json({ ok: true });
});

authRouter.get('/me', async (req, res) => {
  const token = req.cookies.session;
  if (!token) return res.status(401).json({ error: 'Not authenticated' });
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8')) as { id: string };
    const row = await db.execute({ sql: 'SELECT id, email, business_name, local_currency FROM users WHERE id = ?', args: [payload.id] });
    const user = row.rows[0] as any;
    if (!user) return res.status(401).json({ error: 'Not authenticated' });
    return res.json(user);
  } catch {
    return res.status(401).json({ error: 'Not authenticated' });
  }
});
