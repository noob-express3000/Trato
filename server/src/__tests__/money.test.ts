import { describe, expect, it } from 'vitest';
import { convertMinorToUsdCents, formatCents, parseAmountToCents } from '../money.js';

describe('money', () => {
  it('parses valid amounts', () => {
    expect(parseAmountToCents('0')).toBe(0);
    expect(parseAmountToCents('3500.00')).toBe(350000);
    expect(parseAmountToCents('12.3')).toBe(1230);
  });

  it('rejects invalid amounts', () => {
    for (const value of ['-1', '1.234', 'abc', '1,000', '10000000.01']) {
      expect(() => parseAmountToCents(value)).toThrow();
    }
  });

  it('formats cents', () => {
    expect(formatCents(0)).toBe('0.00');
    expect(formatCents(12345)).toBe('123.45');
  });

  it('converts using micros with half-up rounding', () => {
    expect(convertMinorToUsdCents(350000, 54321)).toBe(19012);
  });

  it('round trips simple value', () => {
    const cents = parseAmountToCents('10.50');
    expect(formatCents(cents)).toBe('10.50');
  });
});
