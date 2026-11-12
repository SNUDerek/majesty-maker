/** C1 reducer core and home phase (tech §3–§5, §9; implementation task C1). */
import { describe, expect, it } from 'vitest';
import { withOverrides, type RulesConfig } from '../core/config.js';
import { collapseCause } from '../core/conditions.js';
import { applyAction, createCampaign, getAvailableActions } from '../core/index.js';
import { d100 } from '../core/rng.js';
import {
  RuleError,
  type AvailableAction,
  type CampaignState,
  type GameAction,
  type GameEvent,
  type ZodiacSign,
} from '../core/types.js';
import { assertInvariants } from './invariants.js';
import { DEFAULT_OPTIONS, ruleState } from './scenarios/harness.js';
import { loadContentConfig } from './support/config.js';

const config = loadContentConfig();
const TOTAL = config.calendar.totalWeeks;
const stables: GameAction = { type: 'WORK', job: 'stables' };
const restHome: GameAction = { type: 'REST', rest: 'rest_home' };

function start(overrides: Partial<CampaignState> = {}, seed = 1): CampaignState {
  return { ...createCampaign({ ...DEFAULT_OPTIONS, seed }, config), ...overrides };
}

/** Applies actions, asserting the invariants (with the transition) after every step. */
function run(state: CampaignState, actions: readonly GameAction[], cfg: RulesConfig = config) {
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

function rejection(state: CampaignState, action: GameAction, cfg: RulesConfig = config): string {
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

const ofType = <T extends GameEvent['type']>(events: readonly GameEvent[], type: T) =>
  events.filter((e): e is Extract<GameEvent, { type: T }> => e.type === type);

describe('createCampaign', () => {
  it('matches the T0.2 starting state the D2 harness assumes', () => {
    for (const seed of [0, 1, 123]) {
      const state = createCampaign({ ...DEFAULT_OPTIONS, seed }, config);
      expect(state).toEqual(ruleState({}, seed));
      assertInvariants(state, config);
    }
  });

  it.each([
    ['aries', 'bellatores'], ['capricorn', 'bellatores'], ['taurus', 'oratores'],
    ['scorpio', 'oratores'], ['gemini', 'laboratores'], ['pisces', 'laboratores'],
  ] as const)('%s gets +5 %s', (birthSign, estate) => {
    const { stats } = createCampaign({ ...DEFAULT_OPTIONS, birthSign: birthSign as ZodiacSign }, config);
    expect(stats[estate]).toBe(20);
    expect(Object.values(stats).reduce((a, b) => a + b, 0)).toBe(50);
  });

  it('requires convalescence when configured starting burdens already reach a ceiling', () => {
    const burdened = withOverrides(config, { startingState: { fatigue: 77, melancholy: 75 } });
    const initial = createCampaign(DEFAULT_OPTIONS, burdened);
    assertInvariants(initial, burdened);
    expect(initial.pendingConvalescence).toBe('home_collapse');
    expect(getAvailableActions(initial, burdened)).toEqual([restHome]);
    expect(rejection(initial, stables, burdened)).toBe('INVALID_ACTION');
    const { state } = run(initial, [restHome], burdened);
    expect(state).toMatchObject({ elapsedWeeks: 1, fatigue: 62, melancholy: 60 });
    expect(state.pendingConvalescence).toBeUndefined();
  });

  it('rejects malformed options', () => {
    expect(() => createCampaign({ ...DEFAULT_OPTIONS, seed: 1.5 }, config)).toThrow(RangeError);
    expect(() => createCampaign({ ...DEFAULT_OPTIONS, birthSign: 'ophiuchus' as ZodiacSign }, config)).toThrow(RangeError);
  });
});

describe('§5 acceptance: a 96-week Stables-only run', () => {
  it('ends in the deadline with 6 Coin per Stables week, collapsing into convalescence on the way', () => {
    let state = start();
    const events: GameEvent[] = [];
    let steps = 0;
    while (state.phase === 'home') {
      // A pending convalescence offers only Rest at Home; otherwise always Stables.
      const action = state.pendingConvalescence === undefined ? stables : restHome;
      const result = run(state, [action]);
      events.push(...result.events);
      state = result.state;
      expect(++steps).toBeLessThanOrEqual(TOTAL);
    }

    const stablesWeeks = ofType(events, 'job_resolved').length;
    const convalescenceWeeks = ofType(events, 'week_spent').filter((e) => e.reason === 'convalescence').length;
    expect(state).toMatchObject({ phase: 'defeat', outcome: 'deadline', elapsedWeeks: TOTAL });
    expect(ofType(events, 'deadline')).toEqual([{ type: 'deadline', week: TOTAL }]);
    expect(stablesWeeks + convalescenceWeeks).toBe(TOTAL);
    expect(convalescenceWeeks).toBeGreaterThan(0);
    expect(ofType(events, 'collapse')).toHaveLength(convalescenceWeeks);
    expect(state.treasury).toBe(config.startingState.treasury + 6 * stablesWeeks);
    // Stables never draws: the RNG streams are untouched.
    expect(state.rng).toEqual(start().rng);
    expect(getAvailableActions(state, config)).toEqual([]);
  });

  it('caps the treasury at 9999', () => {
    const { state, events } = run(start({ treasury: 9995 }), [stables]);
    expect(state.treasury).toBe(9999);
    expect(ofType(events, 'coin_changed')).toMatchObject([{ amount: 4, source: 'job_payout' }]);
  });
});

describe('§5 home flow and events', () => {
  it('a week of training: deltas, events in order, week spent once, activity recorded', () => {
    const { state, events } = run(start({ elapsedWeeks: 4 }), [{ type: 'TRAIN', tutor: 'hermit' }]);
    expect(state).toMatchObject({ elapsedWeeks: 5, treasury: 30, melancholy: 5, lastWeeklyActivityId: 'hermit', waxingStreak: 0 });
    expect(state.stats).toEqual({ bellatores: 19, oratores: 20, laboratores: 15 });
    expect(events.map((e) => e.type)).toEqual(['coin_changed', 'stat_changed', 'stat_changed', 'burden_changed', 'week_spent']);
    expect(events.every((e) => e.week === 4)).toBe(true);
  });

  it('jobs roll on the jobs stream only', () => {
    const before = start({ elapsedWeeks: 4 });
    const { state, events } = run(before, [{ type: 'WORK', job: 'village_watch' }]);
    expect(state.rng.jobs).toBe(d100(before.rng.jobs).state);
    expect(state.rng.encounters).toBe(before.rng.encounters);
    expect(state.rng.rewards).toBe(before.rng.rewards);
    expect(ofType(events, 'job_resolved')).toHaveLength(1);
  });

  it('does not mutate the input state', () => {
    const before = start({ elapsedWeeks: 4 });
    const snapshot = structuredClone(before);
    const { state } = run(before, [{ type: 'TRAIN', tutor: 'smuggler' }, { type: 'WORK', job: 'alehouse' }]);
    expect(before).toEqual(snapshot);
    expect(state.stats).not.toBe(before.stats);
    expect(state.inventory).not.toBe(before.inventory);
  });

  it('is deterministic for the same seed and actions', () => {
    const actions: GameAction[] = [
      { type: 'WORK', job: 'alehouse' }, { type: 'WORK', job: 'alehouse' },
      { type: 'TRAIN', tutor: 'hedge_knight' }, { type: 'WORK', job: 'scriptorium' }, restHome,
    ];
    const a = run(start({}, 99), actions);
    const b = run(start({}, 99), actions);
    expect(JSON.stringify(b)).toBe(JSON.stringify(a));
  });

  it('counts prior consecutive repeats in waxingStreak and resets on a change', () => {
    const { state } = run(start({ elapsedWeeks: 4 }), [stables, stables, stables]);
    expect(state.waxingStreak).toBe(2);
    expect(run(state, [restHome]).state).toMatchObject({ waxingStreak: 0, lastWeeklyActivityId: 'rest_home' });
  });

  it('compounding Waxing uses the streak through the reducer', () => {
    const compounding = withOverrides(config, { astrology: { waxing: { mode: 'compounding' } } });
    // Week 4 (New, no aspect) is a first repeat -> streak 1; week 5 (Waxing) is a second repeat.
    const state = start({ elapsedWeeks: 4, treasury: 100, lastWeeklyActivityId: 'hedge_knight', waxingStreak: 0 });
    const lessons: GameAction[] = [{ type: 'TRAIN', tutor: 'hedge_knight' }, { type: 'TRAIN', tutor: 'hedge_knight' }];
    const gains = (cfg: RulesConfig) => ofType(run(state, lessons, cfg).events, 'stat_changed')
      .filter((e) => e.source === 'tutor').map((e) => e.amount);
    expect(gains(compounding)).toEqual([5, 6]); // floor(5 * 1.1 * 1.1)
    expect(gains(config)).toEqual([5, 5]); // single: floor(5 * 1.1)
  });
});

describe('§4 home collapse and forced convalescence', () => {
  const edge = { fatigue: 76, melancholy: 74 }; // Aries ceilings 77 / 75

  it('a collapse in week 94 convalesces in week 95 and then hits the deadline', () => {
    const { state, events } = run(start({ elapsedWeeks: 94, ...edge }), [{ type: 'TRAIN', tutor: 'smuggler' }]);
    expect(ofType(events, 'collapse')).toEqual([{ type: 'collapse', week: 94, cause: 'both' }]);
    expect(ofType(events, 'convalescence')).toEqual([{ type: 'convalescence', week: 95, cause: 'home_collapse' }]);
    expect(ofType(events, 'week_spent').map((e) => [e.week, e.reason])).toEqual([[94, 'tutor'], [95, 'convalescence']]);
    expect(state).toMatchObject({ phase: 'defeat', outcome: 'deadline', elapsedWeeks: 96, fatigue: 66, melancholy: 64 });
    expect(state.pendingConvalescence).toBeUndefined();
  });

  it('a collapse in week 95 (the last) has no week left to convalesce', () => {
    const { state, events } = run(start({ elapsedWeeks: 95, ...edge }), [{ type: 'TRAIN', tutor: 'smuggler' }]);
    expect(ofType(events, 'collapse')).toHaveLength(1);
    expect(ofType(events, 'convalescence')).toEqual([]);
    expect(state).toMatchObject({ phase: 'defeat', outcome: 'deadline', elapsedWeeks: 96, fatigue: 81, melancholy: 79 });
  });

  it('convalescence breaks the Waxing chain', () => {
    // Week 4 (New) collapse -> week 5 (Waxing) convalescence -> week 6 is not a repeat.
    const { state } = run(start({ elapsedWeeks: 4, ...edge }), [{ type: 'TRAIN', tutor: 'smuggler' }]);
    expect(state.lastWeeklyActivityId).toBeUndefined();
    expect(state.waxingStreak).toBe(0);
  });

  it('a stat loss that lowers a ceiling onto the burden is a collapse', () => {
    const { events } = run(start({ elapsedWeeks: 4, stats: { bellatores: 21, oratores: 15, laboratores: 15 }, fatigue: 77 }), [
      { type: 'TRAIN', tutor: 'hermit' },
    ]);
    expect(ofType(events, 'collapse')).toMatchObject([{ cause: 'fatigue' }]);
  });

  it('forcedWeek: false recovers immediately without spending a week', () => {
    const noWeek = withOverrides(config, { failure: { homeCollapse: { forcedWeek: false } } });
    const { state, events } = run(start({ elapsedWeeks: 4, ...edge }), [{ type: 'TRAIN', tutor: 'smuggler' }], noWeek);
    expect(state.elapsedWeeks).toBe(5);
    expect(ofType(events, 'convalescence')).toEqual([{ type: 'convalescence', week: 5, cause: 'home_collapse' }]);
    expect(state).toMatchObject({ fatigue: 66, melancholy: 64 });
  });

  it('a free automatic recovery does not make subsequent pending rests free', () => {
    const weakFree = withOverrides(config, {
      failure: { homeCollapse: { forcedWeek: false, recovery: 3 } },
    });
    const collapsed = run(start({ elapsedWeeks: 4, ...edge }), [
      { type: 'TRAIN', tutor: 'smuggler' },
    ], weakFree).state;
    expect(collapsed).toMatchObject({ elapsedWeeks: 5, pendingConvalescence: 'home_collapse' });
    const { state, events } = run(collapsed, [restHome], weakFree);
    expect(state).toMatchObject({ elapsedWeeks: 6, fatigue: 75, melancholy: 73 });
    expect(state.pendingConvalescence).toBeUndefined();
    expect(ofType(events, 'week_spent')).toEqual([{ type: 'week_spent', week: 5, reason: 'convalescence' }]);
  });

  it('zero recovery with a free automatic bout still reaches the deadline', () => {
    const noRecovery = withOverrides(config, {
      failure: { homeCollapse: { forcedWeek: false, recovery: 0 } },
    });
    const collapsed = run(start({ elapsedWeeks: 94, ...edge }), [
      { type: 'TRAIN', tutor: 'smuggler' },
    ], noRecovery).state;
    expect(collapsed).toMatchObject({ elapsedWeeks: 95, pendingConvalescence: 'home_collapse' });
    const { state, events } = run(collapsed, [restHome], noRecovery);
    expect(state).toMatchObject({ elapsedWeeks: 96, phase: 'defeat', outcome: 'deadline' });
    expect(state.pendingConvalescence).toBeUndefined();
    expect(ofType(events, 'deadline')).toHaveLength(1);
  });

  describe('a recovery too small to clear the collapse (variant)', () => {
    const weak = withOverrides(config, { failure: { homeCollapse: { recovery: 3 } } });
    const collapsed = () => run(start({ elapsedWeeks: 4, ...edge }), [{ type: 'TRAIN', tutor: 'smuggler' }], weak).state;

    it('leaves a pending convalescence and offers only Rest at Home', () => {
      const state = collapsed();
      expect(state).toMatchObject({ elapsedWeeks: 6, fatigue: 78, melancholy: 76, pendingConvalescence: 'home_collapse' });
      expect(getAvailableActions(state, weak)).toEqual([restHome]);
      expect(rejection(state, stables, weak)).toBe('INVALID_ACTION');
      expect(rejection(state, { type: 'REST', rest: 'banquet' }, weak)).toBe('INVALID_ACTION');
    });

    it('Rest at Home is then resolved as further convalescence weeks until clear', () => {
      const { state, events } = run(collapsed(), [restHome], weak);
      expect(ofType(events, 'week_spent')).toEqual([{ type: 'week_spent', week: 6, reason: 'convalescence' }]);
      expect(state).toMatchObject({ elapsedWeeks: 7, fatigue: 75, melancholy: 73 });
      expect(state.pendingConvalescence).toBeUndefined();
      expect(collapseCause(state)).toBeNull();
    });
  });
});

describe('§9 invalid actions leave the state untouched', () => {
  it.each<[string, Partial<CampaignState>, GameAction, string]>([
    ['unaffordable tutor', { treasury: 19 }, { type: 'TRAIN', tutor: 'hedge_knight' }, 'INSUFFICIENT_FUNDS'],
    ['unaffordable rest', { treasury: 0 }, { type: 'REST', rest: 'shrine' }, 'INSUFFICIENT_FUNDS'],
    ['pilgrimage action at home', {}, { type: 'CHOOSE_APPROACH', estate: 'bellatores' }, 'INVALID_PHASE'],
    ['retreat at home', {}, { type: 'RETREAT' }, 'INVALID_PHASE'],
    ['unknown tutor', {}, { type: 'TRAIN', tutor: 'bard' as never }, 'INVALID_ACTION'],
    ['unknown job', {}, { type: 'WORK', job: 'mine' as never }, 'INVALID_ACTION'],
    ['unknown action type', {}, { type: 'DANCE' } as never, 'INVALID_ACTION'],
    ['BEGIN_PILGRIMAGE while a convalescence is pending', { pendingConvalescence: 'home_collapse', melancholy: 80 }, { type: 'BEGIN_PILGRIMAGE', carry: 0 }, 'INVALID_ACTION'],
    ['BEGIN_PILGRIMAGE with an item not in the inventory', {}, { type: 'BEGIN_PILGRIMAGE', carry: 0, equipmentId: 'gambeson' }, 'ITEM_UNAVAILABLE'],
    ['BEGIN_PILGRIMAGE with equipment in the consumable slot', { inventory: { gambeson: 1 } }, { type: 'BEGIN_PILGRIMAGE', carry: 0, consumableId: 'gambeson' }, 'INVALID_ITEM'],
    ['after the deadline', { phase: 'defeat', outcome: 'deadline', elapsedWeeks: 96 }, restHome, 'CAMPAIGN_FINISHED'],
    ['after victory', { phase: 'victory', outcome: 'victory', elapsedWeeks: 50, furthestWaystation: 5 }, stables, 'CAMPAIGN_FINISHED'],
    ['home at the deadline week', { elapsedWeeks: 96 }, stables, 'DEADLINE_REACHED'],
  ])('%s', (_name, overrides, action, code) => {
    expect(rejection(start(overrides), action)).toBe(code);
  });

  it('home actions are rejected during a pilgrimage', () => {
    const road = ruleState({ elapsedWeeks: 5, pilgrimage: {} });
    expect(rejection(road, stables)).toBe('INVALID_PHASE');
  });
});

describe('getAvailableActions (home)', () => {
  const types = (actions: AvailableAction[]) => actions.map((a) => ('tutor' in a ? a.tutor : 'job' in a ? a.job : 'rest' in a ? a.rest : a.type));

  it('offers every affordable activity and a pilgrimage descriptor', () => {
    expect(types(getAvailableActions(start({ elapsedWeeks: 4 }), config))).toEqual([
      'hedge_knight', 'hermit', 'smuggler',
      'stables', 'alehouse', 'village_watch', 'scriptorium',
      'rest_home', 'bathhouse', 'shrine', 'banquet',
      'BEGIN_PILGRIMAGE',
    ]);
  });

  it('drops unaffordable activities and the pilgrimage below the fee', () => {
    expect(types(getAvailableActions(start({ elapsedWeeks: 4, treasury: 9 }), config))).toEqual([
      'stables', 'alehouse', 'village_watch', 'scriptorium', 'rest_home',
    ]);
  });

  it('prices with this week\'s modifiers: the Solar Return Banquet costs 15', () => {
    expect(types(getAvailableActions(start({ elapsedWeeks: 0, treasury: 15 }), config))).toContain('banquet');
    expect(types(getAvailableActions(start({ elapsedWeeks: 4, treasury: 15 }), config))).not.toContain('banquet');
  });

  it('the pilgrimage descriptor carries the fee, carry range and carriable items and final flag', () => {
    const state = start({ treasury: 50, furthestWaystation: 4, inventory: { weighted_coin: 1, metheglin: 2, theriac: 1 } });
    expect(getAvailableActions(state, config).at(-1)).toEqual({
      type: 'BEGIN_PILGRIMAGE', minCarry: 0, maxCarry: 40, fee: 10, isFinal: false,
      equipmentIds: ['weighted_coin'], consumableIds: ['metheglin', 'theriac'],
    });
    const noSlots = withOverrides(config, { items: { maxEquipment: 0, maxConsumables: 0 } });
    expect(getAvailableActions(state, noSlots).at(-1)).toMatchObject({ equipmentIds: [], consumableIds: [] });
    const final = start({ treasury: 50, furthestWaystation: 5 });
    expect(getAvailableActions(final, config).at(-1)).toMatchObject({ type: 'BEGIN_PILGRIMAGE', isFinal: true, maxCarry: 40 });
  });

  it('every offered home action applies cleanly (random walk, invariants each step)', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      let state = start({}, seed);
      let pick = seed;
      while (state.phase === 'home') {
        const options = getAvailableActions(state, config)
          .filter((a): a is Exclude<AvailableAction, { type: 'BEGIN_PILGRIMAGE' }> => a.type !== 'BEGIN_PILGRIMAGE');
        expect(options.length).toBeGreaterThan(0);
        pick = (pick * 1103515245 + 12345) % 2147483648;
        state = run(state, [options[pick % options.length]!]).state;
      }
      expect(state).toMatchObject({ phase: 'defeat', elapsedWeeks: TOTAL });
    }
  });

  it('is empty in terminal phases and lists the stage actions during a pilgrimage', () => {
    expect(getAvailableActions(start({ phase: 'defeat', outcome: 'deadline', elapsedWeeks: 96 }), config)).toEqual([]);
    expect(getAvailableActions(ruleState({ elapsedWeeks: 5, pilgrimage: { currentThreat: 'oratores' } }), config)).toEqual([
      { type: 'CHOOSE_APPROACH', estate: 'bellatores' },
      { type: 'CHOOSE_APPROACH', estate: 'oratores' },
      { type: 'CHOOSE_APPROACH', estate: 'laboratores' },
    ]);
  });
});
