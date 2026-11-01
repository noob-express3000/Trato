export function formatUsd(cents: number): string {
  const whole = Math.floor(cents / 100);
  const frac = String(Math.abs(cents % 100)).padStart(2, '0');
  return `$${whole}.${frac}`;
}
