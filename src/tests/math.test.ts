import { describe, expect, it } from 'vitest';
import { applyIntegerPercent } from '../core/math';

describe('applyIntegerPercent', () => {
  it('returns the base unchanged with no percentages', () => {
    expect(applyIntegerPercent(17)).toBe(17);
  });

  it('avoids float drift (1.1 * 10)', () => {
    expect(applyIntegerPercent(10, 110)).toBe(11);
  });

  it('floors once across stacked multipliers (Square 130 x Waxing 110)', () => {
    // 7 * 1.3 = 9.1 -> 9 if floored early; 9 * 1.1 = 9.9 -> 9. Single floor: 10.01 -> 10.
    expect(applyIntegerPercent(7, 130, 110)).toBe(10);
  });

  it('halves with floor (Weighted Coin: 15 -> 7)', () => {
    expect(applyIntegerPercent(15, 50)).toBe(7);
  });

  it('rejects non-integer or negative inputs', () => {
    expect(() => applyIntegerPercent(1.5, 100)).toThrow(RangeError);
    expect(() => applyIntegerPercent(10, 99.5)).toThrow(RangeError);
    expect(() => applyIntegerPercent(10, -50)).toThrow(RangeError);
  });

  it('supports large intermediate products when the result is safe', () => {
    expect(applyIntegerPercent(9999, 200, 200, 200, 200, 200, 200)).toBe(639936);
    expect(applyIntegerPercent(Number.MAX_SAFE_INTEGER, 100, 100)).toBe(Number.MAX_SAFE_INTEGER);
    expect(applyIntegerPercent(5, ...Array<number>(95).fill(110))).toBe(42783);
    expect(applyIntegerPercent(5, ...Array<number>(95).fill(110), 0)).toBe(0);
  });

  it('preserves floor semantics for negative bases', () => {
    expect(applyIntegerPercent(-15, 50)).toBe(-8);
    expect(applyIntegerPercent(-10, 50)).toBe(-5);
  });

  it('rejects an unsafe final result', () => {
    expect(() => applyIntegerPercent(Number.MAX_SAFE_INTEGER, 200)).toThrow(RangeError);
    expect(() => applyIntegerPercent(-Number.MAX_SAFE_INTEGER, 200)).toThrow(RangeError);
  });
});

describe('applyIntegerPercent fast path', () => {
  function reference(base: number, percentages: number[]): number {
    let n = BigInt(base);
    let d = 1n;
    for (const p of percentages) { n *= BigInt(p); d *= 100n; }
    const q = n / d - (n < 0n && n % d !== 0n ? 1n : 0n);
    return Number(q);
  }

  it('matches exact BigInt flooring, including near the safe-integer boundary', () => {
    let seed = 0x9e3779b9;
    const rand = (max: number): number => {
      seed = (Math.imul(seed ^ (seed >>> 15), 0x2c1b3c6d) + 0x6d2b79f5) >>> 0;
      return seed % max;
    };
    const bases = [0, 1, 7, 15, 9999, -15, -9999, 2 ** 40 + 3, -(2 ** 40) - 7, Number.MAX_SAFE_INTEGER];
    for (let i = 0; i < 5000; i++) {
      const base = i < bases.length * 10 ? bases[i % bases.length]! : rand(2_000_001) - 1_000_000;
      const percentages = Array.from({ length: rand(5) }, () => rand(301));
      const expected = reference(base, percentages);
      if (!Number.isSafeInteger(expected)) continue;
      expect(applyIntegerPercent(base, ...percentages)).toBe(expected);
    }
    // Products just under and just over 2^53 with non-integer quotients.
    expect(applyIntegerPercent(Number.MAX_SAFE_INTEGER, 99)).toBe(reference(Number.MAX_SAFE_INTEGER, [99]));
    expect(applyIntegerPercent(90071992547409, 101)).toBe(reference(90071992547409, [101]));
    expect(applyIntegerPercent(-90071992547409, 99, 101)).toBe(reference(-90071992547409, [99, 101]));
    expect(Object.is(applyIntegerPercent(-15, 0), 0)).toBe(true);
  });
});
