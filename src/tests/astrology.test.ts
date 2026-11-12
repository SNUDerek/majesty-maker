import { describe, expect, it } from 'vitest';
import { applyModifier, collectModifiers, solarAspect, upcomingCriticalPeriods } from '../core/astrology.js';
import { getDerivedStats } from '../core/derived.js';
import { withOverrides, type RulesConfig } from '../core/config.js';
import type { ActivityId, CampaignState, LunarPhase, ModifierContext, SolarAspect } from '../core/types.js';
import { loadContentConfig } from './support/config.js';

const config = loadContentConfig();
const activities: [ActivityId, ModifierContext['kind']][] = [
  ['hedge_knight', 'tutor'], ['hermit', 'tutor'], ['smuggler', 'tutor'],
  ['stables', 'job'], ['alehouse', 'job'], ['village_watch', 'job'], ['scriptorium', 'job'],
  ['rest_home', 'rest'], ['bathhouse', 'rest'], ['shrine', 'rest'], ['banquet', 'rest'],
];
const aspects: SolarAspect[] = [
  'return', 'none', 'none', 'square', 'trine', 'none',
  'opposition', 'none', 'trine', 'square', 'none', 'none',
];
const phases: LunarPhase[] = ['new', 'waxing', 'full', 'waning'];
const state: CampaignState = {
  version: 1, seed: 0, rng: { jobs: 0, encounters: 0, rewards: 0 },
  playerName: { first: 'Test', last: 'Player' }, scionName: 'Scion', birthSign: 'capricorn',
  elapsedWeeks: 0, stats: { bellatores: 15, oratores: 15, laboratores: 15 },
  fatigue: 0, melancholy: 0, treasury: 50, inventory: {},
  furthestWaystation: 0, phase: 'home', waxingStreak: 0,
};

describe('canonical astrology matrix', () => {
  for (const [distance, aspect] of aspects.entries()) {
    it(`classifies solar distance ${distance}`, () => expect(solarAspect(distance, config)).toBe(aspect));
    for (const lunar of phases) {
      for (const [activityId, kind] of activities) {
        it(`${distance}/${lunar}/${activityId}`, () => {
          expect(solarAspect(distance, config)).toBe(aspect);
          const ctx: ModifierContext = { activityId, kind, solar: aspect, lunar, previousActivityId: activityId };
          const mods = collectModifiers(ctx, config);
          // Hand-specified combined percentages, independent of the implementation's factor builder.
          const tutorGain = aspect === 'return' ? (lunar === 'waxing' ? 132 : 120)
            : aspect === 'square' ? (lunar === 'waxing' ? 143 : 130)
            : lunar === 'waxing' ? 110 : 100;
          const expected = {
            successBonusPts: kind === 'job' && aspect === 'trine' ? 15 : 0,
            statGainPct: kind === 'tutor' ? tutorGain : kind === 'job' && lunar === 'waxing' ? 110 : 100,
            payoutPct: kind !== 'rest' && lunar === 'waxing' ? 110 : 100,
            costPct: aspect === 'return' && activityId === 'banquet' ? 50 : 100,
            fatiguePct: aspect === 'opposition' && kind === 'job' ? 150 : 100,
            melancholyPct: aspect === 'opposition' && kind === 'job' ? 150
              : aspect === 'square' && kind === 'tutor' ? 200 : 100,
            recoveryPct: lunar === 'waning' && kind === 'rest' && activityId !== 'rest_home' ? 150 : 100,
          };
          expect(mods).toMatchObject(expected);
          for (const key of ['statGainPct', 'payoutPct', 'costPct', 'fatiguePct', 'melancholyPct', 'recoveryPct'] as const) {
            expect(applyModifier(100, mods, key)).toBe(expected[key]);
          }
          const sources: string[] = [];
          if ((aspect === 'return' && (kind === 'tutor' || activityId === 'banquet')) ||
              (aspect === 'square' && kind === 'tutor') ||
              ((aspect === 'trine' || aspect === 'opposition') && kind === 'job')) sources.push(`solar:${aspect}`);
          if (lunar === 'waxing' && kind !== 'rest') sources.push('lunar:waxing');
          if (lunar === 'waning' && kind === 'rest' && activityId !== 'rest_home') sources.push('lunar:waning');
          expect(mods.sources).toEqual(sources);
        });
      }
    }
  }
});

const tutor: ModifierContext = { activityId: 'hedge_knight', kind: 'tutor', solar: 'square', lunar: 'waxing', previousActivityId: 'hedge_knight' };

describe('stacking and configurable lunar effects', () => {
  it('floors only the final quantity for Square plus Waxing', () => {
    expect(applyModifier(7, collectModifiers(tutor, config), 'statGainPct')).toBe(10);
  });

  it('preserves exact factors when a combined percentage is fractional', () => {
    const variant: RulesConfig = { ...config, astrology: { ...config.astrology,
      solar: { ...config.astrology.solar, squareTutorGainPct: 133 } } };
    const mods = collectModifiers(tutor, variant);
    expect(mods.statGainPct).toBe(146);
    expect(applyModifier(200, mods, 'statGainPct')).toBe(292); // floor(200 * 133 * 110 / 10000)
    expect(applyModifier(1000, mods, 'statGainPct')).toBe(1463); // summary alone would give 1460
  });

  it('requires an identical named job or tutor in the previous week', () => {
    for (const previousActivityId of [undefined, 'hermit'] as const) {
      expect(collectModifiers({ ...tutor, solar: 'none', previousActivityId }, config).statGainPct).toBe(100);
    }
    expect(collectModifiers({ ...tutor, waxingStreak: 10 }, config).statGainPct).toBe(143);
  });

  it('supports explicitly configured compounding without intermediate flooring', () => {
    const variant: RulesConfig = { ...config, astrology: { ...config.astrology,
      waxing: { ...config.astrology.waxing, mode: 'compounding' } } };
    const mods = collectModifiers({ ...tutor, waxingStreak: 2 }, variant);
    expect(applyModifier(1000, mods, 'statGainPct')).toBe(1730);
  });

  it.each([6, 8, 94])('supports a long compounding streak with %s prior repeats', (waxingStreak) => {
    const variant = withOverrides(config, { astrology: { waxing: { mode: 'compounding' } } });
    const mods = collectModifiers({ ...tutor, waxingStreak }, variant);
    // Independent exact expression: Square 130%, followed by one factor per repeat.
    const expected = Number(7n * 130n * 110n ** BigInt(waxingStreak + 1) /
      100n ** BigInt(waxingStreak + 2));
    expect(applyModifier(7, mods, 'statGainPct')).toBe(expected);
  });

  it('enables New Moon bonuses only for configured activities', () => {
    const variant: RulesConfig = { ...config, astrology: { ...config.astrology,
      newMoon: { ...config.astrology.newMoon, activityBonus: 20 } } };
    for (const [activityId, kind] of activities) {
      const mods = collectModifiers({ activityId, kind, solar: 'none', lunar: 'new' }, variant);
      const enabled = activityId === 'smuggler' || activityId === 'alehouse';
      expect(mods.statGainPct).toBe(enabled ? 120 : 100);
      expect(mods.payoutPct).toBe(enabled ? 120 : 100);
      expect(mods.sources).toEqual(enabled ? ['lunar:new'] : []);
    }
  });

  it('enables Full Moon surge for B/O activities only', () => {
    const variant: RulesConfig = { ...config, astrology: { ...config.astrology,
      fullMoon: { ...config.astrology.fullMoon, surge: 25 } } };
    for (const [activityId, kind] of activities) {
      const mods = collectModifiers({ activityId, kind, solar: 'none', lunar: 'full' }, variant);
      const enabled = ['hedge_knight', 'hermit', 'village_watch', 'scriptorium'].includes(activityId);
      expect(mods.statGainPct).toBe(enabled ? 125 : 100);
      expect(mods.payoutPct).toBe(enabled ? 125 : 100);
      expect(mods.sources).toEqual(enabled ? ['lunar:full'] : []);
    }
  });

  it('rejects a Full Moon context whose kind does not match its activity', () => {
    const variant: RulesConfig = { ...config, astrology: { ...config.astrology,
      fullMoon: { ...config.astrology.fullMoon, surge: 25 } } };
    expect(() => collectModifiers({ activityId: 'stables', kind: 'tutor', solar: 'none', lunar: 'full' }, variant))
      .toThrow(RangeError);
    expect(() => collectModifiers({ activityId: 'hermit', kind: 'job', solar: 'none', lunar: 'full' }, variant))
      .toThrow(RangeError);
  });

  it('makes Waning home recovery opt-in', () => {
    const variant: RulesConfig = { ...config, astrology: { ...config.astrology,
      waning: { ...config.astrology.waning, appliesToRestAtHome: true } } };
    expect(collectModifiers({ activityId: 'rest_home', kind: 'rest', solar: 'none', lunar: 'waning' }, variant).recoveryPct).toBe(150);
  });

  it('returns fresh data without mutating the context or config', () => {
    const before = JSON.stringify(config);
    collectModifiers(tutor, config).sources.push('test');
    expect(collectModifiers(tutor, config).sources).toEqual(['solar:square', 'lunar:waxing']);
    expect(JSON.stringify(config)).toBe(before);
    expect(tutor.previousActivityId).toBe('hedge_knight');
  });
});

describe('critical period reminders', () => {
  it('includes all future starts within the inclusive horizon', () => {
    expect(upcomingCriticalPeriods(state, 48, config)).toEqual([
      { aspect: 'square', startsInWeeks: 12 }, { aspect: 'opposition', startsInWeeks: 24 },
      { aspect: 'square', startsInWeeks: 36 }, { aspect: 'return', startsInWeeks: 48 },
    ]);
    expect(upcomingCriticalPeriods(state, 11, config)).toEqual([]);
    expect(upcomingCriticalPeriods(state, 0, config)).toEqual([]);
  });

  it('excludes the active period and the deadline', () => {
    expect(upcomingCriticalPeriods({ ...state, elapsedWeeks: 12 }, 12, config)).toEqual([
      { aspect: 'opposition', startsInWeeks: 12 },
    ]);
    expect(upcomingCriticalPeriods({ ...state, elapsedWeeks: 95 }, 100, config)).toEqual([]);
    expect(upcomingCriticalPeriods({ ...state, elapsedWeeks: 96 }, 100, config)).toEqual([]);
  });

  it('uses the configured calendar and agrees with derived stats', () => {
    const variant: RulesConfig = { ...config, calendar: { ...config.calendar, weeksPerMonth: 2, totalWeeks: 48 },
      astrology: { ...config.astrology, lunarPhaseByWeek: ['full', 'waning'] } };
    expect(upcomingCriticalPeriods(state, 6, variant)).toEqual([{ aspect: 'square', startsInWeeks: 6 }]);
    expect(getDerivedStats(state, variant).nextCriticalSolarPeriod).toEqual({ aspect: 'square', startsInWeeks: 6 });
  });

  it('rejects invalid horizons and solar distances', () => {
    for (const horizon of [-1, 0.5, Infinity]) expect(() => upcomingCriticalPeriods(state, horizon, config)).toThrow(RangeError);
    for (const distance of [-1, 12, 0.5]) expect(() => solarAspect(distance, config)).toThrow(RangeError);
  });
});
