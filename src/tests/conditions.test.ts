import { describe, expect, it } from 'vitest';
import {
  addBurden,
  ceilingForStat,
  clampStat,
  clampTreasury,
  collapseCause,
  fatigueCeiling,
  isCollapsed,
  melancholyCeiling,
  purseProtectionPct,
  subtractMagnitude,
  type ConditionState,
} from '../core/conditions.js';
import { getConditionStats } from '../core/derived.js';
import type { Estate } from '../core/types.js';
import { loadContentConfig } from './support/config.js';

const config = loadContentConfig();

function stats(bellatores: number, oratores: number, laboratores = 15): Record<Estate, number> {
  return { bellatores, oratores, laboratores };
}

function condition(over: Partial<ConditionState> = {}): ConditionState {
  return { stats: stats(15, 15), fatigue: 0, melancholy: 0, ...over };
}

describe('burden ceilings (tech §4)', () => {
  it.each([
    [0, 75], // floor(67.5) clamped up to 75
    [15, 75],
    [16, 75], // 75.5 floors to 75
    [17, 76],
    [20, 77], // starting stat with zodiac bonus
    [64, 99], // 99.5 floors to 99
    [65, 100],
    [100, 100], // 117.5 clamped down to 100
  ])('stat %i gives ceiling %i', (stat, expected) => {
    expect(ceilingForStat(stat)).toBe(expected);
  });

  it('fatigue follows Bellatores and melancholy follows Oratores', () => {
    const s = stats(65, 17, 100);
    expect(fatigueCeiling(s)).toBe(100);
    expect(melancholyCeiling(s)).toBe(76);
  });

  it('rejects non-integer stats', () => {
    expect(() => ceilingForStat(15.5)).toThrow(RangeError);
  });
});

describe('purse protection', () => {
  it.each([
    [0, 0],
    [15, 7],
    [20, 10],
    [99, 49],
    [100, 50],
  ])('laboratores %i protects %i%%', (lab, expected) => {
    expect(purseProtectionPct(stats(15, 15, lab))).toBe(expected);
  });
});

describe('clamps', () => {
  it('clamps stats to the configured 0..100', () => {
    expect(clampStat(-3, config)).toBe(0);
    expect(clampStat(57, config)).toBe(57);
    expect(clampStat(104, config)).toBe(100);
  });

  it('clamps treasury to 0..9999', () => {
    expect(clampTreasury(-1, config)).toBe(0);
    expect(clampTreasury(9999, config)).toBe(9999);
    expect(clampTreasury(10_050, config)).toBe(9999);
  });
});

describe('burden arithmetic', () => {
  it('adds deltas and never goes negative', () => {
    expect(addBurden(10, 5)).toBe(15);
    expect(addBurden(10, -15)).toBe(0);
    expect(addBurden(0, -1)).toBe(0);
  });

  it('has no upper clamp (exceeding the ceiling is a collapse)', () => {
    expect(addBurden(98, 10)).toBe(108);
  });

  it('floors the magnitude before subtracting', () => {
    expect(subtractMagnitude(40, 22.5)).toBe(18); // Waning 15 x 1.5, floored first
    expect(subtractMagnitude(10, 40)).toBe(0);
    expect(subtractMagnitude(10, 0)).toBe(10);
  });

  it('rejects negative magnitudes and non-integer deltas', () => {
    expect(() => subtractMagnitude(10, -1)).toThrow(RangeError);
    expect(() => addBurden(10, 1.5)).toThrow(RangeError);
  });
});

describe('collapse', () => {
  it('is not collapsed one point below both ceilings', () => {
    const state = condition({ fatigue: 74, melancholy: 74 });
    expect(collapseCause(state)).toBeNull();
    expect(isCollapsed(state)).toBe(false);
  });

  it('collapses at exactly the ceiling', () => {
    expect(collapseCause(condition({ fatigue: 75 }))).toBe('fatigue');
    expect(collapseCause(condition({ melancholy: 75 }))).toBe('melancholy');
    expect(collapseCause(condition({ fatigue: 80, melancholy: 75 }))).toBe('both');
  });

  it('reports collapse when a stat drop lowers the ceiling below the current burden', () => {
    const before = condition({ stats: stats(17, 15), fatigue: 75 });
    expect(isCollapsed(before)).toBe(false); // ceiling 76
    const after = { ...before, stats: stats(16, 15) }; // Smuggler's -1 Bellatores
    expect(fatigueCeiling(after.stats)).toBe(75);
    expect(collapseCause(after)).toBe('fatigue');
  });
});

describe('getConditionStats', () => {
  it('derives ceilings and purse protection from current stats', () => {
    expect(getConditionStats({ stats: stats(20, 15, 15) })).toEqual({
      fatigueCeiling: 77,
      melancholyCeiling: 75,
      purseProtectionPct: 7,
    });
  });
});
