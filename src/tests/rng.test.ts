import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createRngStreams,
  d10,
  d100,
  d4,
  drawFrom,
  drawWeighted,
  next,
  pick,
  rollInt,
  splitmix32,
  type Draw,
  type RngState,
} from '../core/rng.js';

function drawMany<T>(seed: RngState, count: number, draw: (state: RngState) => Draw<T>): T[] {
  const values: T[] = [];
  let state = seed;
  for (let i = 0; i < count; i += 1) {
    const result = draw(state);
    values.push(result.value);
    state = result.state;
  }
  return values;
}

// Golden values, cross-checked against the reference closure-based Mulberry32.
const goldenDraws: Record<number, number[]> = {
  0: [1144304738, 1416247, 958946056, 627933444, 2007157716, 2340967985, 2642484575, 2787370982, 1958536065, 2496316458],
  1: [2693262067, 11749833, 2265367787, 4213581821, 4159151403, 1207330352, 2632122864, 3095568220, 1828783984, 4272732017],
  123: [3381219976, 766838775, 2127363934, 993692063, 1614012641, 3579227506, 3709479727, 3990426738, 3368509725, 1757042687],
};

describe('next (Mulberry32)', () => {
  it.each([0, 1, 123])('matches golden values for the first 10 draws of seed %i', (seed) => {
    expect(drawMany(seed, 10, next)).toEqual(goldenDraws[seed]);
  });

  it('is pure: the same state always yields the same draw', () => {
    expect(next(42)).toEqual(next(42));
  });

  it('returns uint32 values and states', () => {
    for (const { value, state } of [next(0xffffffff), next(-1), next(2 ** 40)]) {
      expect(Number.isInteger(value) && value >= 0 && value < 2 ** 32).toBe(true);
      expect(Number.isInteger(state) && state >= 0 && state < 2 ** 32).toBe(true);
    }
  });

  it('rejects non-integer states', () => {
    expect(() => next(1.5)).toThrow(RangeError);
    expect(() => next(Number.NaN)).toThrow(RangeError);
  });
});

describe('splitmix32', () => {
  it('matches golden values for the first 3 draws of seed 0', () => {
    // Cross-checked against the reference closure-based splitmix32.
    expect(drawMany(0, 3, splitmix32)).toEqual([1684164658, 3653269916, 2939563536]);
  });
});

describe('rollInt and dice', () => {
  it('stays within bounds', () => {
    const rolls = drawMany(7, 10_000, (s) => rollInt(s, -3, 3));
    expect(Math.min(...rolls)).toBe(-3);
    expect(Math.max(...rolls)).toBe(3);
  });

  it('returns min when min === max and still advances state', () => {
    const result = rollInt(5, 9, 9);
    expect(result.value).toBe(9);
    expect(result.state).not.toBe(5);
  });

  it('handles the full uint32 range', () => {
    expect(rollInt(0, 0, 2 ** 32 - 1).value).toBe(goldenDraws[0]?.[0]);
  });

  it('rejects draws at or above the largest multiple of the range', () => {
    // For range 3 * 2^30 the acceptance limit is 3 * 2^30 (3221225472).
    // Seed 4's first draw (3966987260) is above it, so it must be skipped.
    const range = 3 * 2 ** 30;
    const [first, second] = drawMany(4, 2, next);
    expect(first).toBeGreaterThanOrEqual(range);
    expect(second).toBeLessThan(range);
    expect(rollInt(4, 0, range - 1).value).toBe(second);
  });

  it('rejects invalid ranges', () => {
    expect(() => rollInt(0, 5, 4)).toThrow(RangeError);
    expect(() => rollInt(0, 1, 1.5)).toThrow(RangeError);
    expect(() => rollInt(0, 0, 2 ** 32)).toThrow(RangeError);
  });

  it('rolls d4, d10 and d100 in range and covers every face', () => {
    for (const [die, sides] of [
      [d4, 4],
      [d10, 10],
      [d100, 100],
    ] as const) {
      const faces = new Set(drawMany(99, 5_000, die));
      expect(faces.size).toBe(sides);
      expect(Math.min(...faces)).toBe(1);
      expect(Math.max(...faces)).toBe(sides);
    }
  });

  it('passes a chi-square sanity check on d100 over 100k draws', () => {
    const draws = 100_000;
    const counts = new Array<number>(100).fill(0);
    for (const value of drawMany(123, draws, d100)) {
      counts[value - 1] = (counts[value - 1] ?? 0) + 1;
    }
    const expected = draws / 100;
    const chiSquare = counts.reduce((sum, observed) => sum + (observed - expected) ** 2 / expected, 0);
    // 99 degrees of freedom; critical value at p = 0.001 is ~148.23.
    expect(chiSquare).toBeLessThan(148.23);
  });
});

describe('pick', () => {
  it('picks every element of an array over many draws', () => {
    const items = ['a', 'b', 'c'] as const;
    expect(new Set(drawMany(3, 300, (s) => pick(s, items)))).toEqual(new Set(items));
  });

  it('throws on an empty array', () => {
    expect(() => pick(0, [])).toThrow(RangeError);
  });
});

describe('substreams', () => {
  it('derives each stream from the master seed via splitmix32 in a fixed order', () => {
    const derived = drawMany(123, 3, splitmix32);
    expect(derived).toEqual([1965001953, 923654468, 3296506099]);
    expect(createRngStreams(123)).toEqual({ jobs: derived[0], encounters: derived[1], rewards: derived[2] });
  });

  it('gives each stream a distinct state', () => {
    const streams = createRngStreams(0);
    expect(new Set(Object.values(streams)).size).toBe(3);
  });

  it('drawing from one stream leaves the others untouched', () => {
    const streams = createRngStreams(123);
    const afterJobs = drawFrom(streams, 'jobs', d100);
    expect(afterJobs.streams.encounters).toBe(streams.encounters);
    expect(afterJobs.streams.rewards).toBe(streams.rewards);
    expect(afterJobs.streams.jobs).not.toBe(streams.jobs);
    // The input is not mutated.
    expect(streams).toEqual(createRngStreams(123));
  });

  it('extra draws on one stream do not shift draws on another', () => {
    const base = createRngStreams(7);
    const direct = drawFrom(base, 'encounters', d100).value;

    let busy = base;
    for (let i = 0; i < 5; i += 1) busy = drawFrom(busy, 'jobs', d10).streams;
    expect(drawFrom(busy, 'encounters', d100).value).toBe(direct);
  });
});

describe('ambient randomness', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('never consults the global random source', () => {
    const spy = vi.spyOn(Math, 'random');
    drawMany(1, 100, d100);
    pick(1, [1, 2, 3]);
    drawFrom(createRngStreams(1), 'rewards', d4);
    expect(spy).not.toHaveBeenCalled();
  });
});

describe('drawWeighted', () => {
  const invalidEntries: (readonly (readonly [string, number])[])[] = [
    [], [['x', 0]], [['x', -1]], [['x', 0.5]], [['x', NaN]],
    [['x', Infinity]], [['x', 2 ** 32], ['y', 1]],
  ];
  it.each(invalidEntries.map(entries => ({ entries })))('rejects invalid weights: $entries', ({ entries }) => {
    expect(() => drawWeighted(0, entries)).toThrow(RangeError);
  });

  it('preserves rejection sampling and skips zero-weight entries', () => {
    const draw = rollInt(4, 1, 3 * 2 ** 30);
    expect(drawWeighted(4, [['excluded', 0], ['only', 3 * 2 ** 30]])).toEqual({
      value: 'only', state: draw.state,
    });
    expect(draw.state).not.toBe(next(4).state);
  });
});
