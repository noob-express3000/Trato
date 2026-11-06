import { Router } from 'express';
import type { Transaction } from '@libsql/client';
import { db, withTransaction } from '../db.js';
import { deriveJob } from '../derive.js';
import { getInvoiceStatus, verifyWebhookSignature } from '../services/paypal.js';

export const webhookRouter = Router();

async function findJobByInvoiceId(invoiceId: string, executor: typeof db | Transaction = db) {
  const row = await executor.execute({ sql: 'SELECT id FROM jobs WHERE paypal_invoice_id = ?', args: [invoiceId] });
  return row.rows[0] as any;
}

async function getEvents(jobId: string, executor: typeof db | Transaction = db) {
  const rows = await executor.execute({ sql: 'SELECT id, type, payload, actor, created_at FROM job_events WHERE job_id = ? ORDER BY id ASC', args: [jobId] });
  return rows.rows.map((r: any) => ({ ...r, payload: JSON.parse(String(r.payload)) }));
}

async function appendPaid(jobId: string, invoiceId: string, executor: typeof db | Transaction = db) {
  const events = await getEvents(jobId, executor);
  const state = deriveJob(events);
  if (state.invoice?.status === 'paid') return;
  const remote = await getInvoiceStatus(invoiceId);
  if (remote.status !== 'PAID') return;
  await executor.execute({
    sql: 'INSERT INTO job_events (job_id, type, payload, actor, created_at) VALUES (?, ?, ?, ?, ?)',
    args: [jobId, 'INVOICE_PAID', JSON.stringify({ paypal_invoice_id: invoiceId, amount_usd_cents: state.total_cents }), 'paypal', new Date().toISOString()]
  });
}

webhookRouter.post('/paypal', async (req, res) => {
  const webhookEvent = req.body;
  const ok = await verifyWebhookSignature({ headers: req.headers, rawBody: req.body as Buffer, webhookEvent });
  if (!ok) return res.status(400).json({ error: 'Invalid webhook signature' });

  const eventId = webhookEvent?.id as string | undefined;
  if (!eventId) return res.status(400).json({ error: 'Invalid webhook payload' });

  await withTransaction(async (tx) => {
    const inserted = await tx.execute({
      sql: 'INSERT OR IGNORE INTO processed_webhooks (event_id, received_at) VALUES (?, ?)',
      args: [eventId, new Date().toISOString()]
    });
    if (inserted.rowsAffected === 0) return;

    const invoiceId = webhookEvent?.resource?.invoice?.id ?? webhookEvent?.resource?.id;
    if (!invoiceId) return;
    const job = await findJobByInvoiceId(String(invoiceId), tx);
    if (!job) return;

    await appendPaid(String(job.id), String(invoiceId), tx);
  });

  res.json({ ok: true });
});
