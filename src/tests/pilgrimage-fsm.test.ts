/**
 * C2 pilgrimage state machine (tech §7). Drives `applyPilgrimageAction`
 * directly through the D2 harness, with D1 invariants checked after every
 * step. Mirrors the D2 engine scenarios that C2 covers, so they can run
 * before C1 wires the state machine into `applyAction`.
 */
import { describe, expect, it } from 'vitest';
import { withOverrides, type RulesConfig } from '../core/config.js';
import {
  applyPilgrimageAction,
  beginPilgrimageDescriptor,
  isPilgrimageAction,
  pilgrimageActions,
  type PilgrimageAction,
} from '../core/pilgrimage.js';
import { applyAction, getAvailableActions } from '../core/index.js';
import { createRngStreams, d100, rollInt } from '../core/rng.js';
import { RuleError, type CampaignState, type GameAction, type GameEvent, type LunarPhase } from '../core/types.js';
import { assertInvariants } from './invariants.js';
import {
  coinDelta,
  defaultConfig as config,
  eventsOfType,
  forcedRolls,
  ruleState,
  type PilgrimageOverrides,
  type StateOverrides,
} from './scenarios/harness.js';

const ENTRY: Record<LunarPhase, number> = { new: 4, waxing: 5, full: 6, waning: 7 };
const FAIL = forcedRolls(100);
const PASS = forcedRolls(1);

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

interface Run {
  initial: CampaignState;
  final: CampaignState;
  steps: CampaignState[];
  events: GameEvent[];
}

/** Applies pilgrimage actions with D1 invariants (including transitions) after each. */
function run(initial: CampaignState, actions: readonly PilgrimageAction[], cfg: RulesConfig = config): Run {
  assertInvariants(initial, cfg);
  const steps: CampaignState[] = [];
  const events: GameEvent[] = [];
  let state = initial;
  for (const action of actions) {
    const result = applyPilgrimageAction(state, action, cfg);
    assertInvariants(result.state, cfg, state);
    steps.push(result.state);
    events.push(...result.events);
    state = result.state;
  }
  return { initial, final: state, steps, events };
}

function rejection(state: CampaignState, action: PilgrimageAction, cfg = config): string {
  const before = structuredClone(state);
  try {
    applyPilgrimageAction(state, action, cfg);
  } catch (error) {
    expect(error).toBeInstanceOf(RuleError);
    expect(state).toEqual(before);
    return (error as RuleError).code;
  }
  throw new Error(`${action.type} was accepted`);
}

/** Total Coin (treasury + carried). */
const totalCoin = (s: CampaignState) => s.treasury + (s.pilgrimage?.carriedCoin ?? 0);

describe('departure (§7)', () => {
  it('fee and carried Coin leave the treasury together; one week is spent and a threat revealed', () => {
    const r = run(ruleState({ elapsedWeeks: ENTRY.waxing }), [{ type: 'BEGIN_PILGRIMAGE', carry: 20 }]);
    expect(r.final).toMatchObject({ phase: 'pilgrimage', treasury: 20, elapsedWeeks: ENTRY.waxing + 1 });
    expect(r.final.pilgrimage).toMatchObject({
      stage: 'choose_approach', segmentIndex: 0, encounterIndex: 0, segmentEntryWeek: ENTRY.waxing,
      carriedCoin: 20, departureCarriedCoin: 20, earnedCoin: 0,
    });
    expect(r.final.pilgrimage?.currentThreat).toBeDefined();
    expect(totalCoin(r.final)).toBe(50 - 10);
    expect(r.events.map((e) => e.type)).toEqual([
      'coin_changed', 'coin_changed', 'coin_changed', 'week_spent', 'pilgrimage_started', 'encounter_drawn',
    ]);
    expect(coinDelta(r.events, 'treasury', 'departure_fee')).toBe(-10);
    expect(coinDelta(r.events, 'treasury', 'carry_out')).toBe(-20);
    expect(coinDelta(r.events, 'carried', 'carry_out')).toBe(20);
    expect(r.final.rng.jobs).toBe(r.initial.rng.jobs);
    expect(r.final.rng.rewards).toBe(r.initial.rng.rewards);
    expect(r.events.every((event) => event.week === ENTRY.waxing)).toBe(true);
  });

  it('starts at the checkpoint and breaks a Waxing chain', () => {
    const r = run(ruleState({ furthestWaystation: 3, lastWeeklyActivityId: 'stables', waxingStreak: 2 }), [
      { type: 'BEGIN_PILGRIMAGE', carry: 0 },
    ]);
    expect(r.final.pilgrimage?.segmentIndex).toBe(3);
    expect(r.final.lastWeeklyActivityId).toBeUndefined();
    expect(r.final.waxingStreak).toBe(0);
  });

  it('carrying everything after the fee is allowed; one more is refused untouched', () => {
    expect(run(ruleState(), [{ type: 'BEGIN_PILGRIMAGE', carry: 40 }]).final.treasury).toBe(0);
    expect(rejection(ruleState(), { type: 'BEGIN_PILGRIMAGE', carry: 41 })).toBe('INSUFFICIENT_FUNDS');
  });

  it('an empty purse cannot pay the fee, and no descriptor is offered', () => {
    expect(beginPilgrimageDescriptor(ruleState({ treasury: 9 }), config)).toBeNull();
    expect(rejection(ruleState({ treasury: 9 }), { type: 'BEGIN_PILGRIMAGE', carry: 0 })).toBe('INSUFFICIENT_FUNDS');
    expect(beginPilgrimageDescriptor(ruleState({ treasury: 50 }), config)).toEqual({
      type: 'BEGIN_PILGRIMAGE', minCarry: 0, maxCarry: 40, fee: 10, isFinal: false, equipmentIds: [], consumableIds: [],
    });
  });

  it.each(['home_collapse', 'wipeout'] as const)('direct entry respects pending %s convalescence', (cause) => {
    const state = ruleState({ pendingConvalescence: cause });
    expect(beginPilgrimageDescriptor(state, config)).toBeNull();
    expect(rejection(state, { type: 'BEGIN_PILGRIMAGE', carry: 0 })).toBe('INVALID_ACTION');
  });

  it('is refused with no week left, from the road, with a bad carry, or at the final (C4)', () => {
    expect(rejection(ruleState({ elapsedWeeks: 96 }), { type: 'BEGIN_PILGRIMAGE', carry: 0 })).toBe('DEADLINE_REACHED');
    expect(beginPilgrimageDescriptor(ruleState({ elapsedWeeks: 96 }), config)).toBeNull();
    expect(rejection(onRoad(ENTRY.waxing, { currentThreat: 'oratores' }), { type: 'BEGIN_PILGRIMAGE', carry: 0 }))
      .toBe('INVALID_PHASE');
    expect(rejection(ruleState(), { type: 'BEGIN_PILGRIMAGE', carry: -1 })).toBe('INVALID_ACTION');
    expect(rejection(ruleState(), { type: 'BEGIN_PILGRIMAGE', carry: 1.5 })).toBe('INVALID_ACTION');
    expect(rejection(ruleState({ furthestWaystation: 5 }), { type: 'BEGIN_PILGRIMAGE', carry: 0 })).toBe('INVALID_ACTION');
  });
});

describe('encounters (§7)', () => {
  it('a success pays 1d4 into carried and earned Coin and advances once', () => {
    const r = run(onRoad(ENTRY.waxing, { currentThreat: 'laboratores', carriedCoin: 5, departureCarriedCoin: 5 }, {}, PASS), [
      { type: 'CHOOSE_APPROACH', estate: 'bellatores' },
    ]);
    const reward = coinDelta(r.events, 'carried', 'encounter_reward');
    expect(reward).toBeGreaterThanOrEqual(1);
    expect(reward).toBeLessThanOrEqual(4);
    const expectedReward = rollInt(r.initial.rng.rewards, 1, config.encounters.rewardCoinDie);
    expect(reward).toBe(expectedReward.value);
    expect(r.final.rng.rewards).toBe(expectedReward.state);
    expect(r.final.rng.encounters).toBe(d100(r.initial.rng.encounters).state);
    expect(r.final.rng.jobs).toBe(r.initial.rng.jobs);
    expect(r.final.pilgrimage).toMatchObject({
      stage: 'continue_or_retreat', encounterIndex: 1, carriedCoin: 5 + reward, earnedCoin: reward,
      currentApproach: 'bellatores', lastRoll: 1,
    });
    // Aries Bellatores 20 at advantage: floor(20 * 1.5) + 40 road = 70.
    expect(eventsOfType(r.events, 'encounter_resolved')).toEqual([{
      type: 'encounter_resolved', week: ENTRY.waxing + 1, segmentIndex: 0, isFinal: false, encounterIndex: 0,
      threat: 'laboratores', approach: 'bellatores', success: true, probability: 70, roll: 1,
    }]);
  });

  it('uses the lunar phase locked at segment entry (Full Moon advantage x2)', () => {
    const r = run(onRoad(ENTRY.full, { currentThreat: 'laboratores' }, {}, PASS), [{ type: 'CHOOSE_APPROACH', estate: 'bellatores' }]);
    expect(eventsOfType(r.events, 'encounter_resolved')[0]?.probability).toBe(80); // 40 + 40
  });

  it('reward dice do not shift later threat draws or encounter checks', () => {
    const initial = onRoad(ENTRY.waxing, { currentThreat: 'laboratores' }, {}, PASS);
    const actions: PilgrimageAction[] = [
      { type: 'CHOOSE_APPROACH', estate: 'bellatores' }, { type: 'CONTINUE_ENCOUNTER' },
      { type: 'CHOOSE_APPROACH', estate: 'bellatores' },
    ];
    const baseline = run(initial, actions);
    const variant = withOverrides(config, { encounters: { rewardCoinDie: 1 } });
    const differentRewards = run(initial, actions, variant);
    expect(eventsOfType(baseline.events, 'encounter_drawn')).toEqual(eventsOfType(differentRewards.events, 'encounter_drawn'));
    expect(eventsOfType(baseline.events, 'encounter_resolved')).toEqual(eventsOfType(differentRewards.events, 'encounter_resolved'));
    expect(baseline.final.rng.encounters).toBe(differentRewards.final.rng.encounters);
  });

  it('CONTINUE_ENCOUNTER reveals the next threat without spending a week', () => {
    const r = run(onRoad(ENTRY.waxing, { stage: 'continue_or_retreat', encounterIndex: 2, currentThreat: 'oratores' }), [
      { type: 'CONTINUE_ENCOUNTER' },
    ]);
    expect(r.final.pilgrimage).toMatchObject({ stage: 'choose_approach', encounterIndex: 2 });
    expect(r.final.pilgrimage?.lastRoll).toBeUndefined();
    expect(eventsOfType(r.events, 'encounter_drawn')).toMatchObject([{ encounterIndex: 2 }]);
    expect(r.final.elapsedWeeks).toBe(r.initial.elapsedWeeks);
  });

  it('a failure applies the penalty (Full Moon doubles Fatigue) and still advances once', () => {
    const r = run(onRoad(ENTRY.full, { currentThreat: 'oratores' }, { fatigue: 10 }), [{ type: 'CHOOSE_APPROACH', estate: 'bellatores' }]);
    expect(r.final.fatigue).toBe(40);
    expect(r.final.rng.rewards).toBe(r.initial.rng.rewards);
    expect(r.final.pilgrimage).toMatchObject({ stage: 'continue_or_retreat', encounterIndex: 1 });
    expect(eventsOfType(r.events, 'burden_changed')).toMatchObject([{ burden: 'fatigue', amount: 30, source: 'encounter_penalty' }]);
  });

  it('with Metheglin carried, a failure waits at reroll_or_accept; ACCEPT_RESULT charges it once', () => {
    const r = run(onRoad(ENTRY.waxing, { currentThreat: 'oratores', consumableId: 'metheglin' }, { fatigue: 10 }), [
      { type: 'CHOOSE_APPROACH', estate: 'bellatores' },
      { type: 'ACCEPT_RESULT' },
    ]);
    expect(r.steps[0]?.pilgrimage).toMatchObject({ stage: 'reroll_or_accept', pendingFailure: true, encounterIndex: 0 });
    expect(r.steps[0]?.fatigue).toBe(10);
    expect(r.final.fatigue).toBe(25);
    expect(r.final.pilgrimage).toMatchObject({ stage: 'continue_or_retreat', encounterIndex: 1, consumableId: 'metheglin', consumableUsed: false });
    expect(r.final.pilgrimage?.pendingFailure).toBeUndefined();
  });

  it('item hooks apply to the carried equipment (Gambeson 25 under a Full Moon)', () => {
    const r = run(onRoad(ENTRY.full, { currentThreat: 'oratores', equipmentId: 'gambeson' }), [{ type: 'CHOOSE_APPROACH', estate: 'bellatores' }]);
    expect(r.final.fatigue).toBe(25);
  });
});

describe('1 Coin short of a failure (§7, §13)', () => {
  const road = (carried: number, rest: Omit<StateOverrides, 'pilgrimage'> = {}) =>
    onRoad(ENTRY.waxing, { carriedCoin: carried, departureCarriedCoin: carried, currentThreat: 'bellatores' }, rest);

  it('carried Coin equal to the penalty survives at 0', () => {
    const r = run(road(15), [{ type: 'CHOOSE_APPROACH', estate: 'laboratores' }]);
    expect(eventsOfType(r.events, 'wipeout')).toEqual([]);
    expect(r.final.pilgrimage).toMatchObject({ carriedCoin: 0, encounterIndex: 1, stage: 'continue_or_retreat' });
    expect(coinDelta(r.events, 'carried', 'laboratores_penalty')).toBe(-15);
  });

  it('one short is a financial wipeout: carried never negative, fee charged, burdens reset, one week convalescing', () => {
    const r = run(road(14, { fatigue: 30, melancholy: 20 }), [{ type: 'CHOOSE_APPROACH', estate: 'laboratores' }]);
    expect(eventsOfType(r.events, 'wipeout')).toMatchObject([{ cause: 'coin' }]);
    expect(coinDelta(r.events, 'carried', 'laboratores_penalty')).toBe(0);
    let carried = 14;
    for (const e of eventsOfType(r.events, 'coin_changed').filter((e) => e.account === 'carried')) {
      carried += e.amount;
      expect(carried).toBeGreaterThanOrEqual(0);
    }
    expect(carried).toBe(0);
    // Retained floor(14 * 7%) = 0; fee min(50, 50).
    expect(r.final).toMatchObject({ phase: 'home', treasury: 0, fatigue: 0, melancholy: 0, elapsedWeeks: ENTRY.waxing + 2 });
    expect(r.final.pilgrimage).toBeUndefined();
    expect(eventsOfType(r.events, 'convalescence')).toEqual([{ type: 'convalescence', week: ENTRY.waxing + 1, cause: 'wipeout' }]);
    expect(eventsOfType(r.events, 'week_spent')).toEqual([{ type: 'week_spent', week: ENTRY.waxing + 1, reason: 'convalescence' }]);
  });

  it('Purse Protection returns its share of the pre-lethal carried Coin, then the fee', () => {
    const r = run(road(14, { stats: { laboratores: 60 }, treasury: 100 }), [{ type: 'CHOOSE_APPROACH', estate: 'laboratores' }]);
    expect(coinDelta(r.events, 'treasury', 'wipeout_retained')).toBe(4); // floor(14 * 30%)
    expect(coinDelta(r.events, 'carried', 'wipeout_lost')).toBe(-10);
    expect(coinDelta(r.events, 'treasury', 'medical_fee')).toBe(-50);
    expect(r.final.treasury).toBe(54);
  });

  it('the medical fee never creates debt', () => {
    const r = run(road(14, { treasury: 20 }), [{ type: 'CHOOSE_APPROACH', estate: 'laboratores' }]);
    expect(r.final.treasury).toBe(0);
    expect(coinDelta(r.events, 'treasury', 'medical_fee')).toBe(-20);
  });

  it('a wipeout that leaves a burden collapsed hands over to the reducer\'s pending convalescence', () => {
    const variant = withOverrides(config, { failure: { wipeoutBurdenReset: 'unchanged' } });
    const r = run(onRoad(ENTRY.waxing, { currentThreat: 'oratores' }, { fatigue: 70 }), [{ type: 'CHOOSE_APPROACH', estate: 'bellatores' }], variant);
    expect(r.final).toMatchObject({ phase: 'home', fatigue: 85, pendingConvalescence: 'wipeout' });
    expect(getAvailableActions(r.final, variant)).toEqual([{ type: 'REST', rest: 'rest_home' }]);
    expect(() => applyAction(r.final, { type: 'BEGIN_PILGRIMAGE', carry: 0 }, variant)).toThrow(RuleError);
    const rested = applyAction(r.final, { type: 'REST', rest: 'rest_home' }, variant);
    assertInvariants(rested.state, variant, r.final);
    expect(rested.state.fatigue).toBe(70);
    expect(rested.state.pendingConvalescence).toBeUndefined();
  });

  it('wipeoutBurdenReset "unchanged" keeps the burdens', () => {
    const variant = withOverrides(config, { failure: { wipeoutBurdenReset: 'unchanged' } });
    const r = run(road(0, { fatigue: 30 }), [{ type: 'CHOOSE_APPROACH', estate: 'laboratores' }], variant);
    expect(r.final.fatigue).toBe(30);
  });
});

describe('both conditions near ceiling on the road (§4, §7)', () => {
  // Aries: Fatigue ceiling 77, Melancholy ceiling 75.
  it('a failed Bellatores approach wipes out on Fatigue', () => {
    const r = run(onRoad(ENTRY.waxing, { currentThreat: 'oratores' }, { fatigue: 76, melancholy: 74 }), [
      { type: 'CHOOSE_APPROACH', estate: 'bellatores' },
    ]);
    expect(eventsOfType(r.events, 'wipeout')).toMatchObject([{ cause: 'fatigue' }]);
    expect(r.final).toMatchObject({ phase: 'home', fatigue: 0, melancholy: 0 });
  });

  it('a failed Oratores approach under a Full Moon (+30) wipes out on Melancholy; 44 survives at 74', () => {
    const lethal = run(onRoad(ENTRY.full, { currentThreat: 'laboratores' }, { melancholy: 45 }), [{ type: 'CHOOSE_APPROACH', estate: 'oratores' }]);
    expect(eventsOfType(lethal.events, 'wipeout')).toMatchObject([{ cause: 'melancholy' }]);
    const survives = run(onRoad(ENTRY.full, { currentThreat: 'laboratores' }, { melancholy: 44 }), [{ type: 'CHOOSE_APPROACH', estate: 'oratores' }]);
    expect(survives.final.melancholy).toBe(74);
    expect(survives.final.pilgrimage).toMatchObject({ encounterIndex: 1, stage: 'continue_or_retreat' });
  });
});

describe('retreat, waystations and checkpoints (§7)', () => {
  it('retreat after encounter 3: earned loot halved, toll from carried, departure Coin protected, no week', () => {
    const r = run(
      onRoad(ENTRY.waxing, { stage: 'continue_or_retreat', encounterIndex: 3, carriedCoin: 28, departureCarriedCoin: 20, earnedCoin: 8 }, { treasury: 30 }),
      [{ type: 'RETREAT' }],
    );
    expect(eventsOfType(r.events, 'retreat')).toEqual([{ type: 'retreat', week: ENTRY.waxing + 1, segmentIndex: 0 }]);
    expect(coinDelta(r.events, 'carried', 'retreat_loot_forfeit')).toBe(-4);
    expect(coinDelta(r.events, 'carried', 'retreat_toll')).toBe(-5);
    expect(eventsOfType(r.events, 'week_spent')).toEqual([]);
    expect(r.final).toMatchObject({ phase: 'home', treasury: 49, elapsedWeeks: ENTRY.waxing + 1, furthestWaystation: 0 });
  });

  it('Q7: a toll carried Coin cannot cover comes from the treasury, never below 0', () => {
    const r = run(onRoad(ENTRY.waxing, { stage: 'continue_or_retreat', encounterIndex: 1, carriedCoin: 2, departureCarriedCoin: 2 }, { treasury: 2 }), [
      { type: 'RETREAT' },
    ]);
    expect(coinDelta(r.events, 'carried', 'retreat_toll')).toBe(-2);
    expect(coinDelta(r.events, 'treasury', 'retreat_toll')).toBe(-2);
    expect(r.final.treasury).toBe(0);
  });

  it('a Coin penalty that ate into earned loot cannot forfeit more than is carried', () => {
    const r = run(onRoad(ENTRY.waxing, { stage: 'continue_or_retreat', encounterIndex: 4, carriedCoin: 3, departureCarriedCoin: 0, earnedCoin: 10 }, { treasury: 0 }), [
      { type: 'RETREAT' },
    ]);
    expect(coinDelta(r.events, 'carried', 'retreat_loot_forfeit')).toBe(-2); // retain floor(3 * 50%)
    expect(coinDelta(r.events, 'carried', 'retreat_toll')).toBe(-1);
    expect(r.final.treasury).toBe(0);
  });

  it.each([
    [23, -2, 21], // 3 earned Coin remain: retain floor(3 / 2), protecting the 20-Coin stake
    [18, 0, 18], // all earnings were spent; no remaining loot to forfeit
  ])('retreat with %i carried forfeits only remaining earnings', (carriedCoin, forfeited, banked) => {
    const variant = withOverrides(config, { failure: { retreatToll: 0 } });
    const initial = onRoad(ENTRY.waxing, {
      stage: 'continue_or_retreat', encounterIndex: 3,
      carriedCoin, departureCarriedCoin: 20, earnedCoin: 10,
    }, { treasury: 0 });
    const result = applyAction(initial, { type: 'RETREAT' }, variant);
    assertInvariants(result.state, variant, initial);
    expect(coinDelta(result.events, 'carried', 'retreat_loot_forfeit')).toBe(forfeited);
    expect(result.state.treasury).toBe(banked);
    expect(result.state.treasury - totalCoin(initial)).toBe(forfeited);
  });

  it('the last encounter unlocks one waystation; RETURN_HOME banks everything for free', () => {
    const r = run(
      onRoad(ENTRY.waxing, { segmentIndex: 3, encounterIndex: 4, currentThreat: 'laboratores', carriedCoin: 12, departureCarriedCoin: 12 }, { treasury: 5 }, PASS),
      [{ type: 'CHOOSE_APPROACH', estate: 'bellatores' }, { type: 'RETURN_HOME' }],
    );
    expect(eventsOfType(r.events, 'waystation_reached')).toMatchObject([{ waystation: 4 }]);
    const atWaystation = r.steps[0]!;
    expect(atWaystation.pilgrimage).toMatchObject({ stage: 'waystation_decision', encounterIndex: 5 });
    expect(atWaystation.furthestWaystation).toBe(4);
    expect(r.final).toMatchObject({ phase: 'home', furthestWaystation: 4, treasury: 5 + atWaystation.pilgrimage!.carriedCoin });
    expect(r.final.elapsedWeeks).toBe(ENTRY.waxing + 1);
  });

  it('a failed (survived) last encounter also completes the segment', () => {
    const r = run(onRoad(ENTRY.waxing, { encounterIndex: 4, currentThreat: 'laboratores' }, { fatigue: 0 }), [{ type: 'CHOOSE_APPROACH', estate: 'oratores' }]);
    expect(r.final.pilgrimage?.stage).toBe('waystation_decision');
    expect(r.final.furthestWaystation).toBe(1);
  });

  it('CONTINUE_SEGMENT spends one week and no fee, keeps the purse and relocks the moon', () => {
    const r = run(
      onRoad(ENTRY.waxing, { segmentIndex: 0, stage: 'waystation_decision', encounterIndex: 5, carriedCoin: 9, departureCarriedCoin: 5, earnedCoin: 4 }, { furthestWaystation: 1, treasury: 30 }),
      [{ type: 'CONTINUE_SEGMENT' }],
    );
    expect(eventsOfType(r.events, 'week_spent')).toEqual([{ type: 'week_spent', week: ENTRY.waxing + 1, reason: 'segment_entry' }]);
    expect(coinDelta(r.events, 'treasury')).toBe(0);
    expect(r.final.pilgrimage).toMatchObject({
      segmentIndex: 1, encounterIndex: 0, carriedCoin: 9, stage: 'choose_approach', segmentEntryWeek: ENTRY.waxing + 1,
    });
    expect(r.final.elapsedWeeks).toBe(ENTRY.waxing + 2);
    expect(r.events.every((event) => event.week === r.initial.elapsedWeeks)).toBe(true);
  });

  it('no new segment at week 96, and none past the last regular segment (C4)', () => {
    const late = onRoad(95, { stage: 'waystation_decision', encounterIndex: 5 }, { furthestWaystation: 1 });
    expect(rejection(late, { type: 'CONTINUE_SEGMENT' })).toBe('DEADLINE_REACHED');
    expect(pilgrimageActions(late, config)).toEqual([{ type: 'RETURN_HOME' }]);
    const last = onRoad(ENTRY.waxing, { segmentIndex: 4, stage: 'waystation_decision', encounterIndex: 5 }, { furthestWaystation: 5 });
    expect(rejection(last, { type: 'CONTINUE_SEGMENT' })).toBe('INVALID_ACTION');
  });

  it('a wipeout never rolls the checkpoint back', () => {
    const r = run(onRoad(ENTRY.waxing, { segmentIndex: 2, encounterIndex: 3, currentThreat: 'bellatores' }), [{ type: 'CHOOSE_APPROACH', estate: 'laboratores' }]);
    expect(eventsOfType(r.events, 'wipeout')).toHaveLength(1);
    expect(r.final.furthestWaystation).toBe(2);
  });

  it('returning home or wiping out in week 96 is the deadline defeat', () => {
    const home = run(onRoad(95, { stage: 'continue_or_retreat', encounterIndex: 1 }), [{ type: 'RETREAT' }]);
    expect(home.final).toMatchObject({ phase: 'defeat', outcome: 'deadline', elapsedWeeks: 96 });
    const wiped = run(onRoad(95, { currentThreat: 'bellatores' }), [{ type: 'CHOOSE_APPROACH', estate: 'laboratores' }]);
    expect(wiped.final).toMatchObject({ phase: 'defeat', outcome: 'deadline', elapsedWeeks: 96 });
    expect(eventsOfType(wiped.events, 'convalescence')).toEqual([]);
    expect(eventsOfType(wiped.events, 'deadline')).toEqual([{ type: 'deadline', week: 96 }]);
  });
});

describe('slot items leaving the road (§7)', () => {
  it('wipeout returns equipment and loses an unused consumable', () => {
    const r = run(onRoad(ENTRY.waxing, { currentThreat: 'bellatores', equipmentId: 'gambeson', consumableId: 'theriac' }), [
      { type: 'CHOOSE_APPROACH', estate: 'laboratores' },
    ]);
    expect(r.final.inventory).toEqual({ gambeson: 1 });
    expect(eventsOfType(r.events, 'item_changed').map((e) => [e.itemId, e.source])).toEqual([
      ['gambeson', 'pilgrimage_slot_returned'],
      ['theriac', 'wipeout_lost'],
    ]);
  });

  it('retreat and return home give both slots back; a used consumable is not returned', () => {
    const retreat = run(onRoad(ENTRY.waxing, { stage: 'continue_or_retreat', encounterIndex: 1, equipmentId: 'saints_relic', consumableId: 'theriac' }), [{ type: 'RETREAT' }]);
    expect(retreat.final.inventory).toEqual({ saints_relic: 1, theriac: 1 });
    const used = run(onRoad(ENTRY.waxing, { stage: 'waystation_decision', encounterIndex: 5, consumableId: 'theriac', consumableUsed: true }, { furthestWaystation: 1 }), [{ type: 'RETURN_HOME' }]);
    expect(used.final.inventory).toEqual({});
  });
});

describe('action validation and availability', () => {
  it('rejects actions at the wrong stage or phase, untouched', () => {
    const choose = onRoad(ENTRY.waxing, { currentThreat: 'oratores' });
    expect(rejection(choose, { type: 'RETREAT' })).toBe('INVALID_STAGE');
    expect(rejection(choose, { type: 'ACCEPT_RESULT' })).toBe('INVALID_STAGE');
    expect(rejection(choose, { type: 'CHOOSE_APPROACH', estate: 'clergy' as never })).toBe('INVALID_ACTION');
    expect(rejection(ruleState(), { type: 'CONTINUE_ENCOUNTER' })).toBe('INVALID_PHASE');
    expect(rejection({ ...ruleState(), phase: 'defeat', outcome: 'deadline', elapsedWeeks: 96 }, { type: 'BEGIN_PILGRIMAGE', carry: 0 }))
      .toBe('CAMPAIGN_FINISHED');
  });

  it('SKIP_ENCOUNTER is refused while the default config disables it (items: see items-fsm.test.ts)', () => {
    const state = onRoad(ENTRY.new, { currentThreat: 'oratores', carriedCoin: 20, departureCarriedCoin: 20 });
    expect(rejection(state, { type: 'SKIP_ENCOUNTER' })).toBe('INVALID_ACTION');
  });

  it('isPilgrimageAction splits the action union for the reducer', () => {
    expect(isPilgrimageAction({ type: 'RETREAT' })).toBe(true);
    expect(isPilgrimageAction({ type: 'BEGIN_PILGRIMAGE', carry: 0 })).toBe(true);
    expect(isPilgrimageAction({ type: 'REST', rest: 'rest_home' })).toBe(false);
  });

  it('offers exactly the stage actions', () => {
    expect(pilgrimageActions(onRoad(ENTRY.waxing, { currentThreat: 'oratores' }), config)).toHaveLength(3);
    expect(pilgrimageActions(onRoad(ENTRY.waxing, { currentThreat: 'oratores', consumableId: 'metheglin', stage: 'reroll_or_accept', pendingFailure: true, currentApproach: 'bellatores', lastRoll: 100, lastProbability: 50 }), config))
      .toEqual([{ type: 'ACCEPT_RESULT' }, { type: 'USE_CONSUMABLE', itemId: 'metheglin' }]);
    expect(pilgrimageActions(ruleState(), config)).toEqual([]);
  });
});

describe('random walks (determinism, invariants, Coin conservation)', () => {
  /** Plays pilgrimages from home with a seeded action choice until the money or time runs out. */
  function walk(seed: number) {
    let state = ruleState({ treasury: 200 }, seed);
    let choice = createRngStreams(seed + 1).jobs;
    const pick = <T>(items: readonly T[]): T => {
      choice = (Math.imul(choice ^ (choice >>> 15), 0x2c1b3c6d) + 0x6d2b79f5) >>> 0;
      return items[choice % items.length]!;
    };
    const events: GameEvent[] = [];
    for (let step = 0; step < 2000; step++) {
      let action: GameAction | undefined;
      if (state.phase === 'home') {
        const begin = beginPilgrimageDescriptor(state, config);
        if (begin === null || begin.type !== 'BEGIN_PILGRIMAGE') break;
        action = { type: 'BEGIN_PILGRIMAGE', carry: pick([0, Math.min(5, begin.maxCarry), begin.maxCarry]) };
      } else {
        const options = pilgrimageActions(state, config) as GameAction[];
        if (options.length === 0) break;
        action = pick(options);
      }
      if (!isPilgrimageAction(action)) throw new Error('unexpected action');
      const before = state;
      const result = applyPilgrimageAction(state, action, config);
      assertInvariants(result.state, config, before);
      // Coin conservation: the change in total Coin is exactly the sum of coin events,
      // where transfers (paired treasury/carried events) cancel.
      const delta = result.events
        .filter((e): e is Extract<GameEvent, { type: 'coin_changed' }> => e.type === 'coin_changed')
        .reduce((sum, e) => sum + e.amount, 0);
      expect(totalCoin(result.state) - totalCoin(before)).toBe(delta);
      events.push(...result.events);
      state = result.state;
    }
    return { state, events };
  }

  it('keeps every invariant over many seeds and is deterministic', () => {
    let wipeouts = 0, retreats = 0, waystations = 0;
    for (let seed = 1; seed <= 150; seed++) {
      const { events } = walk(seed);
      wipeouts += eventsOfType(events, 'wipeout').length;
      retreats += eventsOfType(events, 'retreat').length;
      waystations += eventsOfType(events, 'waystation_reached').length;
    }
    expect(wipeouts).toBeGreaterThan(0);
    expect(retreats).toBeGreaterThan(0);
    expect(waystations).toBeGreaterThan(0);
    expect(walk(7)).toEqual(walk(7));
  });
});
