/**
 * Contract tests for docs/open-questions-tasks.md (T2–T4): the settled Q1–Q13
 * and R2/R3 rules, exercised mainly against the `open-questions-decisions`
 * candidate, with the legacy defaults as the control.
 */
import { describe, expect, it } from 'vitest';
import { applyModifier, collectModifiers, solarAspect } from '../core/astrology.js';
import { getCalendar } from '../core/calendar.js';
import { withOverrides, type RulesConfig } from '../core/config.js';
import { resolveJob, resolveRest, resolveTutor } from '../core/economy.js';
import { encounterOdds, failurePenalty } from '../core/encounter.js';
import { applyAction, getAvailableActions } from '../core/index.js';
import { canUseConsumable } from '../core/items.js';
import { applyPilgrimageAction, pilgrimageActions, type PilgrimageAction } from '../core/pilgrimage.js';
import { createRngStreams } from '../core/rng.js';
import {
  RuleError, type ActivityId, type CampaignState, type GameAction, type GameEvent, type JobId, type LunarPhase,
  type RestId, type TutorId,
} from '../core/types.js';
import { createPolicies } from '../simulation/policies.js';
import { deriveBatchSeed, runCampaign } from '../simulation/runner.js';
import { assertInvariants } from './invariants.js';
import {
  coinDelta, eventsOfType, forcedRolls, ruleState, type PilgrimageOverrides, type StateOverrides,
} from './scenarios/harness.js';
import { loadContentConfig } from './support/config.js';

const legacy = loadContentConfig();
const candidate = loadContentConfig('variants/open-questions-decisions.json');
const TUTORS: readonly TutorId[] = ['hedge_knight', 'hermit', 'smuggler'];
const JOBS: readonly JobId[] = ['stables', 'alehouse', 'village_watch', 'scriptorium'];
const RESTS: readonly RestId[] = ['rest_home', 'bathhouse', 'shrine', 'banquet'];
// Aries (the harness default): weeks 4–7 are New/Waxing/Full/Waning with no solar aspect.
const ENTRY: Record<LunarPhase, number> = { new: 4, waxing: 5, full: 6, waning: 7 };
const FAIL = forcedRolls(100);
const PASS = forcedRolls(1);

/** Applies actions through the public reducer, checking invariants after each step. */
function run(state: CampaignState, actions: readonly GameAction[], cfg: RulesConfig = candidate) {
  const events: GameEvent[] = [];
  let current = state;
  for (const action of actions) {
    const result = applyAction(current, action, cfg);
    assertInvariants(result.state, cfg, current);
    events.push(...result.events);
    current = result.state;
  }
  return { state: current, events };
}

function rejection(state: CampaignState, action: GameAction, cfg: RulesConfig = candidate): string {
  const snapshot = structuredClone(state);
  try {
    applyAction(state, action, cfg);
  } catch (error) {
    expect(error).toBeInstanceOf(RuleError);
    expect(state).toEqual(snapshot); // untouched, RNG included
    return (error as RuleError).code;
  }
  throw new Error(`${action.type} was not rejected`);
}

function onRoad(
  entryWeek: number,
  pilgrimage: PilgrimageOverrides,
  rest: Omit<StateOverrides, 'pilgrimage'> = {},
  encounters = FAIL,
): CampaignState {
  const state = ruleState({
    elapsedWeeks: entryWeek + 1,
    furthestWaystation: pilgrimage.segmentIndex ?? 0,
    ...rest,
    pilgrimage: { segmentEntryWeek: entryWeek, ...pilgrimage },
  });
  state.rng = { ...state.rng, encounters };
  return state;
}

function firstWeek(test: (week: number) => boolean): number {
  for (let week = 0; week < legacy.calendar.totalWeeks; week++) if (test(week)) return week;
  throw new Error('no matching week');
}

const aspectAt = (week: number) => solarAspect(getCalendar(ruleState({ elapsedWeeks: week }), legacy).solarDistance, legacy);
const phaseAt = (week: number) => getCalendar(ruleState({ elapsedWeeks: week }), legacy).lunarPhase;

// ---------------------------------------------------------------------------
// T2: Q1 tutor burdens and Q5 Square
// ---------------------------------------------------------------------------

describe('Q1/Q5 tutor burdens under Square (T2)', () => {
  const burdens = (cfg: RulesConfig, solar: 'none' | 'square') => TUTORS.map((tutor) => {
    const mods = collectModifiers({ activityId: tutor, kind: 'tutor', solar, lunar: 'waning' }, cfg);
    const { deltas } = resolveTutor(ruleState({ treasury: 100 }), tutor, mods, createRngStreams(1), cfg);
    return [deltas.fatigue, deltas.melancholy];
  });

  it('candidate: normal 5/0, 0/5, 3/2 and Square 10/0, 0/10, 6/4', () => {
    expect(burdens(candidate, 'none')).toEqual([[5, 0], [0, 5], [3, 2]]);
    expect(burdens(candidate, 'square')).toEqual([[10, 0], [0, 10], [6, 4]]);
  });

  it('legacy control keeps Smuggler 5/5 and Melancholy-only Square doubling', () => {
    expect(burdens(legacy, 'none')).toEqual([[5, 0], [0, 5], [5, 5]]);
    expect(burdens(legacy, 'square')).toEqual([[5, 0], [0, 10], [5, 10]]);
    expect(collectModifiers({ activityId: 'hedge_knight', kind: 'tutor', solar: 'square', lunar: 'waning' }, legacy)
      .factors?.fatiguePct).toBeUndefined();
  });

  it('a Square lesson repeated in Waxing gains floor(5 x 1.3 x 1.2) = 7', () => {
    const mods = collectModifiers({
      activityId: 'hedge_knight', kind: 'tutor', solar: 'square', lunar: 'waxing', previousActivityId: 'hedge_knight',
    }, candidate);
    expect(applyModifier(5, mods, 'statGainPct')).toBe(7);
    expect(mods.fatiguePct).toBe(200);
  });

  it('Square never touches job or rest burdens', () => {
    for (const [ids, kind] of [[JOBS, 'job'], [RESTS, 'rest']] as const) {
      for (const activityId of ids) {
        const mods = collectModifiers({ activityId, kind, solar: 'square', lunar: 'waning' }, candidate);
        expect(mods.fatiguePct, activityId).toBe(100);
        expect(mods.melancholyPct, activityId).toBe(100);
      }
    }
  });

  it('applies through the reducer in a Square week', () => {
    const week = firstWeek((w) => aspectAt(w) === 'square' && phaseAt(w) === 'waning');
    const { events } = run(ruleState({ elapsedWeeks: week, treasury: 100 }), [{ type: 'TRAIN', tutor: 'smuggler' }]);
    expect(eventsOfType(events, 'burden_changed').map((e) => [e.burden, e.amount]))
      .toEqual([['fatigue', 6], ['melancholy', 4]]);
  });
});

// ---------------------------------------------------------------------------
// T3: Q13 home collapse fee and bounded recovery
// ---------------------------------------------------------------------------

describe('Q13 home collapse: physician fee and forced recovery (T3)', () => {
  // Aries ceilings 77 / 75; Smuggler adds 3F/2M and lowers Oratores (ceiling 74).
  const edge = { fatigue: 76, melancholy: 74 };
  const collapse = (overrides: Omit<StateOverrides, 'pilgrimage'>, cfg = candidate) =>
    run(ruleState({ elapsedWeeks: ENTRY.new, ...edge, ...overrides }), [{ type: 'TRAIN', tutor: 'smuggler' }], cfg);

  it('charges the fee once at the collapse, then one -15/-15 convalescence week', () => {
    const { state, events } = collapse({ treasury: 50 });
    expect(eventsOfType(events, 'collapse')).toEqual([
      { type: 'collapse', week: ENTRY.new, cause: 'both', fee: { nominal: 20, paid: 20 } },
    ]);
    expect(coinDelta(events, 'treasury', 'physician_fee')).toBe(-20);
    expect(coinDelta(events, 'treasury', 'medical_fee')).toBe(0);
    expect(eventsOfType(events, 'burden_changed').filter((e) => e.source === 'convalescence').map((e) => e.amount))
      .toEqual([-15, -15]);
    expect(state).toMatchObject({ treasury: 10, fatigue: 64, melancholy: 61, elapsedWeeks: ENTRY.new + 2 });
    expect(state.pendingConvalescence).toBeUndefined();
  });

  it.each([
    ['zero', 20, 0],
    ['partial', 25, 5],
    ['exact', 40, 20],
  ])('%s funds never create debt', (_label, treasury, paid) => {
    const { state, events } = collapse({ treasury });
    expect(eventsOfType(events, 'collapse')[0]!.fee).toEqual({ nominal: 20, paid });
    expect(coinDelta(events, 'treasury', 'physician_fee') + paid).toBe(0);
    expect(state.treasury).toBe(treasury - 20 - paid);
    expect(state.treasury).toBeGreaterThanOrEqual(0);
  });

  it('the legacy control charges no fee and records none', () => {
    const { events } = collapse({ treasury: 50 }, legacy);
    expect(eventsOfType(events, 'collapse')).toEqual([{ type: 'collapse', week: ENTRY.new, cause: 'both' }]);
    expect(coinDelta(events, 'treasury', 'physician_fee')).toBe(0);
  });

  it('a collapse in the last week still pays the fee but grants no recovery or extra week', () => {
    const { state, events } = run(ruleState({ elapsedWeeks: 95, ...edge }), [{ type: 'TRAIN', tutor: 'smuggler' }]);
    expect(coinDelta(events, 'treasury', 'physician_fee')).toBe(-20);
    expect(eventsOfType(events, 'convalescence')).toEqual([]);
    expect(state).toMatchObject({ elapsedWeeks: 96, phase: 'defeat', outcome: 'deadline', fatigue: 79 });
  });

  it('a collapse in the penultimate week convalesces once, then reaches the deadline', () => {
    const { state, events } = run(ruleState({ elapsedWeeks: 94, ...edge }), [{ type: 'TRAIN', tutor: 'smuggler' }]);
    expect(eventsOfType(events, 'week_spent').map((e) => e.reason)).toEqual(['tutor', 'convalescence']);
    expect(coinDelta(events, 'treasury', 'physician_fee')).toBe(-20);
    expect(state).toMatchObject({ elapsedWeeks: 96, phase: 'defeat', fatigue: 64, melancholy: 61 });
  });

  it('a continuing recovery episode never charges the fee again', () => {
    const weak = withOverrides(candidate, { failure: { homeCollapse: { recovery: 2 } } });
    const first = collapse({ treasury: 100 }, weak);
    // 79/76 -> 77/74 is still at both ceilings (77 / 74).
    expect(first.state).toMatchObject({ pendingConvalescence: 'home_collapse', fatigue: 77, melancholy: 74, treasury: 60 });
    expect(getAvailableActions(first.state, weak)).toEqual([{ type: 'REST', rest: 'rest_home' }]);
    expect(rejection(first.state, { type: 'BEGIN_PILGRIMAGE', carry: 0 }, weak)).toBe('INVALID_ACTION');
    const { state, events } = run(first.state, [{ type: 'REST', rest: 'rest_home' }], weak);
    expect(eventsOfType(events, 'collapse')).toEqual([]);
    expect(coinDelta(events, 'treasury')).toBe(0);
    expect(state).toMatchObject({ fatigue: 75, melancholy: 72, treasury: 60 });
    expect(state.pendingConvalescence).toBeUndefined();
  });

  it('convalescence ignores Waning and clears Waxing continuity', () => {
    // Collapse in a Full week -> convalescence in the following Waning week.
    const { state } = run(ruleState({ elapsedWeeks: ENTRY.full, ...edge }), [{ type: 'TRAIN', tutor: 'smuggler' }]);
    expect(state).toMatchObject({ fatigue: 64, melancholy: 61, waxingStreak: 0 });
    expect(state.lastWeeklyActivityId).toBeUndefined();
  });
});

describe('Q13 wipeout: settled losses and bounded recovery (T3)', () => {
  const fatigueWipeout = (rest: Omit<StateOverrides, 'pilgrimage'>, entry = ENTRY.waxing, pilgrimage: PilgrimageOverrides = {}) =>
    onRoad(entry, { currentThreat: 'oratores', ...pilgrimage }, { fatigue: 76, melancholy: 74, ...rest });
  const fight = (state: CampaignState, cfg = candidate) => {
    const result = applyPilgrimageAction(state, { type: 'CHOOSE_APPROACH', estate: 'bellatores' }, cfg);
    assertInvariants(result.state, cfg, state);
    return result;
  };

  it('recovers -35/-35 in the one convalescence week instead of a zero reset', () => {
    const { state, events } = fight(fatigueWipeout({ treasury: 50 }));
    expect(eventsOfType(events, 'wipeout')).toMatchObject([{ cause: 'fatigue' }]);
    expect(eventsOfType(events, 'burden_changed').filter((e) => e.source === 'wipeout_reset')).toEqual([]);
    expect(eventsOfType(events, 'burden_changed').filter((e) => e.source === 'convalescence').map((e) => e.amount))
      .toEqual([-35, -35]);
    expect(eventsOfType(events, 'week_spent')).toEqual([{ type: 'week_spent', week: ENTRY.waxing + 1, reason: 'convalescence' }]);
    expect(state).toMatchObject({ phase: 'home', fatigue: 56, melancholy: 39, elapsedWeeks: ENTRY.waxing + 2, treasury: 0 });
    expect(coinDelta(events, 'treasury', 'medical_fee')).toBe(-50);
    expect(coinDelta(events, 'treasury', 'physician_fee')).toBe(0); // a wipeout is not a home collapse
    expect(eventsOfType(events, 'collapse')).toEqual([]);
    expect(state.pendingConvalescence).toBeUndefined();
  });

  it('keeps equipment and checkpoints, loses the unused consumable', () => {
    const { state, events } = fight(fatigueWipeout({ furthestWaystation: 2 }, ENTRY.waxing, {
      segmentIndex: 2, equipmentId: 'gambeson', consumableId: 'theriac',
    }));
    expect(state.inventory).toEqual({ gambeson: 1 });
    expect(state.furthestWaystation).toBe(2);
    expect(eventsOfType(events, 'item_changed').map((e) => [e.itemId, e.source]))
      .toEqual([['gambeson', 'pilgrimage_slot_returned'], ['theriac', 'wipeout_lost']]);
  });

  it('a recovery too small to clear hands over to fee-free -15 home recovery', () => {
    const weak = withOverrides(candidate, { failure: { wipeoutBurdenReset: { recovery: 10 } } });
    const { state } = fight(fatigueWipeout({ treasury: 100 }), weak);
    expect(state).toMatchObject({ fatigue: 81, pendingConvalescence: 'wipeout' }); // 76 + 15 - 10
    expect(rejection(state, { type: 'BEGIN_PILGRIMAGE', carry: 0 }, weak)).toBe('INVALID_ACTION');
    const rested = run(state, [{ type: 'REST', rest: 'rest_home' }], weak);
    expect(rested.state.fatigue).toBe(66);
    expect(coinDelta(rested.events, 'treasury')).toBe(0);
    expect(rested.state.pendingConvalescence).toBeUndefined();
  });

  it('with no week left, settles losses and the deadline but grants no recovery', () => {
    const { state, events } = fight(fatigueWipeout({ treasury: 30 }, 95));
    expect(eventsOfType(events, 'convalescence')).toEqual([]);
    expect(coinDelta(events, 'treasury', 'medical_fee')).toBe(-30);
    expect(state).toMatchObject({ phase: 'defeat', outcome: 'deadline', elapsedWeeks: 96, fatigue: 91, treasury: 0 });
  });

  it('with one week left, spends it recovering, then reaches the deadline', () => {
    // Week 94 is a Full Moon segment: 76 + 30 = 106, then -35.
    const { state } = fight(fatigueWipeout({}, 94));
    expect(state).toMatchObject({ phase: 'defeat', elapsedWeeks: 96, fatigue: 71, melancholy: 39 });
  });

  it('the legacy zero and unchanged modes still behave as before', () => {
    expect(fight(fatigueWipeout({}), legacy).state).toMatchObject({ fatigue: 0, melancholy: 0 });
    const unchanged = withOverrides(legacy, { failure: { wipeoutBurdenReset: 'unchanged' } });
    expect(fight(fatigueWipeout({}), unchanged).state).toMatchObject({ fatigue: 91, pendingConvalescence: 'wipeout' });
  });
});

// ---------------------------------------------------------------------------
// T4: retained rules (contract confirmations)
// ---------------------------------------------------------------------------

describe('Q2 Purse Protection on failed Laboratores encounters', () => {
  const cost = (laboratores: number, equipmentId?: string) => failurePenalty({
    approach: 'laboratores', lunar: 'full', purseProtectionPct: Math.floor(laboratores / 2),
    ...(equipmentId ? { equipmentId } : {}),
  }, candidate).amount;

  it('floors 15 x (1 - P/100) x item once; Full Moon never doubles Coin', () => {
    expect(cost(50)).toBe(11);
    expect(cost(50, 'weighted_coin')).toBe(5); // floor(15 x 0.75 x 0.5) = floor(5.625)
    expect(cost(61)).toBe(10); // P = 30
    expect(cost(15)).toBe(13); // P = 7
    expect(failurePenalty({ approach: 'laboratores', lunar: 'new', purseProtectionPct: 25 }, legacy).amount).toBe(15);
  });

  const labRoad = (carried: number, laboratores: number, equipmentId?: string) => onRoad(ENTRY.waxing, {
    currentThreat: 'bellatores', carriedCoin: carried, departureCarriedCoin: carried,
    ...(equipmentId ? { equipmentId } : {}),
  }, { stats: { laboratores }, treasury: 100 });
  const fail = (state: CampaignState) => applyPilgrimageAction(state, { type: 'CHOOSE_APPROACH', estate: 'laboratores' }, candidate);

  it('exactly enough carried Coin survives', () => {
    const { state, events } = fail(labRoad(11, 50));
    expect(eventsOfType(events, 'wipeout')).toEqual([]);
    expect(state.pilgrimage?.carriedCoin).toBe(0);
  });

  it('wipeout retains floor(pre-lethal carried x P/100) at odd stats, unaffected by Weighted Coin', () => {
    const plain = fail(labRoad(9, 61)); // cost 10 > 9; P = 30 -> retain floor(2.7) = 2
    expect(coinDelta(plain.events, 'treasury', 'wipeout_retained')).toBe(2);
    const weighted = fail(labRoad(4, 61, 'weighted_coin')); // cost 5 > 4; retain floor(1.2) = 1
    expect(coinDelta(weighted.events, 'treasury', 'wipeout_retained')).toBe(1);
  });
});

describe('Q3/Q9 New Moon skip', () => {
  const skip: PilgrimageAction = { type: 'SKIP_ENCOUNTER' };
  const newMoonRoad = (pilgrimage: PilgrimageOverrides, rest: Omit<StateOverrides, 'pilgrimage'> = {}) =>
    onRoad(ENTRY.new, { currentThreat: 'bellatores', carriedCoin: 20, departureCarriedCoin: 20, ...pilgrimage }, rest);
  const has = (state: CampaignState) => pilgrimageActions(state, candidate).some((a) => a.type === 'SKIP_ENCOUNTER');

  it('is locked to the entry moon, costs 10 carried Coin, counts toward N and draws no roll or loot', () => {
    const state = newMoonRoad({});
    expect(phaseAt(state.elapsedWeeks)).toBe('waxing'); // the calendar moved on; the segment did not
    expect(has(state)).toBe(true);
    const result = applyPilgrimageAction(state, skip, candidate);
    assertInvariants(result.state, candidate, state);
    expect(result.state.rng).toEqual(state.rng);
    expect(eventsOfType(result.events, 'encounter_resolved')).toEqual([]);
    expect(coinDelta(result.events, 'carried', 'encounter_reward')).toBe(0);
    expect(result.state.pilgrimage).toMatchObject({ carriedCoin: 10, encounterIndex: 1, skipUsed: true });
    // Once per segment.
    const next = applyPilgrimageAction(result.state, { type: 'CONTINUE_ENCOUNTER' }, candidate).state;
    expect(has(next)).toBe(false);
    expect(rejection(next, skip)).toBe('SKIP_ALREADY_USED');
  });

  it('is unavailable outside New Moon segments and when unaffordable; rejection changes nothing', () => {
    expect(has(onRoad(ENTRY.waxing, { currentThreat: 'bellatores', carriedCoin: 20 }))).toBe(false);
    const poor = newMoonRoad({ carriedCoin: 9, departureCarriedCoin: 9 });
    expect(has(poor)).toBe(false);
    expect(rejection(poor, skip)).toBe('INSUFFICIENT_FUNDS');
    const exact = applyPilgrimageAction(newMoonRoad({ carriedCoin: 10, departureCarriedCoin: 10 }), skip, candidate);
    expect(exact.state.pilgrimage?.carriedCoin).toBe(0);
    expect(rejection(newMoonRoad({}), skip, legacy)).toBe('INVALID_ACTION'); // skipFee null
  });

  it('an unused skip does not roll into the next (Waxing-entered) segment', () => {
    const atWaystation = newMoonRoad({ stage: 'waystation_decision', encounterIndex: 5 });
    delete atWaystation.pilgrimage!.currentThreat;
    const next = applyPilgrimageAction(atWaystation, { type: 'CONTINUE_SEGMENT' }, candidate).state;
    expect(next.pilgrimage).toMatchObject({ segmentIndex: 1, segmentEntryWeek: ENTRY.waxing, skipUsed: false });
    expect(has(next)).toBe(false);
  });

  it('can complete a regular segment and win the finale', () => {
    const last = applyPilgrimageAction(newMoonRoad({ encounterIndex: 4 }), skip, candidate);
    expect(eventsOfType(last.events, 'waystation_reached')).toEqual([{ type: 'waystation_reached', week: ENTRY.new + 1, waystation: 1 }]);
    const finale = newMoonRoad({ segmentIndex: 5, isFinal: true, encounterIndex: 7 });
    const won = applyPilgrimageAction(finale, skip, candidate);
    expect(won.state).toMatchObject({ phase: 'victory', outcome: 'victory' });
  });
});

describe('Q6/Q10 equipment ordering', () => {
  it('Gambeson subtracts after the Full Moon doubles: 15 x 2 - 5 = 25', () => {
    expect(failurePenalty({ approach: 'bellatores', lunar: 'full', equipmentId: 'gambeson' }, candidate).amount).toBe(25);
    expect(failurePenalty({ approach: 'oratores', lunar: 'full', equipmentId: 'gambeson' }, candidate).amount).toBe(30);
  });

  it('Saint\'s Relic adds 10 points against Oratores threats for any approach, before the clamp', () => {
    const odds = (stat: number, threat: 'oratores' | 'bellatores', approach: 'bellatores' | 'oratores' | 'laboratores', relic: boolean) =>
      encounterOdds({
        stat, approach, threat, lunar: 'new', segmentIndex: 4, isFinal: false,
        ...(relic ? { equipmentId: 'saints_relic' } : {}),
      }, candidate).probability;
    for (const approach of ['bellatores', 'oratores', 'laboratores'] as const) {
      expect(odds(40, 'oratores', approach, true) - odds(40, 'oratores', approach, false), approach).toBe(10);
      expect(odds(40, 'bellatores', approach, true)).toBe(odds(40, 'bellatores', approach, false));
    }
    expect(odds(90, 'oratores', 'oratores', false)).toBe(90);
    expect(odds(90, 'oratores', 'oratores', true)).toBe(95);
  });
});

describe('Q11 Opposition job burdens', () => {
  const mods = collectModifiers({ activityId: 'alehouse', kind: 'job', solar: 'opposition', lunar: 'waning' }, candidate);

  it('multiplies success and failure burdens by 1.5, flooring each magnitude once', () => {
    expect(applyModifier(5, mods, 'fatiguePct')).toBe(7);
    expect(applyModifier(2, mods, 'melancholyPct')).toBe(3);
    expect(applyModifier(10, mods, 'fatiguePct')).toBe(15);
  });

  it('includes automatic Stables: 2/2 becomes 3/3', () => {
    const stables = collectModifiers({ activityId: 'stables', kind: 'job', solar: 'opposition', lunar: 'waning' }, candidate);
    const { deltas } = resolveJob(ruleState(), 'stables', stables, createRngStreams(1), candidate);
    expect([deltas.fatigue, deltas.melancholy]).toEqual([3, 3]);
  });
});

describe('Q7/R3 retreat', () => {
  const retreat = (carried: number, departure: number, treasury: number) => applyPilgrimageAction(
    onRoad(ENTRY.waxing, { stage: 'continue_or_retreat', encounterIndex: 2, carriedCoin: carried, departureCarriedCoin: departure }, { treasury }),
    { type: 'RETREAT' }, candidate,
  );

  it('forfeits half the remaining earned loot first, then a 10-Coin toll from carried Coin', () => {
    const { state, events } = retreat(13, 10, 0); // earned 3 -> keep 1, forfeit 2; toll 10 from 11 carried
    expect(coinDelta(events, 'carried', 'retreat_loot_forfeit')).toBe(-2);
    expect(coinDelta(events, 'carried', 'retreat_toll')).toBe(-10);
    expect(state).toMatchObject({ phase: 'home', treasury: 1 });
  });

  it('takes the toll shortfall from the treasury, never into debt, without blocking or spending a week', () => {
    const { state, events } = retreat(3, 0, 4); // keep 1 carried; toll 1 carried + 4 treasury, 5 unpaid
    expect(coinDelta(events, 'carried', 'retreat_toll')).toBe(-1);
    expect(coinDelta(events, 'treasury', 'retreat_toll')).toBe(-4);
    expect(state).toMatchObject({ phase: 'home', treasury: 0, elapsedWeeks: ENTRY.waxing + 1 });
  });
});

describe('Q8 consumable timing', () => {
  it('Theriac/Wort only between encounters and at waystations; Metheglin only on a pending failure', () => {
    for (const item of ['theriac', 'st_johns_wort']) {
      expect(canUseConsumable(item, 'continue_or_retreat', candidate)).toBe(true);
      expect(canUseConsumable(item, 'waystation_decision', candidate)).toBe(true);
      expect(canUseConsumable(item, 'reroll_or_accept', candidate)).toBe(false);
      expect(canUseConsumable(item, 'choose_approach', candidate)).toBe(false);
    }
    expect(canUseConsumable('metheglin', 'reroll_or_accept', candidate)).toBe(true);
    expect(canUseConsumable('metheglin', 'continue_or_retreat', candidate)).toBe(false);
  });

  it('using one at a waystation spends no week', () => {
    const state = onRoad(ENTRY.waxing, { stage: 'waystation_decision', encounterIndex: 5, consumableId: 'theriac' }, { fatigue: 40 });
    delete state.pilgrimage!.currentThreat;
    const used = applyPilgrimageAction(state, { type: 'USE_CONSUMABLE', itemId: 'theriac' }, candidate).state;
    expect(used).toMatchObject({ fatigue: 10, elapsedWeeks: state.elapsedWeeks });
  });
});

describe('Q4/Q12/R2 home lunar effects', () => {
  const gain = (lunar: LunarPhase, activityId: ActivityId, kind: 'tutor' | 'job', previous?: ActivityId, streak = 0) =>
    collectModifiers({ activityId, kind, solar: 'none', lunar, waxingStreak: streak,
      ...(previous ? { previousActivityId: previous } : {}) }, candidate);

  it('Waxing gives one x1.20 bonus for the exact previous activity, never compounding', () => {
    expect(gain('waxing', 'hedge_knight', 'tutor', 'hedge_knight').statGainPct).toBe(120);
    expect(gain('waxing', 'hedge_knight', 'tutor', 'hedge_knight', 5).statGainPct).toBe(120);
    expect(gain('waxing', 'hedge_knight', 'tutor', 'hermit').statGainPct).toBe(100);
    expect(gain('waxing', 'hedge_knight', 'tutor', 'rest_home').statGainPct).toBe(100);
    expect(gain('waxing', 'hedge_knight', 'tutor').statGainPct).toBe(100);
    expect(applyModifier(2, gain('waxing', 'alehouse', 'job', 'alehouse'), 'statGainPct')).toBe(2);
  });

  it('Waxing through the reducer: repeat boosts, an interruption breaks it', () => {
    const lessons = (previous?: ActivityId) => {
      const state = ruleState({ elapsedWeeks: ENTRY.waxing, treasury: 100, ...(previous ? { lastWeeklyActivityId: previous } : {}) });
      return eventsOfType(run(state, [{ type: 'TRAIN', tutor: 'hedge_knight' }]).events, 'stat_changed')
        .find((e) => e.source === 'tutor')!.amount;
    };
    expect(lessons('hedge_knight')).toBe(6);
    expect(lessons('bathhouse')).toBe(5);
    expect(lessons()).toBe(5);
  });

  it('New/Full Moon +20% applies only to the named activities, gains and payouts only', () => {
    for (const [lunar, boosted] of [
      ['new', ['smuggler', 'alehouse']],
      ['full', ['hedge_knight', 'hermit', 'village_watch', 'scriptorium']],
    ] as const) {
      for (const id of [...TUTORS, ...JOBS]) {
        const kind = (TUTORS as readonly string[]).includes(id) ? 'tutor' : 'job';
        const mods = gain(lunar, id, kind);
        const expected = (boosted as readonly string[]).includes(id) ? 120 : 100;
        expect([mods.statGainPct, mods.payoutPct], `${lunar} ${id}`).toEqual([expected, expected]);
        expect([mods.costPct, mods.fatiguePct, mods.melancholyPct, mods.successBonusPts]).toEqual([100, 100, 100, 0]);
      }
    }
  });

  it('Waning x1.5 recovery applies only to paid rests', () => {
    for (const rest of RESTS) {
      const mods = collectModifiers({ activityId: rest, kind: 'rest', solar: 'none', lunar: 'waning' }, candidate);
      const { deltas } = resolveRest(ruleState({ fatigue: 90, melancholy: 90, treasury: 100 }), rest, mods, createRngStreams(1), candidate);
      const def = candidate.rest[rest];
      const pct = rest === 'rest_home' ? 100 : 150;
      expect([-deltas.fatigue, -deltas.melancholy], rest)
        .toEqual([Math.floor(def.fatigue * pct / 100), Math.floor(def.melancholy * pct / 100)]);
    }
  });
});

describe('policies stay legal under the candidate and controls (T4)', () => {
  it.each([['candidate', candidate], ['legacy', legacy], ['astrology-full', loadContentConfig('variants/astrology-full.json')]] as const)(
    '%s: every policy finishes strict campaigns',
    (_label, config) => {
      for (const policy of createPolicies(config)) {
        for (const sign of ['aries', 'gemini', 'taurus'] as const) {
          const seed = deriveBatchSeed(7, sign, 0);
          const a = runCampaign({ seed, sign, policy, config, strict: true });
          expect(['victory', 'defeat']).toContain(a.finalState.phase);
          // Deterministic replay.
          const b = runCampaign({ seed, sign, policy, config, strict: true });
          expect(JSON.stringify(b.events)).toBe(JSON.stringify(a.events));
        }
      }
    },
  );
});
