import { describe, expect, it } from 'vitest';
import { getDerivedStats } from '../core/derived.js';
import type { CampaignState } from '../core/types.js';
import { loadContentConfig } from './support/config.js';

const config = loadContentConfig();
const state: CampaignState = {
  version: 1, seed: 0, rng: { jobs: 0, encounters: 0, rewards: 0 },
  playerName: { first: 'Test', last: 'Player' }, scionName: 'Scion', birthSign: 'aries',
  elapsedWeeks: 0, stats: { bellatores: 20, oratores: 15, laboratores: 15 },
  fatigue: 0, melancholy: 0, treasury: 50, inventory: {},
  furthestWaystation: 0, phase: 'home', waxingStreak: 0,
};

describe('getDerivedStats', () => {
  it('combines condition values, current aspects, and the next critical period', () => {
    expect(getDerivedStats(state, config)).toEqual({
      fatigueCeiling: 77, melancholyCeiling: 75, purseProtectionPct: 7,
      solarAspect: 'return', lunarPhase: 'new',
      nextCriticalSolarPeriod: { aspect: 'square', startsInWeeks: 12 },
    });
  });

  it.each([
    [11, 'none', 'waning', 'square', 1],
    [12, 'square', 'new', 'opposition', 12],
    [24, 'opposition', 'new', 'square', 12],
    [47, 'none', 'waning', 'return', 1],
    [49, 'return', 'waxing', 'square', 11],
    [50, 'return', 'full', 'square', 10],
  ])('derives calendar values at week %i', (week, solar, lunar, next, wait) => {
    const result = getDerivedStats({ ...state, elapsedWeeks: week }, config);
    expect(result.solarAspect).toBe(solar);
    expect(result.lunarPhase).toBe(lunar);
    expect(result.nextCriticalSolarPeriod).toEqual({ aspect: next, startsInWeeks: wait });
  });

  it.each([95, 96])('does not advertise a period beyond the deadline at week %i', (week) => {
    expect(getDerivedStats({ ...state, elapsedWeeks: week }, config).nextCriticalSolarPeriod).toBeUndefined();
  });

  it('uses configured aspect distances and lunar phases', () => {
    const variant: typeof config = {
      ...config,
      astrology: {
        ...config.astrology,
        solar: {
          ...config.astrology.solar,
          distances: { ...config.astrology.solar.distances, square: [1] },
        },
        lunarPhaseByWeek: ['full', 'waning', 'new', 'waxing'],
      },
    };
    const result = getDerivedStats(state, variant);
    expect(result.lunarPhase).toBe('full');
    expect(result.nextCriticalSolarPeriod).toEqual({ aspect: 'square', startsInWeeks: 4 });
  });
});
