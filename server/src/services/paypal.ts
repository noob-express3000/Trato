import { config } from '../config.js';
import { formatCents, parseAmountToCents } from '../money.js';

type InvoiceLine = { name: string; usd_cents: number };
type CreateInvoiceInput = {
  jobId: string;
  title: string;
  businessName: string;
  clientName: string;
  clientEmail: string;
  totalCents: number;
  lineItems: InvoiceLine[];
};

const mockPaid = new Set<string>();
let accessTokenCache: { token: string; expiresAt: number } | null = null;

async function getAccessToken() {
  if (accessTokenCache && Date.now() < accessTokenCache.expiresAt - 30_000) return accessTokenCache.token;

  const clientId = config.PAYPAL_CLIENT_ID;
  const secret = config.PAYPAL_CLIENT_SECRET;
  if (!clientId || !secret) throw new Error('PayPal is not configured');

  const credentials = Buffer.from(`${clientId}:${secret}`).toString('base64');
  const res = await fetch(`${config.PAYPAL_BASE_URL}/v1/oauth2/token`, {
    method: 'POST',
    headers: { Authorization: `Basic ${credentials}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=client_credentials'
  });
  const data = await res.json() as any;
  if (!res.ok || !data.access_token) {
    console.error('PayPal auth failed', data);
    throw new Error('Unable to authenticate with PayPal');
  }
  accessTokenCache = { token: data.access_token, expiresAt: Date.now() + Number(data.expires_in || 0) * 1000 };
  return data.access_token as string;
}

async function paypalFetch(path: string, init?: RequestInit) {
  const token = await getAccessToken();
  const res = await fetch(`${config.PAYPAL_BASE_URL}${path}`, {
    ...init,
    headers: {
      Authorization: 'Bearer ' + token,
      'Content-Type': 'application/json',
      ...(init?.headers || {})
    }
  });
  if (!res.ok) {
    const body = await res.text();
    console.error('PayPal API error', res.status, body);
    throw new Error('PayPal request failed');
  }
  return res;
}

export async function createInvoice(input: CreateInvoiceInput) {
  if (config.PAYPAL_MOCK && config.NODE_ENV !== 'production') {
    const id = `MOCK-${input.jobId}`;
    return { paypal_invoice_id: id, pay_url: `${config.PUBLIC_BASE_URL}/mock-pay/${encodeURIComponent(id)}` };
  }

  const createRes = await paypalFetch('/v2/invoicing/invoices', {
    method: 'POST',
    headers: { 'PayPal-Request-Id': `${input.jobId}-invoice` },
    body: JSON.stringify({
      detail: {
        currency_code: 'USD',
        note: `Job: ${input.title}`,
        payment_term: { term_type: 'DUE_ON_RECEIPT' }
      },
      invoicer: { name: { given_name: input.businessName } },
      primary_recipients: [{ billing_info: { name: { given_name: input.clientName }, email_address: input.clientEmail } }],
      items: input.lineItems.map((line) => ({
        name: line.name,
        quantity: '1',
        unit_amount: { currency_code: 'USD', value: formatCents(line.usd_cents) }
      }))
    })
  });
  const created = await createRes.json() as any;
  const invoiceId = String(created?.id || '');
  if (!invoiceId) throw new Error('PayPal invoice id missing');

  await paypalFetch(`/v2/invoicing/invoices/${invoiceId}/send`, { method: 'POST' });
  const invoiceRes = await paypalFetch(`/v2/invoicing/invoices/${invoiceId}`);
  const full = await invoiceRes.json() as any;
  const payUrl = String(full?.detail?.metadata?.recipient_view_url || '');
  if (!payUrl) throw new Error('PayPal recipient URL missing');

  return { paypal_invoice_id: invoiceId, pay_url: payUrl };
}

export async function getInvoiceStatus(invoiceId: string): Promise<{ status: string; total_cents?: number }> {
  if (config.PAYPAL_MOCK && config.NODE_ENV !== 'production') {
    return { status: mockPaid.has(invoiceId) ? 'PAID' : 'SENT' };
  }
  const res = await paypalFetch(`/v2/invoicing/invoices/${invoiceId}`);
  const data = await res.json() as any;
  const value = data?.amount?.summary?.total?.value as string | undefined;
  const total_cents = value ? parseAmountToCents(value) : undefined;
  return { status: String(data?.status || ''), total_cents };
}

function firstHeader(v: string | string[] | undefined) {
  return Array.isArray(v) ? v[0] : v;
}

export async function verifyWebhookSignature(payload: {
  headers: Record<string, string | string[] | undefined>;
  rawBody: Buffer;
  webhookEvent: any;
}): Promise<boolean> {
  if (config.PAYPAL_MOCK && config.NODE_ENV !== 'production') return true;
  if (!config.PAYPAL_WEBHOOK_ID) throw new Error('PayPal webhook id missing');

  const res = await paypalFetch('/v1/notifications/verify-webhook-signature', {
    method: 'POST',
    body: JSON.stringify({
      auth_algo: firstHeader(payload.headers['paypal-auth-algo']),
      cert_url: firstHeader(payload.headers['paypal-cert-url']),
      transmission_id: firstHeader(payload.headers['paypal-transmission-id']),
      transmission_sig: firstHeader(payload.headers['paypal-transmission-sig']),
      transmission_time: firstHeader(payload.headers['paypal-transmission-time']),
      webhook_id: config.PAYPAL_WEBHOOK_ID,
      webhook_event: payload.webhookEvent
    })
  });
  const data = await res.json() as any;
  return data?.verification_status === 'SUCCESS';
}

export function markMockPaid(invoiceId: string) {
  mockPaid.add(invoiceId);
}
