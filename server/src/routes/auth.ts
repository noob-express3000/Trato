import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { nanoid } from 'nanoid';
import { hash, verify } from '@node-rs/argon2';
import { db } from '../db.js';
import { clearSessionCookie, setSessionCookie, signSession } from '../auth.js';

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
