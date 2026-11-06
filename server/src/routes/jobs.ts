import { Router } from 'express';
import type { Transaction } from '@libsql/client';
import multer from 'multer';
import { nanoid } from 'nanoid';
import { z } from 'zod';
import { requireAuth } from '../auth.js';
import { db, withTransaction } from '../db.js';
import { deriveJob } from '../derive.js';
import { getRate } from '../fx.js';
import { convertMinorToUsdCents, parseAmountToCents } from '../money.js';
import { extractDraft } from '../services/extract.js';
import { createInvoice, getInvoiceStatus } from '../services/paypal.js';
import { transcribeAudio } from '../services/transcribe.js';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

export const jobsRouter = Router();
jobsRouter.use(requireAuth);

const createJobSchema = z.object({
  title: z.string().min(1).max(200),
  client_name: z.string().min(1).max(120),
  client_email: z.string().email(),
  quote: z.object({
    currency: z.string().regex(/^[A-Za-z]{3}$/),
    amount: z.string()
  })
});

const createChangeSchema = z.object({
  description: z.string().min(1).max(200),
  amount: z.object({ currency: z.string().regex(/^[A-Za-z]{3}$/), amount: z.string() }),
  days_delta: z.number().int(),
  transcript: z.string().max(2000),
  source: z.enum(['voice', 'text'])
});

async function getJobOwnedByUser(jobId: string, userId: string) {
  const row = await db.execute({ sql: 'SELECT * FROM jobs WHERE id = ? AND user_id = ?', args: [jobId, userId] });
  return row.rows[0] as any;
}

async function getEvents(jobId: string, executor: typeof db | Transaction = db) {
  const rows = await executor.execute({ sql: 'SELECT id, type, payload, actor, created_at FROM job_events WHERE job_id = ? ORDER BY id ASC', args: [jobId] });
  return rows.rows.map((r: any) => ({ ...r, payload: JSON.parse(String(r.payload)) }));
}

async function appendEvent(jobId: string, type: string, payload: any, actor: 'contractor' | 'client' | 'paypal' | 'system', executor: typeof db | Transaction = db) {
  await executor.execute({
    sql: 'INSERT INTO job_events (job_id, type, payload, actor, created_at) VALUES (?, ?, ?, ?, ?)',
    args: [jobId, type, JSON.stringify(payload), actor, new Date().toISOString()]
  });
}

jobsRouter.get('/fx', async (req, res) => {
  const from = String(req.query.from || '').toUpperCase();
  if (!/^[A-Z]{3}$/.test(from)) return res.status(400).json({ error: 'Invalid currency code' });
  try {
    const rate = await getRate(from, 'USD');
    return res.json(rate);
  } catch {
    return res.status(503).json({ error: "Couldn't get the exchange rate. Enter the amount in USD." });
  }
});

jobsRouter.get('/jobs', async (req, res) => {
  const rows = await db.execute({ sql: 'SELECT id, title, client_name FROM jobs WHERE user_id = ? ORDER BY created_at DESC', args: [req.user!.id] });
  const out = [] as any[];
  for (const row of rows.rows as any[]) {
    const derived = deriveJob(await getEvents(String(row.id)));
    out.push({ id: row.id, title: row.title, client_name: row.client_name, total_cents: derived.total_cents, stage: derived.stage, pending_count: derived.pending_count });
  }
  res.json(out);
});

jobsRouter.post('/jobs', async (req, res, next) => {
  try {
    const input = createJobSchema.parse(req.body);
    const jobId = nanoid();
    const shareToken = nanoid(32);
    const createdAt = new Date().toISOString();

    const amount_minor = parseAmountToCents(input.quote.amount);
    const currency = input.quote.currency.toUpperCase();
    let rate_micros = 1_000_000;
    let as_of = createdAt;
    if (currency !== 'USD') {
      try {
        const rate = await getRate(currency, 'USD');
        rate_micros = rate.rate_micros;
        as_of = rate.as_of;
      } catch {
        return res.status(503).json({ error: "Couldn't get the exchange rate. Enter the amount in USD." });
      }
    }
    const quote_usd_cents = convertMinorToUsdCents(amount_minor, rate_micros);

    await withTransaction(async (tx) => {
      await tx.execute({
        sql: 'INSERT INTO jobs (id, user_id, title, client_name, client_email, share_token, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
        args: [jobId, req.user!.id, input.title, input.client_name, input.client_email, shareToken, createdAt]
      });
      await appendEvent(jobId, 'JOB_CREATED', {
        quote_usd_cents,
        entered: { currency, amount_minor, rate_micros, as_of }
      }, 'contractor', tx);
    });

    const derived = deriveJob(await getEvents(jobId));
    return res.status(201).json({ id: jobId, title: input.title, client_name: input.client_name, share_token: shareToken, ...derived });
  } catch (error) {
    return next(error);
  }
});

jobsRouter.get('/jobs/:id', async (req, res) => {
  const job = await getJobOwnedByUser(req.params.id, req.user!.id);
  if (!job) return res.status(404).json({ error: 'Not found' });
  const events = await getEvents(String(job.id));
  const derived = deriveJob(events);
  res.json({ id: job.id, title: job.title, client_name: job.client_name, share_token: job.share_token, ...derived });
});

jobsRouter.post('/jobs/:id/draft-change', upload.single('audio'), async (req, res) => {
  const job = await getJobOwnedByUser(req.params.id, req.user!.id);
  if (!job) return res.status(404).json({ error: 'Not found' });

  const extract = String(req.query.extract || 'true') !== 'false';
  let transcript = '';
  try {
    if (req.file) {
      transcript = await transcribeAudio(req.file);
    } else if (typeof req.body?.text === 'string') {
      transcript = req.body.text;
    } else {
      return res.status(400).json({ error: 'Provide audio or text' });
    }

    if (!extract) return res.json({ transcript, draft: null });

    try {
      const draft = await extractDraft(transcript);
      return res.json({ transcript, draft });
    } catch {
      return res.json({ transcript, draft: null });
    }
  } catch {
    return res.json({ transcript: transcript || null, draft: null });
  }
});

jobsRouter.post('/jobs/:id/changes', async (req, res) => {
  const input = createChangeSchema.parse(req.body);
  const job = await getJobOwnedByUser(req.params.id, req.user!.id);
  if (!job) return res.status(404).json({ error: 'Not found' });

  await withTransaction(async (tx) => {
    const state = deriveJob(await getEvents(String(job.id), tx));
    if (state.invoice) return res.status(409).json({ error: 'Invoice already created' });

    const amount_minor = parseAmountToCents(input.amount.amount);
    const currency = input.amount.currency.toUpperCase();
    let rate_micros = 1_000_000;
    let as_of = new Date().toISOString();
    if (currency !== 'USD') {
      try {
        const rate = await getRate(currency, 'USD');
        rate_micros = rate.rate_micros;
        as_of = rate.as_of;
      } catch {
        return res.status(503).json({ error: "Couldn't get the exchange rate. Enter the amount in USD." });
      }
    }
    const amount_usd_cents = convertMinorToUsdCents(amount_minor, rate_micros);

    await appendEvent(String(job.id), 'CHANGE_PROPOSED', {
      change_id: nanoid(12),
      description: input.description,
      amount_usd_cents,
      days_delta: input.days_delta,
      entered: { currency, amount_minor, rate_micros, as_of },
      transcript: input.transcript,
      source: input.source
    }, 'contractor', tx);
  });

  const derived = deriveJob(await getEvents(String(job.id)));
  return res.status(201).json(derived);
});

jobsRouter.post('/jobs/:id/changes/:changeId/withdraw', async (req, res) => {
  const job = await getJobOwnedByUser(req.params.id, req.user!.id);
  if (!job) return res.status(404).json({ error: 'Not found' });

  await withTransaction(async (tx) => {
    const state = deriveJob(await getEvents(String(job.id), tx));
    if (state.invoice) return res.status(409).json({ error: 'Invoice already created' });
    const change = state.changes.find((c) => c.id === req.params.changeId);
    if (!change || change.status !== 'awaiting_client') return res.status(409).json({ error: 'Change is not withdrawable' });
    await appendEvent(String(job.id), 'CHANGE_WITHDRAWN', { change_id: req.params.changeId }, 'contractor', tx);
  });

  const derived = deriveJob(await getEvents(String(job.id)));
  res.json(derived);
});

jobsRouter.post('/jobs/:id/invoice', async (req, res) => {
  const job = await getJobOwnedByUser(req.params.id, req.user!.id);
  if (!job) return res.status(404).json({ error: 'Not found' });

  await withTransaction(async (tx) => {
    const events = await getEvents(String(job.id), tx);
    const state = deriveJob(events);
    if (state.pending_count !== 0 || state.invoice || state.total_cents <= 0) {
      return res.status(409).json({ error: 'Invoice cannot be created yet' });
    }

    const line_items = [
      { name: 'Original quote', usd_cents: state.quote_cents },
      ...state.changes.filter((c) => c.status === 'approved').map((c) => ({ name: c.description.slice(0, 80), usd_cents: c.amount_cents }))
    ];
    const sum = line_items.reduce((s, i) => s + i.usd_cents, 0);
    if (sum !== state.total_cents) return res.status(409).json({ error: 'Invoice total mismatch' });

    const userRow = await tx.execute({ sql: 'SELECT business_name FROM users WHERE id = ?', args: [req.user!.id] });
    const business_name = String((userRow.rows[0] as any).business_name);

    const invoice = await createInvoice({
      jobId: String(job.id),
      title: String(job.title),
      businessName: business_name,
      clientName: String(job.client_name),
      clientEmail: String(job.client_email),
      totalCents: state.total_cents,
      lineItems: line_items
    });

    await tx.execute({ sql: 'UPDATE jobs SET paypal_invoice_id = ? WHERE id = ?', args: [invoice.paypal_invoice_id, job.id] });
    await appendEvent(String(job.id), 'INVOICE_CREATED', {
      paypal_invoice_id: invoice.paypal_invoice_id,
      total_usd_cents: state.total_cents,
      pay_url: invoice.pay_url,
      line_items
    }, 'system', tx);
  });

  const derived = deriveJob(await getEvents(String(job.id)));
  res.json(derived);
});

jobsRouter.post('/jobs/:id/invoice/refresh', async (req, res) => {
  const job = await getJobOwnedByUser(req.params.id, req.user!.id);
  if (!job) return res.status(404).json({ error: 'Not found' });
  const invoiceId = String(job.paypal_invoice_id || '');
  if (!invoiceId) return res.status(409).json({ error: 'No invoice exists' });

  await withTransaction(async (tx) => {
    const events = await getEvents(String(job.id), tx);
    const state = deriveJob(events);
    if (state.invoice?.status === 'paid') return;
    const remote = await getInvoiceStatus(invoiceId);
    if (remote.status === 'PAID') {
      await appendEvent(String(job.id), 'INVOICE_PAID', {
        paypal_invoice_id: invoiceId,
        amount_usd_cents: state.total_cents
      }, 'paypal', tx);
    }
  });

  const derived = deriveJob(await getEvents(String(job.id)));
  res.json(derived);
});
