import { describe, expect, it } from 'vitest';
import { drawThreat } from '../core/pilgrimage.js';
import { createRngStreams, d100, drawFrom, rollInt } from '../core/rng.js';
import type { Estate } from '../core/types.js';
import { loadContentConfig } from './support/config.js';

const config = loadContentConfig();

function sequence(seed: number, distribution = config.encounters.distribution, count = 100) {
  let state = createRngStreams(seed).encounters;
  const threats: Estate[] = [];
  for (let i = 0; i < count; i += 1) {
    const draw = drawThreat(state, distribution);
    threats.push(draw.value);
    state = draw.state;
  }
  return { threats, state };
}

describe('B3 encounter deck and draw', () => {
  it.each([
    { bellatores: 1, oratores: 1, laboratores: 1 },
    { bellatores: 1, oratores: 3, laboratores: 6 },
  ])('follows the configured distribution over 30k draws: %j', (distribution) => {
    const counts: Record<Estate, number> = { bellatores: 0, oratores: 0, laboratores: 0 };
    const total = Object.values(distribution).reduce((sum, weight) => sum + weight, 0);
    for (const threat of sequence(123, distribution, 30_000).threats) counts[threat] += 1;
    for (const estate of Object.keys(counts) as Estate[]) {
      // Absolute frequency tolerance of one percentage point, with a fixed seed.
      expect(Math.abs(counts[estate] / 30_000 - distribution[estate] / total)).toBeLessThan(0.01);
    }
  });

  it('uses the uniform default config', () => {
    expect(config.encounters.distribution).toEqual({ bellatores: 1, oratores: 1, laboratores: 1 });
  });

  it('maps every weighted ticket at the interval boundaries', () => {
    const distribution = { bellatores: 1, oratores: 2, laboratores: 3 };
    const tickets = new Set<number>();
    const expected: Estate[] = ['bellatores', 'oratores', 'oratores', 'laboratores', 'laboratores', 'laboratores'];
    for (let seed = 0; seed < 100; seed += 1) {
      const ticket = rollInt(seed, 1, 6);
      tickets.add(ticket.value);
      expect(drawThreat(seed, distribution)).toEqual({ value: expected[ticket.value - 1], state: ticket.state });
    }
    expect(tickets.size).toBe(6);
  });

  it.each(['bellatores', 'oratores', 'laboratores'] as const)('allows only %s with zero weights for the others', (estate) => {
    const distribution = { bellatores: 0, oratores: 0, laboratores: 0, [estate]: 1 };
    const result = sequence(7, distribution);
    expect(new Set(result.threats)).toEqual(new Set([estate]));
    expect(result.state).not.toBe(createRngStreams(7).encounters);
  });

  it('reproduces the same sequence and final RNG state for the same seed', () => {
    expect(sequence(42)).toEqual(sequence(42));
    expect(sequence(43).threats).not.toEqual(sequence(42).threats);
  });

  it('ignores property insertion order and leaves the distribution untouched', () => {
    const distribution = Object.freeze({ laboratores: 6, bellatores: 1, oratores: 3 });
    expect(sequence(123, distribution)).toEqual(sequence(123, { bellatores: 1, oratores: 3, laboratores: 6 }));
    expect(distribution).toEqual({ laboratores: 6, bellatores: 1, oratores: 3 });
  });

  it('advances only the encounter stream and is unaffected by extra job/reward draws', () => {
    const original = Object.freeze(createRngStreams(123));
    const draw = (state: number) => drawThreat(state, config.encounters.distribution);
    const direct = drawFrom(original, 'encounters', draw);
    let busy = original;
    for (let i = 0; i < 10; i += 1) {
      busy = drawFrom(drawFrom(busy, 'jobs', d100).streams, 'rewards', d100).streams;
    }
    expect(drawFrom(busy, 'encounters', draw).value).toBe(direct.value);
    expect(direct.streams).toEqual({ ...original, encounters: draw(original.encounters).state });
    expect(original).toEqual(createRngStreams(123));
  });

  it.each([0, -1, 0.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER])(
    'rejects invalid or unsupported weights before drawing: %s', (weight) => {
      expect(() => drawThreat(0, { bellatores: weight, oratores: 0, laboratores: 0 })).toThrow(RangeError);
    },
  );

  it('supports the full uint32 ticket range', () => {
    expect(drawThreat(0, { bellatores: 2 ** 32, oratores: 0, laboratores: 0 })).toEqual({
      value: 'bellatores', state: rollInt(0, 1, 2 ** 32).state,
    });
  });
});
