import { Router } from 'express';
import type { Transaction } from '@libsql/client';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { db, withTransaction } from '../db.js';
import { deriveJob } from '../derive.js';

export const clientRouter = Router();
clientRouter.use(rateLimit({ windowMs: 60_000, max: 60, standardHeaders: true, legacyHeaders: false }));

const disputeSchema = z.object({ note: z.string().max(300).optional() });

async function getClientJob(token: string) {
  const row = await db.execute({
    sql: `SELECT j.id, j.title, j.client_name, j.share_token, j.paypal_invoice_id, u.business_name
          FROM jobs j JOIN users u ON u.id = j.user_id WHERE j.share_token = ?`,
    args: [token]
  });
  return row.rows[0] as any;
}

async function getEvents(jobId: string, executor: typeof db | Transaction = db) {
  const rows = await executor.execute({ sql: 'SELECT id, type, payload, actor, created_at FROM job_events WHERE job_id = ? ORDER BY id ASC', args: [jobId] });
  return rows.rows.map((r: any) => ({ ...r, payload: JSON.parse(String(r.payload)) }));
}

async function appendEvent(jobId: string, type: string, payload: any, actor: 'client', executor: typeof db | Transaction = db) {
  await executor.execute({ sql: 'INSERT INTO job_events (job_id, type, payload, actor, created_at) VALUES (?, ?, ?, ?, ?)', args: [jobId, type, JSON.stringify(payload), actor, new Date().toISOString()] });
}

clientRouter.get('/c/:token', async (req, res) => {
  const job = await getClientJob(req.params.token);
  if (!job) return res.status(404).json({ error: "This link isn't valid." });
  const state = deriveJob(await getEvents(String(job.id)));
  res.json({
    business_name: job.business_name,
    client_name: job.client_name,
    title: job.title,
    quote_cents: state.quote_cents,
    changes: state.changes,
    total_cents: state.total_cents,
    days_added: state.days_added,
    pending_count: state.pending_count,
    invoice: state.invoice,
    stage: state.stage
  });
});

clientRouter.post('/c/:token/changes/:changeId/approve', async (req, res) => {
  const job = await getClientJob(req.params.token);
  if (!job) return res.status(404).json({ error: "This link isn't valid." });

  await withTransaction(async (tx) => {
    const state = deriveJob(await getEvents(String(job.id), tx));
    if (state.invoice) return res.status(409).json({ error: 'Invoice already created' });
    const change = state.changes.find((c) => c.id === req.params.changeId);
    if (!change || change.status !== 'awaiting_client') return res.status(409).json({ error: 'Change cannot be approved' });
    await appendEvent(String(job.id), 'CHANGE_APPROVED', { change_id: req.params.changeId }, 'client', tx);
  });

  res.json(deriveJob(await getEvents(String(job.id))));
});

clientRouter.post('/c/:token/changes/:changeId/dispute', async (req, res) => {
  const input = disputeSchema.parse(req.body);
  const job = await getClientJob(req.params.token);
  if (!job) return res.status(404).json({ error: "This link isn't valid." });

  await withTransaction(async (tx) => {
    const state = deriveJob(await getEvents(String(job.id), tx));
    if (state.invoice) return res.status(409).json({ error: 'Invoice already created' });
    const change = state.changes.find((c) => c.id === req.params.changeId);
    if (!change || change.status !== 'awaiting_client') return res.status(409).json({ error: 'Change cannot be disputed' });
    await appendEvent(String(job.id), 'CHANGE_DISPUTED', { change_id: req.params.changeId, note: input.note }, 'client', tx);
  });

  res.json(deriveJob(await getEvents(String(job.id))));
});
