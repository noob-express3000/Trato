import { describe, expect, it } from 'vitest';
import { deriveJob } from '../derive.js';

const at = (n: number) => new Date(1700000000000 + n * 1000).toISOString();

describe('derive', () => {
  it('quote only', () => {
    const d = deriveJob([{ type: 'JOB_CREATED', payload: { quote_usd_cents: 1000 }, actor: 'contractor', created_at: at(1) }]);
    expect(d.total_cents).toBe(1000);
    expect(d.stage).toBe('open');
  });

  it('approval adds total and days', () => {
    const d = deriveJob([
      { type: 'JOB_CREATED', payload: { quote_usd_cents: 1000 }, actor: 'contractor', created_at: at(1) },
      { type: 'CHANGE_PROPOSED', payload: { change_id: 'c1', description: 'Tiles', amount_usd_cents: 500, days_delta: 2, transcript: 'text' }, actor: 'contractor', created_at: at(2) },
      { type: 'CHANGE_APPROVED', payload: { change_id: 'c1' }, actor: 'client', created_at: at(3) }
    ]);
    expect(d.total_cents).toBe(1500);
    expect(d.days_added).toBe(2);
  });

  it('dispute and withdraw do not add total', () => {
    const d = deriveJob([
      { type: 'JOB_CREATED', payload: { quote_usd_cents: 1000 }, actor: 'contractor', created_at: at(1) },
      { type: 'CHANGE_PROPOSED', payload: { change_id: 'c1', description: 'A', amount_usd_cents: 200, days_delta: 1, transcript: 't' }, actor: 'contractor', created_at: at(2) },
      { type: 'CHANGE_DISPUTED', payload: { change_id: 'c1' }, actor: 'client', created_at: at(3) },
      { type: 'CHANGE_PROPOSED', payload: { change_id: 'c2', description: 'B', amount_usd_cents: 300, days_delta: 1, transcript: 't' }, actor: 'contractor', created_at: at(4) },
      { type: 'CHANGE_WITHDRAWN', payload: { change_id: 'c2' }, actor: 'contractor', created_at: at(5) }
    ]);
    expect(d.total_cents).toBe(1000);
  });

  it('double decision ignored and pending count works', () => {
    const d = deriveJob([
      { type: 'JOB_CREATED', payload: { quote_usd_cents: 1000 }, actor: 'contractor', created_at: at(1) },
      { type: 'CHANGE_PROPOSED', payload: { change_id: 'c1', description: 'A', amount_usd_cents: 200, days_delta: 1, transcript: 't' }, actor: 'contractor', created_at: at(2) },
      { type: 'CHANGE_APPROVED', payload: { change_id: 'c1' }, actor: 'client', created_at: at(3) },
      { type: 'CHANGE_DISPUTED', payload: { change_id: 'c1' }, actor: 'client', created_at: at(4) },
      { type: 'CHANGE_PROPOSED', payload: { change_id: 'c2', description: 'B', amount_usd_cents: 200, days_delta: 1, transcript: 't' }, actor: 'contractor', created_at: at(5) }
    ]);
    expect(d.changes.find((c) => c.id === 'c1')?.status).toBe('approved');
    expect(d.pending_count).toBe(1);
  });

  it('changes after invoice ignored and stage transitions', () => {
    const d = deriveJob([
      { type: 'JOB_CREATED', payload: { quote_usd_cents: 1000 }, actor: 'contractor', created_at: at(1) },
      { type: 'INVOICE_CREATED', payload: { paypal_invoice_id: 'inv', total_usd_cents: 1000, pay_url: 'u' }, actor: 'system', created_at: at(2) },
      { type: 'CHANGE_PROPOSED', payload: { change_id: 'c1', description: 'A', amount_usd_cents: 200, days_delta: 1, transcript: 't' }, actor: 'contractor', created_at: at(3) },
      { type: 'INVOICE_PAID', payload: { paypal_invoice_id: 'inv', amount_usd_cents: 1000 }, actor: 'paypal', created_at: at(4) }
    ]);
    expect(d.changes).toHaveLength(0);
    expect(d.stage).toBe('paid');
  });
});
