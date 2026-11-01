export type JobEvent = {
  id?: number;
  type: string;
  payload: any;
  actor: 'contractor' | 'client' | 'paypal' | 'system';
  created_at: string;
};

type Change = {
  id: string;
  description: string;
  amount_cents: number;
  days_delta: number;
  status: 'awaiting_client' | 'approved' | 'disputed' | 'withdrawn';
  transcript: string;
  proposed_at: string;
  decided_at?: string;
  note?: string;
};

export function deriveJob(events: JobEvent[]) {
  let quote_cents = 0;
  const changes = new Map<string, Change>();
  let invoice: null | { paypal_invoice_id: string; total_cents: number; pay_url: string; status: 'sent' | 'paid' } = null;

  for (const event of events) {
    if (event.type === 'JOB_CREATED') {
      quote_cents = Number(event.payload?.quote_usd_cents || 0);
      continue;
    }

    if (event.type === 'CHANGE_PROPOSED') {
      if (invoice) continue;
      const id = event.payload?.change_id;
      if (!id || changes.has(id)) continue;
      changes.set(id, {
        id,
        description: String(event.payload?.description || ''),
        amount_cents: Number(event.payload?.amount_usd_cents || 0),
        days_delta: Number(event.payload?.days_delta || 0),
        status: 'awaiting_client',
        transcript: String(event.payload?.transcript || ''),
        proposed_at: event.created_at
      });
      continue;
    }

    if (event.type === 'CHANGE_APPROVED' || event.type === 'CHANGE_DISPUTED' || event.type === 'CHANGE_WITHDRAWN') {
      if (invoice) continue;
      const id = event.payload?.change_id;
      const current = id ? changes.get(id) : null;
      if (!current || current.status !== 'awaiting_client') continue;
      if (event.type === 'CHANGE_APPROVED') current.status = 'approved';
      if (event.type === 'CHANGE_DISPUTED') {
        current.status = 'disputed';
        current.note = event.payload?.note ? String(event.payload.note) : undefined;
      }
      if (event.type === 'CHANGE_WITHDRAWN') current.status = 'withdrawn';
      current.decided_at = event.created_at;
      continue;
    }

    if (event.type === 'INVOICE_CREATED') {
      if (invoice) continue;
      invoice = {
        paypal_invoice_id: String(event.payload?.paypal_invoice_id || ''),
        total_cents: Number(event.payload?.total_usd_cents || 0),
        pay_url: String(event.payload?.pay_url || ''),
        status: 'sent'
      };
      continue;
    }

    if (event.type === 'INVOICE_PAID' && invoice) {
      invoice.status = 'paid';
      continue;
    }
  }

  const changesList = [...changes.values()];
  const approvedTotal = changesList.filter((c) => c.status === 'approved').reduce((sum, c) => sum + c.amount_cents, 0);
  const days_added = changesList.filter((c) => c.status === 'approved').reduce((sum, c) => sum + c.days_delta, 0);
  const pending_count = changesList.filter((c) => c.status === 'awaiting_client').length;
  const total_cents = quote_cents + approvedTotal;
  const stage = invoice ? (invoice.status === 'paid' ? 'paid' : 'invoiced') : 'open';

  return {
    quote_cents,
    changes: changesList,
    total_cents,
    days_added,
    pending_count,
    invoice,
    stage
  } as const;
}
