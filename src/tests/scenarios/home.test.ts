/**
 * D2 home scenarios: empty purse, both conditions near ceiling, two
 * consecutive activities under the Waxing Moon, and modifier-precedence
 * combinations (tech §4, §5, §6, §13).
 */
import { describe, expect, it } from 'vitest';
import { collectModifiers, solarAspect } from '../../core/astrology.js';
import { getCalendar } from '../../core/calendar.js';
import { collapseCause, fatigueCeiling, melancholyCeiling } from '../../core/conditions.js';
import { withOverrides } from '../../core/config.js';
import {
  applyActivityDeltas,
  jobSuccessChance,
  resolveJob,
  resolveRest,
  resolveTutor,
  restCost,
} from '../../core/economy.js';
import {
  RuleError,
  type ActivityId,
  type CampaignState,
  type JobId,
  type ModifierSet,
  type RestId,
  type TutorId,
} from '../../core/types.js';
import {
  coinDelta,
  defaultConfig as config,
  eventsOfType,
  forcedRolls,
  hasHome,
  ruleState,
  scenario,
} from './harness.js';

/*
 * Weeks used below (birth-relative months; the default config):
 * - month 0 (weeks 0-3): Solar Return. Week 3 is Waning.
 * - month 1 (weeks 4-7): no solar aspect. Week 4 New, week 5 Waxing.
 * - month 3 (weeks 12-15): Square. Week 13 Waxing.
 * - month 4 (weeks 16-19): Trine.
 * - month 6 (weeks 24-27): Opposition. Week 25 Waxing.
 */
const WEEK = { returnWaning: 3, plainNew: 4, plainWaxing: 5, squareNew: 12, squareWaxing: 13, trine: 16, oppositionNew: 24, oppositionWaxing: 25 };

type Kind = 'tutor' | 'job' | 'rest';

/** The modifiers the reducer would collect for this state's week. */
function modifiersFor(state: CampaignState, activityId: ActivityId, kind: Kind, cfg = config): ModifierSet {
  const calendar = getCalendar(state, cfg);
  return collectModifiers(
    {
      activityId,
      kind,
      solar: solarAspect(calendar.solarDistance, cfg),
      lunar: calendar.lunarPhase,
      ...(state.lastWeeklyActivityId === undefined ? {} : { previousActivityId: state.lastWeeklyActivityId }),
      waxingStreak: state.waxingStreak,
    },
    cfg,
  );
}

const tutor = (state: CampaignState, id: TutorId, cfg = config) =>
  resolveTutor(state, id, modifiersFor(state, id, 'tutor', cfg), state.rng, cfg);
const job = (state: CampaignState, id: JobId, cfg = config) =>
  resolveJob(state, id, modifiersFor(state, id, 'job', cfg), state.rng, cfg);
const rest = (state: CampaignState, id: RestId, cfg = config) =>
  resolveRest(state, id, modifiersFor(state, id, 'rest', cfg), state.rng, cfg);

function ruleErrorCode(fn: () => unknown): string | undefined {
  try {
    fn();
  } catch (error) {
    if (error instanceof RuleError) return error.code;
    throw error;
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Rule-level scenarios (pure modules)
// ---------------------------------------------------------------------------

describe('§5 empty purse (rule level)', () => {
  const broke = ruleState({ treasury: 0, elapsedWeeks: WEEK.plainNew });

  it('refuses every tutor with INSUFFICIENT_FUNDS before any RNG draw', () => {
    for (const id of ['hedge_knight', 'hermit', 'smuggler'] as const) {
      expect(ruleErrorCode(() => tutor(broke, id))).toBe('INSUFFICIENT_FUNDS');
    }
  });

  it('refuses every paid rest, but Rest at Home is free', () => {
    for (const id of ['bathhouse', 'shrine', 'banquet'] as const) {
      expect(ruleErrorCode(() => rest(broke, id))).toBe('INSUFFICIENT_FUNDS');
    }
    const free = rest({ ...broke, fatigue: 20, melancholy: 20 }, 'rest_home');
    expect(free.deltas).toMatchObject({ treasury: 0, fatigue: -15, melancholy: -15 });
  });

  it('Stables still pays from an empty purse without drawing RNG', () => {
    const result = job(broke, 'stables');
    expect(result.deltas.treasury).toBe(6);
    expect(result.rng).toEqual(broke.rng);
  });

  it('a fee exactly equal to the treasury is affordable and leaves 0', () => {
    expect(ruleErrorCode(() => rest({ ...broke, treasury: 14 }, 'bathhouse'))).toBe('INSUFFICIENT_FUNDS');
    expect(rest({ ...broke, treasury: 15 }, 'bathhouse').deltas.treasury).toBe(-15);
  });

  it('§6 Solar Return halves the Banquet, so 15 Coin affords it in the birth month', () => {
    const birthMonth = ruleState({ treasury: 15, elapsedWeeks: 0 });
    expect(restCost('banquet', modifiersFor(birthMonth, 'banquet', 'rest'), config)).toBe(15);
    expect(rest(birthMonth, 'banquet').deltas.treasury).toBe(-15);
    expect(ruleErrorCode(() => rest({ ...birthMonth, elapsedWeeks: WEEK.plainNew }, 'banquet')))
      .toBe('INSUFFICIENT_FUNDS');
  });
});

describe('§4 both conditions near ceiling (rule level)', () => {
  // Aries: Bellatores 20 (Fatigue ceiling 77), Oratores 15 (Melancholy ceiling 75).
  const edge = ruleState({ elapsedWeeks: WEEK.plainNew, fatigue: 76, melancholy: 74 });

  it('one point below both ceilings is not a collapse', () => {
    expect(fatigueCeiling(edge.stats)).toBe(77);
    expect(melancholyCeiling(edge.stats)).toBe(75);
    expect(collapseCause(edge)).toBeNull();
  });

  it('Smuggler (+5 Fatigue, +5 Melancholy) collapses on both', () => {
    const after = applyActivityDeltas(edge, tutor(edge, 'smuggler').deltas);
    expect(after).toMatchObject({ fatigue: 81, melancholy: 79 });
    expect(collapseCause(after)).toBe('both');
  });

  it('Stables (+2/+2) is enough to collapse on both', () => {
    expect(collapseCause(applyActivityDeltas(edge, job(edge, 'stables').deltas))).toBe('both');
  });

  it('Hermit collapses on Melancholy only', () => {
    expect(collapseCause(applyActivityDeltas(edge, tutor(edge, 'hermit').deltas))).toBe('melancholy');
  });

  it('a tutor\'s opposing stat loss lowers a ceiling onto an existing burden', () => {
    // Bellatores 21 gives ceiling 78; Hermit costs 1 Bellatores, so the ceiling drops to 77.
    const state = ruleState({ elapsedWeeks: WEEK.plainNew, stats: { bellatores: 21 }, fatigue: 77, melancholy: 0 });
    expect(collapseCause(state)).toBeNull();
    const after = applyActivityDeltas(state, tutor(state, 'hermit').deltas);
    expect(after.fatigue).toBe(77);
    expect(collapseCause(after)).toBe('fatigue');
  });

  it('a rest from the edge clears both without collapse', () => {
    const after = applyActivityDeltas(edge, rest(edge, 'rest_home').deltas);
    expect(after).toMatchObject({ fatigue: 61, melancholy: 59 });
    expect(collapseCause(after)).toBeNull();
  });
});

describe('§6 two consecutive weekly activities under the Waxing Moon (rule level)', () => {
  it('repeating last week\'s activity in a Waxing week multiplies gain and payout by 110%', () => {
    const week4 = ruleState({ elapsedWeeks: WEEK.plainNew, treasury: 0, rng: { ...ruleState().rng, jobs: forcedRolls(1) } });
    const first = job(week4, 'village_watch');
    expect(first.deltas.treasury).toBe(15);
    expect(first.deltas.stats.bellatores).toBe(2);

    const week5 = {
      ...applyActivityDeltas(week4, first.deltas),
      elapsedWeeks: WEEK.plainWaxing,
      lastWeeklyActivityId: 'village_watch' as const,
      rng: { ...week4.rng, jobs: forcedRolls(1) },
    };
    const mods = modifiersFor(week5, 'village_watch', 'job');
    expect(mods.sources).toEqual(['lunar:waxing']);
    const second = job(week5, 'village_watch');
    expect(second.deltas.treasury).toBe(16); // floor(15 * 1.1)
    expect(second.deltas.stats.bellatores).toBe(2); // floor(2 * 1.1)
    expect(second.deltas.fatigue).toBe(5); // burdens are not Waxing quantities
  });

  it('a different activity in the Waxing week gets no bonus', () => {
    const state = ruleState({ elapsedWeeks: WEEK.plainWaxing, lastWeeklyActivityId: 'hermit' });
    expect(modifiersFor(state, 'hedge_knight', 'tutor').sources).toEqual([]);
    expect(tutor(state, 'hedge_knight').deltas.stats.bellatores).toBe(5);
  });

  it('the repeat must land on the Waxing week: a repeat in the New Moon week gets nothing', () => {
    const state = ruleState({ elapsedWeeks: WEEK.plainNew, lastWeeklyActivityId: 'hedge_knight' });
    expect(modifiersFor(state, 'hedge_knight', 'tutor').sources).toEqual([]);
  });

  it('rest is not a Waxing activity', () => {
    const state = ruleState({ elapsedWeeks: WEEK.plainWaxing, lastWeeklyActivityId: 'rest_home', fatigue: 30 });
    expect(modifiersFor(state, 'rest_home', 'rest').sources).toEqual([]);
  });

  it('Q4: single mode applies once whatever the streak; compounding stacks per repeat', () => {
    const state = ruleState({ elapsedWeeks: WEEK.plainWaxing, lastWeeklyActivityId: 'hedge_knight', waxingStreak: 3 });
    expect(modifiersFor(state, 'hedge_knight', 'tutor').factors?.statGainPct).toEqual([110]);

    const compounding = withOverrides(config, { astrology: { waxing: { mode: 'compounding' } } });
    const streakOne = { ...state, waxingStreak: 1 };
    expect(modifiersFor(streakOne, 'hedge_knight', 'tutor', compounding).factors?.statGainPct).toEqual([110, 110]);
    // floor(5 * 1.1 * 1.1) = floor(6.05)
    expect(tutor(streakOne, 'hedge_knight', compounding).deltas.stats.bellatores).toBe(6);
  });
});

describe('§5 rounding and §6 modifier precedence (rule level)', () => {
  it('Square + Waxing on a repeated tutor multiplies all factors, then floors once', () => {
    const state = ruleState({ elapsedWeeks: WEEK.squareWaxing, lastWeeklyActivityId: 'hedge_knight' });
    const mods = modifiersFor(state, 'hedge_knight', 'tutor');
    expect(mods.sources).toEqual(['solar:square', 'lunar:waxing']);
    // 5 * 1.3 * 1.1 = 7.15 -> 7. Flooring each step would give floor(floor(6.5) * 1.1) = 6.
    expect(tutor(state, 'hedge_knight').deltas.stats.bellatores).toBe(7);
  });

  it('Square doubles tutor Melancholy but leaves the opposing stat loss alone', () => {
    const state = ruleState({ elapsedWeeks: WEEK.squareNew });
    const result = tutor(state, 'hermit');
    expect(result.deltas.melancholy).toBe(10);
    expect(result.deltas.stats.bellatores).toBe(-1);
    expect(result.deltas.stats.oratores).toBe(6); // floor(5 * 1.3)
  });

  it('Opposition + Waxing on a repeated job: burdens x1.5, payout and gain x1.1', () => {
    const state = ruleState({
      elapsedWeeks: WEEK.oppositionWaxing,
      lastWeeklyActivityId: 'village_watch',
      rng: { ...ruleState().rng, jobs: forcedRolls(1) },
    });
    expect(modifiersFor(state, 'village_watch', 'job').sources).toEqual(['solar:opposition', 'lunar:waxing']);
    const success = job(state, 'village_watch');
    expect(success.deltas).toMatchObject({ treasury: 16, fatigue: 7 }); // floor(16.5), floor(7.5)

    const failure = job({ ...state, rng: { ...state.rng, jobs: forcedRolls(100) } }, 'village_watch');
    expect(failure.deltas).toMatchObject({ treasury: 0, fatigue: 15 }); // Q11: failure burdens too
  });

  it('Trine adds +15 to the job chance before the 95% clamp', () => {
    const mid = ruleState({ elapsedWeeks: WEEK.trine, stats: { laboratores: 40 } });
    expect(jobSuccessChance(mid, 'alehouse', modifiersFor(mid, 'alehouse', 'job'), config)).toBe(90);
    const high = ruleState({ elapsedWeeks: WEEK.trine, stats: { laboratores: 70 } });
    expect(jobSuccessChance(high, 'alehouse', modifiersFor(high, 'alehouse', 'job'), config)).toBe(95);

    const resolved = eventsOfType(job({ ...mid, rng: { ...mid.rng, jobs: forcedRolls(90) } }, 'alehouse').events, 'job_resolved');
    expect(resolved).toMatchObject([{ success: true, probability: 90, roll: 90 }]);
  });

  it('Solar Return + Waning Banquet: half price, recovery x1.5 floored', () => {
    const state = ruleState({ elapsedWeeks: WEEK.returnWaning, treasury: 30, fatigue: 60, melancholy: 60 });
    expect(modifiersFor(state, 'banquet', 'rest').sources).toEqual(['solar:return', 'lunar:waning']);
    expect(rest(state, 'banquet').deltas).toEqual({
      stats: { bellatores: 0, oratores: 0, laboratores: 0 },
      treasury: -15,
      fatigue: -52, // floor(35 * 1.5)
      melancholy: -52,
    });
  });

  it('Waning leaves Rest at Home alone by default', () => {
    const state = ruleState({ elapsedWeeks: WEEK.returnWaning, fatigue: 60, melancholy: 60 });
    expect(rest(state, 'rest_home').deltas).toMatchObject({ fatigue: -15, melancholy: -15 });
  });

  it('Solar Return + Waxing tutor repeat in the birth month', () => {
    const state = ruleState({ elapsedWeeks: 1, lastWeeklyActivityId: 'smuggler' });
    expect(modifiersFor(state, 'smuggler', 'tutor').sources).toEqual(['solar:return', 'lunar:waxing']);
    // Aries Laboratores 15: 5 * 1.2 * 1.1 = 6.6 -> 6
    expect(tutor(state, 'smuggler').deltas.stats.laboratores).toBe(6);
  });
});

// ---------------------------------------------------------------------------
// Engine scenarios (C1)
// ---------------------------------------------------------------------------

describe.runIf(hasHome)('engine: §5 empty purse', () => {
  it('an unaffordable tutor is rejected and leaves the state untouched', () => {
    const result = scenario({ treasury: 0, elapsedWeeks: WEEK.plainNew }, [{ type: 'TRAIN', tutor: 'hermit' }]);
    expect(result.error?.code).toBe('INSUFFICIENT_FUNDS');
    expect(result.final).toEqual(result.initial);
  });

  it('Rest at Home and Stables are still available and spend a week each', () => {
    const result = scenario({ treasury: 0, elapsedWeeks: WEEK.plainNew }, [
      { type: 'REST', rest: 'rest_home' },
      { type: 'WORK', job: 'stables' },
    ]);
    expect(result.error).toBeUndefined();
    expect(result.final.elapsedWeeks).toBe(WEEK.plainNew + 2);
    expect(result.final.treasury).toBe(6);
  });
});

describe.runIf(hasHome)('engine: §4 both conditions near ceiling', () => {
  it('a collapse on both burdens forces a convalescence week and never persists', () => {
    const result = scenario({ elapsedWeeks: WEEK.plainNew, fatigue: 76, melancholy: 74 }, [
      { type: 'TRAIN', tutor: 'smuggler' },
    ]);
    expect(result.error).toBeUndefined();
    expect(eventsOfType(result.events, 'collapse')).toMatchObject([{ cause: 'both' }]);
    expect(eventsOfType(result.events, 'convalescence')).toMatchObject([{ cause: 'home_collapse' }]);
    expect(eventsOfType(result.events, 'week_spent').map((e) => e.reason)).toEqual(['tutor', 'convalescence']);
    expect(result.final.elapsedWeeks).toBe(WEEK.plainNew + 2);
    // 81/79 after the lesson, then -15/-15.
    expect(result.final).toMatchObject({ fatigue: 66, melancholy: 64 });
    expect(collapseCause(result.final)).toBeNull();
  });

  it('a collapse in the last week ends in the deadline without passing week 96', () => {
    const result = scenario({ elapsedWeeks: 95, fatigue: 76, melancholy: 74 }, [{ type: 'TRAIN', tutor: 'smuggler' }]);
    expect(result.final.elapsedWeeks).toBe(96);
    expect(result.final).toMatchObject({ phase: 'defeat', outcome: 'deadline' });
    expect(eventsOfType(result.events, 'deadline')).toHaveLength(1);
  });
});

describe.runIf(hasHome)('engine: §6 two consecutive weekly activities under the Waxing Moon', () => {
  it('the repeated tutor in the Waxing week gains the bonus, floored once with Square', () => {
    const result = scenario({ elapsedWeeks: WEEK.squareNew, treasury: 100 }, [
      { type: 'TRAIN', tutor: 'hedge_knight' },
      { type: 'TRAIN', tutor: 'hedge_knight' },
    ]);
    const gains = eventsOfType(result.events, 'stat_changed')
      .filter((e) => e.source === 'tutor')
      .map((e) => e.amount);
    expect(gains).toEqual([6, 7]); // floor(5 * 1.3), floor(5 * 1.3 * 1.1)
    expect(result.final.lastWeeklyActivityId).toBe('hedge_knight');
    expect(coinDelta(result.events, 'treasury', 'tutor_fee')).toBe(-40);
  });

  it('a different activity between the repeats breaks the chain', () => {
    const result = scenario({ elapsedWeeks: WEEK.squareNew - 1, treasury: 100 }, [
      { type: 'TRAIN', tutor: 'hedge_knight' },
      { type: 'REST', rest: 'rest_home' },
      { type: 'TRAIN', tutor: 'hedge_knight' },
    ]);
    const gains = eventsOfType(result.events, 'stat_changed')
      .filter((e) => e.source === 'tutor')
      .map((e) => e.amount);
    // Week 11 (no aspect, Waning) then week 13 (Square, Waxing but not a repeat).
    expect(gains).toEqual([5, 6]);
  });
});
