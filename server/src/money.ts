const AMOUNT_RE = /^\d+(?:\.\d{1,2})?$/;
const MAX_CENTS = 1_000_000_000;

export function parseAmountToCents(amount: string): number {
  if (!AMOUNT_RE.test(amount)) throw new Error('Invalid amount format');
  const [wholeRaw, fracRaw = ''] = amount.split('.');
  const whole = Number(wholeRaw);
  const frac = Number((fracRaw + '00').slice(0, 2));
  const cents = whole * 100 + frac;
  if (!Number.isInteger(cents) || cents < 0 || cents > MAX_CENTS) {
    throw new Error('Amount out of range');
  }
  return cents;
}

export function formatCents(cents: number): string {
  if (!Number.isInteger(cents) || cents < 0) throw new Error('Invalid cents');
  const whole = Math.floor(cents / 100);
  const frac = String(cents % 100).padStart(2, '0');
  return `${whole}.${frac}`;
}

export function formatUsd(cents: number): string {
  return `$${formatCents(cents)}`;
}

export function convertMinorToUsdCents(localMinor: number, rateMicros: number): number {
  const numerator = BigInt(localMinor) * BigInt(rateMicros);
  const usd = (numerator + 500_000n) / 1_000_000n;
  return Number(usd);
}
