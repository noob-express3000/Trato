const ONE_HOUR_MS = 60 * 60 * 1000;

type Rate = { rate_micros: number; as_of: string; fetched_at: number };
const cache = new Map<string, Rate>();

export async function getRate(from: string, to: 'USD' = 'USD'): Promise<{ rate_micros: number; as_of: string }> {
  const fromCode = from.toUpperCase();
  if (fromCode === to) return { rate_micros: 1_000_000, as_of: new Date().toISOString() };

  const key = `${fromCode}->${to}`;
  const now = Date.now();
  const cached = cache.get(key);
  if (cached && now - cached.fetched_at < ONE_HOUR_MS) {
    return { rate_micros: cached.rate_micros, as_of: cached.as_of };
  }

  const res = await fetch(`https://api.frankfurter.app/latest?from=${encodeURIComponent(fromCode)}&to=${to}`);
  if (!res.ok) {
    throw new Error('Could not fetch exchange rate');
  }
  const data = (await res.json()) as { rates?: Record<string, number>; date?: string };
  const rate = data.rates?.[to];
  if (typeof rate !== 'number' || !Number.isFinite(rate) || rate <= 0) {
    throw new Error('Invalid exchange rate response');
  }
  const rate_micros = Math.round(rate * 1_000_000);
  const as_of = data.date ? new Date(`${data.date}T00:00:00.000Z`).toISOString() : new Date().toISOString();
  cache.set(key, { rate_micros, as_of, fetched_at: now });
  return { rate_micros, as_of };
}
