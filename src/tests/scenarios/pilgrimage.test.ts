/**
 * D2 pilgrimage scenarios (tech §7, §8, §13): 1 Coin short of a failure,
 * both conditions near ceiling on the road, departure and retreat Coin
 * accounting, waystations and checkpoints, and the final gauntlet / wipeout
 * on the last week.
 */
import { describe, expect, it } from 'vitest';
import { getCalendar } from '../../core/calendar.js';
import { fatigueCeiling, melancholyCeiling, purseProtectionPct } from '../../core/conditions.js';
import { encounterOdds, failurePenalty } from '../../core/encounter.js';
import { RuleError, type GameEvent, type LunarPhase } from '../../core/types.js';
import {
  coinDelta,
  defaultConfig as config,
  engine,
  eventsOfType,
  forcedRolls,
  hasFinal,
  hasPilgrimage,
  ruleState,
  scenario,
  scenarioState,
  type PilgrimageOverrides,
  type StateOverrides,
} from './harness.js';

/** Segment-entry weeks in month 1 (no solar aspect), by the lunar phase they lock. */
const ENTRY: Record<LunarPhase, number> = { new: 4, waxing: 5, full: 6, waning: 7 };

const FAIL = forcedRolls(100); // above successMax (95)
const PASS = forcedRolls(1); // within successMin (5)

/**
 * On the road at the approach choice: the segment was entered in `entryWeek`
 * (which locks the lunar phase), so one week has already been spent.
 */
function onRoad(
  entryWeek: number,
  pilgrimage: PilgrimageOverrides,
  rest: Omit<StateOverrides, 'pilgrimage'> = {},
  encounters = FAIL,
): StateOverrides {
  return {
    elapsedWeeks: entryWeek + 1,
    ...rest,
    rng: { ...(rest.rng ?? ruleState().rng), encounters },
    pilgrimage: { segmentEntryWeek: entryWeek, ...pilgrimage },
  };
}

/** Running carried balance across events; returns every intermediate value. */
function carriedBalances(start: number, events: readonly GameEvent[]): number[] {
  let balance = start;
  return eventsOfType(events, 'coin_changed')
    .filter((e) => e.account === 'carried')
    .map((e) => (balance += e.amount));
}

// ---------------------------------------------------------------------------
// Rule-level scenarios
// ---------------------------------------------------------------------------

describe('§7 failure costs that decide survival (rule level)', () => {
  it('a Laboratores failure costs 15 carried Coin, never doubled by the Full Moon', () => {
    for (const lunar of ['new', 'waxing', 'full', 'waning'] as const) {
      expect(failurePenalty({ approach: 'laboratores', lunar }, config)).toMatchObject({ resource: 'coin', amount: 15 });
    }
  });

  it('Full Moon doubles Fatigue and Melancholy costs to 30', () => {
    expect(failurePenalty({ approach: 'bellatores', lunar: 'full' }, config).amount).toBe(30);
    expect(failurePenalty({ approach: 'oratores', lunar: 'full' }, config).amount).toBe(30);
    expect(failurePenalty({ approach: 'oratores', lunar: 'waning' }, config).amount).toBe(15);
  });

  it('the lunar phase is the one locked at segment entry', () => {
    for (const [phase, week] of Object.entries(ENTRY)) {
      expect(getCalendar(ruleState({ elapsedWeeks: week }), config).lunarPhase).toBe(phase);
    }
  });

  it('final gauntlet odds: the -20 road bonus applies before the 5% floor', () => {
    const odds = encounterOdds(
      { stat: 15, approach: 'bellatores', threat: 'oratores', lunar: 'waxing', segmentIndex: 5, isFinal: true },
      config,
    );
    // floor(15 * 0.75) - 20 = -9 -> 5
    expect(odds).toMatchObject({ matchup: 'disadvantage', roadBonus: -20, probability: 5 });
  });

  it('Purse Protection on wipeout is floor(Laboratores / 2) percent', () => {
    expect(purseProtectionPct(ruleState().stats)).toBe(7); // Aries Laboratores 15
    expect(purseProtectionPct(ruleState({ stats: { laboratores: 60 } }).stats)).toBe(30);
  });
});

// ---------------------------------------------------------------------------
// Engine scenarios (C2)
// ---------------------------------------------------------------------------

describe.runIf(hasPilgrimage)('engine: §7 departure (empty purse, Coin conservation)', () => {
  it('fee and carried Coin leave the treasury together; total Coin drops by the fee only', () => {
    const result = scenario({ elapsedWeeks: ENTRY.waxing, treasury: 50 }, [{ type: 'BEGIN_PILGRIMAGE', carry: 20 }]);
    expect(result.error).toBeUndefined();
    expect(result.final.treasury).toBe(20);
    expect(result.final.pilgrimage).toMatchObject({ carriedCoin: 20, departureCarriedCoin: 20, earnedCoin: 0 });
    expect(coinDelta(result.events, 'treasury', 'departure_fee')).toBe(-10);
    expect(result.final.treasury + result.final.pilgrimage!.carriedCoin).toBe(50 - 10);
    expect(eventsOfType(result.events, 'week_spent')).toMatchObject([{ reason: 'segment_entry' }]);
    expect(result.final.elapsedWeeks).toBe(ENTRY.waxing + 1);
  });

  it('carrying everything after the fee is allowed; one Coin more is refused untouched', () => {
    expect(scenario({ treasury: 50 }, [{ type: 'BEGIN_PILGRIMAGE', carry: 40 }]).final.treasury).toBe(0);
    const over = scenario({ treasury: 50 }, [{ type: 'BEGIN_PILGRIMAGE', carry: 41 }]);
    expect(over.error?.code).toBe('INSUFFICIENT_FUNDS');
    expect(over.final).toEqual(over.initial);
  });

  it('an empty purse cannot pay the departure fee', () => {
    const state = scenarioState({ treasury: 9 }, 1);
    expect(engine!.getAvailableActions(state, config).map((a) => a.type)).not.toContain('BEGIN_PILGRIMAGE');
    const result = scenario({ treasury: 9 }, [{ type: 'BEGIN_PILGRIMAGE', carry: 0 }]);
    expect(result.error?.code).toBe('INSUFFICIENT_FUNDS');
    expect(result.final).toEqual(result.initial);
  });
});

describe.runIf(hasPilgrimage)('engine: §7 1 Coin short of a failure', () => {
  const road = (carried: number) =>
    onRoad(ENTRY.waxing, { carriedCoin: carried, departureCarriedCoin: carried, currentThreat: 'bellatores' });

  it('carried Coin exactly equal to the penalty survives at 0', () => {
    const result = scenario(road(15), [{ type: 'CHOOSE_APPROACH', estate: 'laboratores' }]);
    expect(result.error).toBeUndefined();
    expect(eventsOfType(result.events, 'wipeout')).toEqual([]);
    expect(result.final.phase).toBe('pilgrimage');
    expect(result.final.pilgrimage).toMatchObject({ carriedCoin: 0, encounterIndex: 1, stage: 'continue_or_retreat' });
    expect(coinDelta(result.events, 'carried', 'laboratores_penalty')).toBe(-15);
  });

  it('one Coin short is a financial wipeout and carried Coin never goes negative', () => {
    const result = scenario(road(14), [{ type: 'CHOOSE_APPROACH', estate: 'laboratores' }]);
    expect(result.error).toBeUndefined();
    expect(eventsOfType(result.events, 'wipeout')).toMatchObject([{ cause: 'coin' }]);
    expect(Math.min(14, ...carriedBalances(14, result.events))).toBeGreaterThanOrEqual(0);
    expect(result.final.phase).toBe('home');
    expect(result.final.pilgrimage).toBeUndefined();
    // Retained floor(14 * 7%) = 0; medical fee min(50, 50) = 50.
    expect(result.final.treasury).toBe(0);
    expect(result.final.treasury).toBeGreaterThanOrEqual(0);
    // Entry week already spent, plus one convalescence week.
    expect(result.final.elapsedWeeks).toBe(ENTRY.waxing + 2);
    expect(eventsOfType(result.events, 'convalescence')).toMatchObject([{ cause: 'wipeout' }]);
    expect(result.final).toMatchObject({ fatigue: 0, melancholy: 0 }); // wipeoutBurdenReset: zero
  });

  it('Purse Protection returns its share of the pre-lethal carried Coin', () => {
    const result = scenario(
      { ...road(14), stats: { laboratores: 60 }, treasury: 100 },
      [{ type: 'CHOOSE_APPROACH', estate: 'laboratores' }],
    );
    // Retained floor(14 * 30%) = 4; medical fee min(50, treasury) = 50.
    expect(coinDelta(result.events, 'treasury', 'wipeout_retained')).toBe(4);
    expect(coinDelta(result.events, 'treasury', 'medical_fee')).toBe(-50);
    expect(result.final.treasury).toBe(54);
  });

  it('the medical fee never creates debt', () => {
    const result = scenario({ ...road(14), treasury: 20 }, [{ type: 'CHOOSE_APPROACH', estate: 'laboratores' }]);
    expect(result.final.treasury).toBe(0);
    expect(coinDelta(result.events, 'treasury', 'medical_fee')).toBe(-20);
  });
});

describe.runIf(hasPilgrimage)('engine: §4/§7 both conditions near ceiling on the road', () => {
  // Aries: Fatigue ceiling 77 (Bellatores 20), Melancholy ceiling 75 (Oratores 15).
  const edge = { fatigue: 76, melancholy: 74 };

  it('the ceilings are the derived ones', () => {
    const state = ruleState(edge);
    expect([fatigueCeiling(state.stats), melancholyCeiling(state.stats)]).toEqual([77, 75]);
  });

  it('a failed Bellatores approach (+15 Fatigue) wipes out on Fatigue', () => {
    const result = scenario(
      onRoad(ENTRY.waxing, { currentThreat: 'oratores' }, edge),
      [{ type: 'CHOOSE_APPROACH', estate: 'bellatores' }],
    );
    expect(eventsOfType(result.events, 'wipeout')).toMatchObject([{ cause: 'fatigue' }]);
    expect(result.final.phase).toBe('home');
  });

  it('a failed Oratores approach under a Full Moon (+30) wipes out on Melancholy', () => {
    const result = scenario(
      onRoad(ENTRY.full, { currentThreat: 'laboratores' }, { fatigue: 0, melancholy: 45 }),
      [{ type: 'CHOOSE_APPROACH', estate: 'oratores' }],
    );
    expect(eventsOfType(result.events, 'wipeout')).toMatchObject([{ cause: 'melancholy' }]);
  });

  it('one below after the cost survives, and the encounter index advances once', () => {
    const result = scenario(
      onRoad(ENTRY.full, { currentThreat: 'laboratores' }, { fatigue: 0, melancholy: 44 }),
      [{ type: 'CHOOSE_APPROACH', estate: 'oratores' }],
    );
    expect(eventsOfType(result.events, 'wipeout')).toEqual([]);
    expect(result.final.melancholy).toBe(74);
    expect(result.final.pilgrimage).toMatchObject({ encounterIndex: 1, stage: 'continue_or_retreat' });
  });
});

describe.runIf(hasPilgrimage)('engine: §7 retreat, waystations and checkpoints', () => {
  it('retreat after encounter 3: earned loot halved, toll paid, departure Coin protected, no extra week', () => {
    const initial = onRoad(
      ENTRY.waxing,
      { stage: 'continue_or_retreat', encounterIndex: 3, carriedCoin: 28, departureCarriedCoin: 20, earnedCoin: 8 },
      { treasury: 30 },
    );
    const result = scenario(initial, [{ type: 'RETREAT' }]);
    expect(result.error).toBeUndefined();
    expect(eventsOfType(result.events, 'retreat')).toHaveLength(1);
    expect(eventsOfType(result.events, 'week_spent')).toEqual([]);
    expect(result.final.elapsedWeeks).toBe(ENTRY.waxing + 1);
    expect(result.final.phase).toBe('home');
    expect(result.final.pilgrimage).toBeUndefined();
    // 30 + 20 departure + floor(8 * 50%) earned - 5 toll
    expect(result.final.treasury).toBe(49);
    expect(result.final.furthestWaystation).toBe(0);
  });

  it('the last encounter of a segment unlocks one waystation; returning home banks the purse for free', () => {
    const result = scenario(
      onRoad(
        ENTRY.waxing,
        { segmentIndex: 3, encounterIndex: 4, currentThreat: 'laboratores', carriedCoin: 12, departureCarriedCoin: 12 },
        { furthestWaystation: 3, treasury: 5 },
        PASS,
      ),
      [{ type: 'CHOOSE_APPROACH', estate: 'bellatores' }, { type: 'RETURN_HOME' }],
    );
    expect(result.error).toBeUndefined();
    expect(eventsOfType(result.events, 'waystation_reached')).toMatchObject([{ waystation: 4 }]);
    expect(result.steps[0]!.after.pilgrimage?.stage).toBe('waystation_decision');
    const carriedAtWaystation = result.steps[0]!.after.pilgrimage!.carriedCoin;
    expect(carriedAtWaystation).toBeGreaterThanOrEqual(13); // + 1d4 reward
    expect(carriedAtWaystation).toBeLessThanOrEqual(16);
    expect(result.final).toMatchObject({ phase: 'home', furthestWaystation: 4, treasury: 5 + carriedAtWaystation });
    expect(result.final.elapsedWeeks).toBe(ENTRY.waxing + 1);
  });

  it('continuing from a waystation spends one week and no fee', () => {
    const before = onRoad(
      ENTRY.waxing,
      { segmentIndex: 0, stage: 'waystation_decision', encounterIndex: 5, carriedCoin: 9, departureCarriedCoin: 5, earnedCoin: 4 },
      { furthestWaystation: 1, treasury: 30 },
    );
    const result = scenario(before, [{ type: 'CONTINUE_SEGMENT' }]);
    expect(result.error).toBeUndefined();
    expect(eventsOfType(result.events, 'week_spent')).toMatchObject([{ reason: 'segment_entry' }]);
    expect(coinDelta(result.events, 'treasury')).toBe(0);
    expect(result.final.elapsedWeeks).toBe(ENTRY.waxing + 2);
    expect(result.final.pilgrimage).toMatchObject({ encounterIndex: 0, carriedCoin: 9 });
    expect(result.final.furthestWaystation).toBe(1);
  });

  it('no new segment can be entered at week 96', () => {
    const result = scenario(
      { ...onRoad(95, { stage: 'waystation_decision', encounterIndex: 5 }, { furthestWaystation: 1 }) },
      [{ type: 'CONTINUE_SEGMENT' }],
    );
    expect(result.error).toBeInstanceOf(RuleError);
    expect(result.final).toEqual(result.initial);
  });

  it('a wipeout never rolls the checkpoint back', () => {
    const result = scenario(
      onRoad(ENTRY.waxing, { segmentIndex: 2, encounterIndex: 3, currentThreat: 'bellatores' }, { furthestWaystation: 2 }),
      [{ type: 'CHOOSE_APPROACH', estate: 'laboratores' }],
    );
    expect(eventsOfType(result.events, 'wipeout')).toMatchObject([{ cause: 'coin' }]);
    expect(result.final.furthestWaystation).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Engine scenarios (C4)
// ---------------------------------------------------------------------------

const finalRoad = (encounters: number): StateOverrides =>
  onRoad(
    95,
    {
      isFinal: true,
      segmentIndex: config.route.regularSegments,
      encounterIndex: config.route.finalEncounters - 1,
      currentThreat: 'laboratores',
    },
    { furthestWaystation: config.route.regularSegments },
    encounters,
  );

describe.runIf(hasFinal)('engine: §8 final gauntlet and the last week', () => {
  it('a successful final encounter in week 96 is victory with no further week', () => {
    const result = scenario(finalRoad(PASS), [{ type: 'CHOOSE_APPROACH', estate: 'bellatores' }]);
    expect(result.error).toBeUndefined();
    expect(result.final).toMatchObject({ phase: 'victory', outcome: 'victory', elapsedWeeks: 96 });
    expect(eventsOfType(result.events, 'victory')).toHaveLength(1);
    expect(eventsOfType(result.events, 'week_spent')).toEqual([]);
    expect(engine!.getAvailableActions(result.final, config)).toEqual([]);
  });

  it('a wipeout in week 96 ends in the deadline; convalescence cannot pass week 96', () => {
    const result = scenario(finalRoad(FAIL), [{ type: 'CHOOSE_APPROACH', estate: 'laboratores' }]);
    expect(eventsOfType(result.events, 'wipeout')).toMatchObject([{ cause: 'coin' }]);
    expect(result.final).toMatchObject({ phase: 'defeat', outcome: 'deadline', elapsedWeeks: 96 });
    expect(eventsOfType(result.events, 'deadline')).toHaveLength(1);
    expect(engine!.getAvailableActions(result.final, config)).toEqual([]);
    expect(() => engine!.applyAction(result.final, { type: 'REST', rest: 'rest_home' }, config)).toThrow(RuleError);
  });

  it('a final wipeout with weeks left keeps the final checkpoint for a retry', () => {
    const early = { ...finalRoad(FAIL), elapsedWeeks: 51, treasury: 60 };
    early.pilgrimage = { ...early.pilgrimage, segmentEntryWeek: 50 };
    const result = scenario(early, [
      { type: 'CHOOSE_APPROACH', estate: 'laboratores' },
      { type: 'BEGIN_PILGRIMAGE', carry: 0 },
    ]);
    expect(result.error).toBeUndefined();
    expect(eventsOfType(result.events, 'wipeout')).toHaveLength(1);
    expect(result.final.furthestWaystation).toBe(config.route.regularSegments);
    expect(result.final.pilgrimage).toMatchObject({ isFinal: true, encounterIndex: 0 });
  });
});
