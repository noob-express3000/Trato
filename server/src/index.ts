import path from 'node:path';
import express from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { config } from './config.js';
import { bootstrapDb } from './db.js';
import { authRouter } from './routes/auth.js';
import { clientRouter } from './routes/client.js';
import { jobsRouter } from './routes/jobs.js';
import { mockRouter } from './routes/mock.js';
import { webhookRouter } from './routes/webhooks.js';

const app = express();
const publicOrigin = new URL(config.PUBLIC_BASE_URL).origin;
const globalLimiter = rateLimit({ windowMs: 60_000, max: 300, standardHeaders: true, legacyHeaders: false });

app.use(helmet());
app.use(cookieParser());
app.use(globalLimiter);
app.use('/api/webhooks/paypal', express.raw({ type: 'application/json', limit: '1mb' }));
app.use(express.json({ limit: '1mb' }));
app.use((req, res, next) => {
  const needsCsrf = !['GET', 'HEAD', 'OPTIONS'].includes(req.method) && req.path.startsWith('/api/') && req.path !== '/api/webhooks/paypal';
  if (!needsCsrf || !req.cookies.session) return next();
  const origin = req.get('origin') || req.get('referer') || '';
  const headerToken = req.get('x-csrf-token');
  const cookieToken = req.cookies.csrf_token;
  if (!origin.startsWith(publicOrigin) || !headerToken || headerToken !== cookieToken) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  return next();
});

app.get('/api/health', (_req, res) => res.json({ ok: true }));
app.use('/api/auth', authRouter);
app.use('/api', clientRouter);
app.use('/api/webhooks', webhookRouter);
app.use('/', mockRouter);
app.use('/api', jobsRouter);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webDist = path.resolve(__dirname, '../../web/dist');
app.use(express.static(webDist));
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  return res.sendFile(path.join(webDist, 'index.html'));
});

app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (err instanceof z.ZodError) return res.status(400).json({ error: err.issues[0]?.message || 'Invalid input' });
  console.error(err);
  return res.status(err?.status || 500).json({ error: err?.message || 'Internal error' });
});

bootstrapDb()
  .then(() => {
    app.listen(config.PORT, () => {
      console.log(`Server listening on ${config.PORT}`);
    });
  })
  .catch((error) => {
    console.error('Failed to start server', error);
    process.exit(1);
  });
