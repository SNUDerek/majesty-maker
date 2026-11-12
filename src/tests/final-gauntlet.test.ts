/**
 * C4 final gauntlet and terminal states (tech §3, §8). Drives the public
 * reducer with D1 invariants (including transitions) checked after every step.
 */
import { describe, expect, it } from 'vitest';
import { encounterOdds } from '../core/encounter.js';
import { applyAction, getAvailableActions } from '../core/index.js';
import { applyPilgrimageAction } from '../core/pilgrimage.js';
import { RuleError, type CampaignState, type GameAction, type GameEvent } from '../core/types.js';
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

const { regularSegments, finalEncounters, encountersPerSegment, departureFee } = config.route;
const WAXING = 5; // month-1 week with no solar aspect that locks Waxing
const FAIL = forcedRolls(100);
const PASS = forcedRolls(1);

/** On the final gauntlet at the approach choice, entered in `entryWeek`. */
function onFinal(
  entryWeek: number,
  pilgrimage: PilgrimageOverrides = {},
  rest: Omit<StateOverrides, 'pilgrimage'> = {},
  encounters = FAIL,
): CampaignState {
  const state = ruleState({
    elapsedWeeks: entryWeek + 1,
    furthestWaystation: regularSegments,
    ...rest,
    pilgrimage: {
      isFinal: true,
      segmentIndex: regularSegments,
      segmentEntryWeek: entryWeek,
      currentThreat: 'laboratores',
      ...pilgrimage,
    },
  });
  state.rng = { ...state.rng, encounters };
  return state;
}

interface Run {
  final: CampaignState;
  events: GameEvent[];
}

/**
 * Applies actions through the public reducer with invariants after each step.
 * `rig` may replace the encounter stream before an action (to force a roll).
 */
function run(
  initial: CampaignState,
  actions: readonly GameAction[],
  rig: (state: CampaignState, action: GameAction) => CampaignState = (s) => s,
): Run {
  assertInvariants(initial, config);
  const events: GameEvent[] = [];
  let state = initial;
  for (const action of actions) {
    const before = rig(state, action);
    const result = applyAction(before, action, config);
    assertInvariants(result.state, config, before);
    events.push(...result.events);
    state = result.state;
  }
  return { final: state, events };
}

/** Forces every approach roll to succeed. */
const alwaysPass = (state: CampaignState, action: GameAction): CampaignState =>
  action.type === 'CHOOSE_APPROACH' ? { ...state, rng: { ...state.rng, encounters: PASS } } : state;

/** CHOOSE_APPROACH then CONTINUE_ENCOUNTER, `n` times, without the last CONTINUE. */
function encounters(n: number): GameAction[] {
  return Array.from({ length: n }, (_, i): GameAction[] =>
    i === n - 1
      ? [{ type: 'CHOOSE_APPROACH', estate: 'bellatores' }]
      : [{ type: 'CHOOSE_APPROACH', estate: 'bellatores' }, { type: 'CONTINUE_ENCOUNTER' }],
  ).flat();
}

const ALL_ACTIONS: GameAction[] = [
  { type: 'TRAIN', tutor: 'hedge_knight' },
  { type: 'WORK', job: 'stables' },
  { type: 'REST', rest: 'rest_home' },
  { type: 'BEGIN_PILGRIMAGE', carry: 0 },
  { type: 'CHOOSE_APPROACH', estate: 'bellatores' },
  { type: 'SKIP_ENCOUNTER' },
  { type: 'USE_CONSUMABLE', itemId: 'theriac' },
  { type: 'ACCEPT_RESULT' },
  { type: 'CONTINUE_ENCOUNTER' },
  { type: 'RETREAT' },
  { type: 'RETURN_HOME' },
  { type: 'CONTINUE_SEGMENT' },
];

function expectFinished(state: CampaignState): void {
  expect(getAvailableActions(state, config)).toEqual([]);
  const before = structuredClone(state);
  for (const action of ALL_ACTIONS) {
    for (const apply of [applyAction, applyPilgrimageAction as typeof applyAction]) {
      let code: string | undefined;
      try {
        apply(state, action, config);
      } catch (error) {
        expect(error).toBeInstanceOf(RuleError);
        code = (error as RuleError).code;
      }
      expect(code, action.type).toBe('CAMPAIGN_FINISHED');
    }
  }
  expect(state).toEqual(before);
}

describe('C4: unlocking and entering the final gauntlet (§8)', () => {
  it('stays locked until every regular waystation is reached', () => {
    const begin = getAvailableActions(ruleState({ treasury: 50, furthestWaystation: regularSegments - 1 }), config).at(-1);
    expect(begin).toMatchObject({ type: 'BEGIN_PILGRIMAGE', isFinal: false });
    const r = run(ruleState({ elapsedWeeks: WAXING, treasury: 50, furthestWaystation: regularSegments - 1 }), [
      { type: 'BEGIN_PILGRIMAGE', carry: 0 },
    ]);
    expect(r.final.pilgrimage).toMatchObject({ isFinal: false, segmentIndex: regularSegments - 1 });
  });

  it('departs from home at the final checkpoint: fee, one week, isFinal, encounter 0', () => {
    const start = ruleState({ elapsedWeeks: WAXING, treasury: 50, furthestWaystation: regularSegments });
    expect(getAvailableActions(start, config).at(-1)).toEqual({
      type: 'BEGIN_PILGRIMAGE', minCarry: 0, maxCarry: 50 - departureFee, fee: departureFee, isFinal: true,
      equipmentIds: [], consumableIds: [],
    });
    const r = run(start, [{ type: 'BEGIN_PILGRIMAGE', carry: 5 }]);
    expect(r.final).toMatchObject({ phase: 'pilgrimage', elapsedWeeks: WAXING + 1, treasury: 50 - departureFee - 5 });
    expect(r.final.pilgrimage).toMatchObject({
      isFinal: true, segmentIndex: regularSegments, encounterIndex: 0, stage: 'choose_approach',
      carriedCoin: 5, segmentEntryWeek: WAXING,
    });
    expect(eventsOfType(r.events, 'pilgrimage_started')).toEqual([
      { type: 'pilgrimage_started', week: WAXING, segmentIndex: regularSegments, isFinal: true },
    ]);
    expect(eventsOfType(r.events, 'week_spent')).toEqual([{ type: 'week_spent', week: WAXING, reason: 'segment_entry' }]);
  });

  it('continues from the last waystation into the final: one week, no fee, carried Coin kept', () => {
    const last = ruleState({
      elapsedWeeks: WAXING + 1,
      treasury: 30,
      furthestWaystation: regularSegments,
      pilgrimage: {
        segmentIndex: regularSegments - 1, segmentEntryWeek: WAXING, stage: 'waystation_decision',
        encounterIndex: encountersPerSegment, carriedCoin: 7, departureCarriedCoin: 3, earnedCoin: 4,
      },
    });
    const r = run(last, [{ type: 'CONTINUE_SEGMENT' }]);
    expect(r.final.treasury).toBe(30);
    expect(eventsOfType(r.events, 'coin_changed')).toEqual([]);
    expect(r.final.elapsedWeeks).toBe(WAXING + 2);
    expect(r.final.pilgrimage).toMatchObject({
      isFinal: true, segmentIndex: regularSegments, encounterIndex: 0, segmentEntryWeek: WAXING + 1,
      carriedCoin: 7, departureCarriedCoin: 3, earnedCoin: 4,
    });
  });

  it('applies the final road bonus to its odds', () => {
    const stats = { bellatores: 50, oratores: 15, laboratores: 15 };
    const r = run(onFinal(WAXING, { currentThreat: 'oratores' }, { stats }), [{ type: 'CHOOSE_APPROACH', estate: 'bellatores' }]);
    const input = { stat: 50, approach: 'bellatores', threat: 'oratores', lunar: 'waxing' } as const;
    const final = encounterOdds({ ...input, segmentIndex: regularSegments, isFinal: true }, config).probability;
    const lastRegular = encounterOdds({ ...input, segmentIndex: regularSegments - 1, isFinal: false }, config).probability;
    expect(eventsOfType(r.events, 'encounter_resolved')[0]).toMatchObject({ isFinal: true, probability: final });
    expect(lastRegular - final).toBe(config.route.roadBonus[regularSegments - 1]! - config.route.finalRoadBonus);
  });
});

describe('C4: victory (§8)', () => {
  it(`surviving all ${finalEncounters} encounters is immediate victory: no week, Coin banked, items home`, () => {
    const start = ruleState({
      elapsedWeeks: WAXING, treasury: 30, furthestWaystation: regularSegments, inventory: {},
    });
    const departed = run(start, [{ type: 'BEGIN_PILGRIMAGE', carry: 5 }]).final;
    departed.pilgrimage!.equipmentId = 'gambeson'; // C3 owns slot loading; the return path is C2/C4's
    const r = run(departed, encounters(finalEncounters), alwaysPass);

    expect(r.final).toMatchObject({ phase: 'victory', outcome: 'victory', elapsedWeeks: WAXING + 1 });
    expect(r.final.pilgrimage).toBeUndefined();
    expect(eventsOfType(r.events, 'week_spent')).toEqual([]);
    expect(eventsOfType(r.events, 'waystation_reached')).toEqual([]);
    const resolved = eventsOfType(r.events, 'encounter_resolved');
    expect(resolved).toHaveLength(finalEncounters);
    expect(resolved.every((e) => e.isFinal && e.success)).toBe(true);
    expect(r.events.at(-1)).toEqual({ type: 'victory', week: WAXING + 1 });

    const earned = coinDelta(r.events, 'carried', 'encounter_reward');
    expect(coinDelta(r.events, 'treasury', 'bank_carried')).toBe(5 + earned);
    expect(r.final.treasury).toBe(30 - departureFee + earned);
    expect(r.final.inventory.gambeson).toBe(1);
    expectFinished(r.final);
  });

  it('a victory on the last encounter in week 96 is legal and spends no week', () => {
    const r = run(onFinal(95, { encounterIndex: finalEncounters - 1 }, {}, PASS), [{ type: 'CHOOSE_APPROACH', estate: 'bellatores' }]);
    expect(r.final).toMatchObject({ phase: 'victory', outcome: 'victory', elapsedWeeks: 96 });
    expect(eventsOfType(r.events, 'deadline')).toEqual([]);
    expectFinished(r.final);
  });

  it('a failed last encounter that survives its penalty still completes the gauntlet', () => {
    const r = run(onFinal(WAXING, { encounterIndex: finalEncounters - 1, currentThreat: 'bellatores' }), [
      { type: 'CHOOSE_APPROACH', estate: 'oratores' },
    ]);
    expect(eventsOfType(r.events, 'burden_changed')).toHaveLength(1);
    expect(r.final).toMatchObject({ phase: 'victory', outcome: 'victory' });
  });
});

describe('C4: failing the final and retrying (§8)', () => {
  it('the final gauntlet offers continue/retreat between encounters and never a waystation', () => {
    const r = run(onFinal(WAXING, {}, {}, PASS), [{ type: 'CHOOSE_APPROACH', estate: 'bellatores' }]);
    expect(r.final.pilgrimage?.stage).toBe('continue_or_retreat');
    expect(getAvailableActions(r.final, config)).toEqual([{ type: 'CONTINUE_ENCOUNTER' }, { type: 'RETREAT' }]);
  });

  it('a wipeout keeps the final checkpoint; the retry starts again at encounter 0 with a fee', () => {
    const r = run(onFinal(WAXING, { encounterIndex: 6 }, { treasury: 60 }), [
      { type: 'CHOOSE_APPROACH', estate: 'laboratores' }, // coin wipeout with nothing carried
      { type: 'BEGIN_PILGRIMAGE', carry: 0 },
    ]);
    expect(eventsOfType(r.events, 'wipeout')).toEqual([{ type: 'wipeout', week: WAXING + 1, cause: 'coin' }]);
    expect(eventsOfType(r.events, 'convalescence')).toHaveLength(1);
    expect(r.final.furthestWaystation).toBe(regularSegments);
    expect(r.final.pilgrimage).toMatchObject({ isFinal: true, segmentIndex: regularSegments, encounterIndex: 0 });
    expect(coinDelta(r.events, 'treasury', 'departure_fee')).toBe(-departureFee);
    expect(r.final.elapsedWeeks).toBe(WAXING + 3); // road week, convalescence week, retry entry
  });

  it('a retreat from the final keeps the checkpoint and can be retried', () => {
    const r = run(onFinal(WAXING, { stage: 'continue_or_retreat', encounterIndex: 4, carriedCoin: 6, earnedCoin: 6 }, { treasury: 40 }), [
      { type: 'RETREAT' },
    ]);
    expect(r.final).toMatchObject({ phase: 'home', furthestWaystation: regularSegments, elapsedWeeks: WAXING + 1 });
    expect(getAvailableActions(r.final, config).at(-1)).toMatchObject({ type: 'BEGIN_PILGRIMAGE', isFinal: true });
  });

  it('a wipeout in week 96 bounds convalescence and ends in the deadline defeat', () => {
    const r = run(onFinal(95, { encounterIndex: 2 }), [
      { type: 'CHOOSE_APPROACH', estate: 'laboratores' }, // Coin penalty with nothing carried
    ]);
    expect(eventsOfType(r.events, 'wipeout')).toHaveLength(1);
    expect(eventsOfType(r.events, 'convalescence')).toEqual([]);
    expect(eventsOfType(r.events, 'week_spent')).toEqual([]);
    expect(r.final).toMatchObject({ phase: 'defeat', outcome: 'deadline', elapsedWeeks: 96, furthestWaystation: regularSegments });
    expectFinished(r.final);
  });

  it('a retreat from the final in week 96 is the deadline defeat', () => {
    const r = run(onFinal(95, { stage: 'continue_or_retreat', encounterIndex: 3 }), [{ type: 'RETREAT' }]);
    expect(r.final).toMatchObject({ phase: 'defeat', outcome: 'deadline', elapsedWeeks: 96 });
    expectFinished(r.final);
  });
});

describe('C4: terminal states (§3)', () => {
  it('defeat by running out of home weeks rejects every action', () => {
    const r = run(ruleState({ elapsedWeeks: 95 }), [{ type: 'WORK', job: 'stables' }]);
    expect(r.final).toMatchObject({ phase: 'defeat', outcome: 'deadline' });
    expectFinished(r.final);
  });
});

describe('C4: random walks from the final checkpoint', () => {
  /** Small LCG for the policy only; the game's RNG streams are never touched. */
  const lcg = (x: number) => (Math.imul(x, 1664525) + 1013904223) >>> 0;

  it('300 seeded walks reach victory or the deadline with invariants, atomic actions and logged Coin', () => {
    const outcomes = { victory: 0, deadline: 0 };
    let retries = 0;
    for (let seed = 0; seed < 300; seed++) {
      let pick = lcg(seed + 1);
      const roll = (n: number) => ((pick = lcg(pick)) >>> 8) % n;
      let state = ruleState({
        seed,
        elapsedWeeks: 70 + (seed % 25),
        treasury: 20 + (seed % 60),
        furthestWaystation: regularSegments,
        stats: { bellatores: 40 + (seed % 60), oratores: 30, laboratores: 30 },
      });
      let departures = 0;
      for (let step = 0; ; step++) {
        expect(step).toBeLessThan(2000);
        assertInvariants(state, config);
        const offered = getAvailableActions(state, config);
        if (state.phase === 'victory' || state.phase === 'defeat') {
          expect(offered).toEqual([]);
          outcomes[state.outcome!]++;
          break;
        }
        expect(offered.length).toBeGreaterThan(0);
        // Prefer pressing on; sometimes retreat or rest so retries and home weeks happen.
        const begin = offered.find((a) => a.type === 'BEGIN_PILGRIMAGE');
        const choice = offered.find((a) => a.type === 'CONTINUE_ENCOUNTER') && roll(10) === 0
          ? { type: 'RETREAT' as const }
          : begin && roll(3) > 0
            ? begin
            : offered.find((a) => a.type === 'CONTINUE_ENCOUNTER') ?? offered[roll(offered.length)]!;
        const action: GameAction = choice.type === 'BEGIN_PILGRIMAGE'
          ? { type: 'BEGIN_PILGRIMAGE', carry: choice.minCarry + roll(choice.maxCarry - choice.minCarry + 1) }
          : choice.type === 'CHOOSE_APPROACH'
            ? { type: 'CHOOSE_APPROACH', estate: roll(4) === 0 ? 'laboratores' : 'bellatores' }
            : choice;
        if (action.type === 'BEGIN_PILGRIMAGE') {
          expect(choice).toMatchObject({ isFinal: true });
          if (departures++ > 0) retries++;
        }
        const before = structuredClone(state);
        const { state: next, events } = applyAction(state, action, config);
        expect(state).toEqual(before);
        assertInvariants(next, config, state);
        // Every Coin movement (treasury and carried, clamping included) is in the event log.
        const total = (s: CampaignState) => s.treasury + (s.pilgrimage?.carriedCoin ?? 0);
        const logged = eventsOfType(events, 'coin_changed').reduce((sum, e) => sum + e.amount, 0);
        expect(total(next) - total(state)).toBe(logged);
        state = next;
      }
    }
    expect(outcomes.victory).toBeGreaterThan(0);
    expect(outcomes.deadline).toBeGreaterThan(0);
    expect(retries).toBeGreaterThan(0);
  });
});
