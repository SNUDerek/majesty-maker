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
