import { Router } from 'express';
import type { Transaction } from '@libsql/client';
import { db, withTransaction } from '../db.js';
import { config } from '../config.js';
import { deriveJob } from '../derive.js';
import { getInvoiceStatus, markMockPaid } from '../services/paypal.js';

export const mockRouter = Router();

async function getJobByInvoiceId(invoiceId: string) {
  const row = await db.execute({ sql: 'SELECT id FROM jobs WHERE paypal_invoice_id = ?', args: [invoiceId] });
  return row.rows[0] as any;
}

async function getEvents(jobId: string, executor: typeof db | Transaction = db) {
  const rows = await executor.execute({ sql: 'SELECT id, type, payload, actor, created_at FROM job_events WHERE job_id = ? ORDER BY id ASC', args: [jobId] });
  return rows.rows.map((r: any) => ({ ...r, payload: JSON.parse(String(r.payload)) }));
}

mockRouter.get('/mock-pay/:invoiceId', (req, res) => {
  if (!config.PAYPAL_MOCK || config.NODE_ENV === 'production') return res.status(404).send('Not found');
  res.type('html').send(`<!doctype html><html><body style="font-family:system-ui;max-width:28rem;margin:2rem auto;padding:1rem"><h1>Trato sandbox mock</h1><form method="post" action="/api/mock-pay/${encodeURIComponent(req.params.invoiceId)}/pay"><button style="padding:0.75rem 1rem">Pay (sandbox mock)</button></form></body></html>`);
});

mockRouter.post('/mock-pay/:invoiceId/pay', async (req, res) => {
  if (!config.PAYPAL_MOCK || config.NODE_ENV === 'production') return res.status(404).send('Not found');
  const invoiceId = req.params.invoiceId;
  markMockPaid(invoiceId);
  const job = await getJobByInvoiceId(invoiceId);
  if (job) {
    await withTransaction(async (tx) => {
      const state = deriveJob(await getEvents(String(job.id), tx));
      if (state.invoice?.status === 'paid') return;
      const remote = await getInvoiceStatus(invoiceId);
      if (remote.status === 'PAID') {
        await tx.execute({
          sql: 'INSERT INTO job_events (job_id, type, payload, actor, created_at) VALUES (?, ?, ?, ?, ?)',
          args: [job.id, 'INVOICE_PAID', JSON.stringify({ paypal_invoice_id: invoiceId, amount_usd_cents: state.total_cents }), 'paypal', new Date().toISOString()]
        });
      }
    });
  }
  res.redirect('/');
});
