/**
 * C3 items integration and New Moon skip (tech §6, §7). Drives the public
 * reducer with D1 invariants (including transitions) after every step. The
 * D2 item scenarios in scenarios/items.test.ts cover the §13 acceptance cases;
 * this file adds slot accounting, stage rules, error codes and the skip.
 */
import { describe, expect, it } from 'vitest';
import { withOverrides, type RulesConfig } from '../core/config.js';
import { applyAction, getAvailableActions } from '../core/index.js';
import { createRngStreams } from '../core/rng.js';
import { RuleError, type AvailableAction, type CampaignState, type GameAction, type GameEvent, type LunarPhase } from '../core/types.js';
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
const SKIP_FEE = 5;
const skipping = withOverrides(config, { astrology: { newMoon: { skipFee: SKIP_FEE } } });

function onRoad(
  entryWeek: number,
  pilgrimage: PilgrimageOverrides,
  rest: Omit<StateOverrides, 'pilgrimage'> = {},
  rolls: number[] = [100],
): CampaignState {
  const state = ruleState({
    elapsedWeeks: entryWeek + 1,
    furthestWaystation: pilgrimage.segmentIndex ?? 0,
    ...rest,
    pilgrimage: { segmentEntryWeek: entryWeek, ...pilgrimage },
  });
  state.rng = { ...state.rng, encounters: forcedRolls(...rolls) };
  return state;
}

interface Run {
  initial: CampaignState;
  final: CampaignState;
  steps: CampaignState[];
  events: GameEvent[];
}

function run(initial: CampaignState, actions: readonly GameAction[], cfg: RulesConfig = config): Run {
  assertInvariants(initial, cfg);
  const steps: CampaignState[] = [];
  const events: GameEvent[] = [];
  let state = initial;
  for (const action of actions) {
    const result = applyAction(state, action, cfg);
    assertInvariants(result.state, cfg, state);
    steps.push(result.state);
    events.push(...result.events);
    state = result.state;
  }
  return { initial, final: state, steps, events };
}

function rejection(state: CampaignState, action: GameAction, cfg = config): string {
  const before = structuredClone(state);
  try {
    applyAction(state, action, cfg);
  } catch (error) {
    expect(error).toBeInstanceOf(RuleError);
    expect(state).toEqual(before);
    return (error as RuleError).code;
  }
  throw new Error(`expected ${action.type} to be rejected`);
}

const itemEvents = (events: GameEvent[], itemId: string) =>
  eventsOfType(events, 'item_changed').filter((e) => e.itemId === itemId);

describe('departure with items', () => {
  const home = (inventory: Record<string, number>) => ruleState({ elapsedWeeks: ENTRY.waxing, treasury: 50, inventory });

  it('moves one equipment and one consumable from the inventory into the slots', () => {
    const r = run(home({ gambeson: 1, metheglin: 2 }), [
      { type: 'BEGIN_PILGRIMAGE', carry: 5, equipmentId: 'gambeson', consumableId: 'metheglin' },
    ]);
    expect(r.final.inventory).toEqual({ metheglin: 1 }); // a zero count is deleted
    expect(r.final.pilgrimage).toMatchObject({ equipmentId: 'gambeson', consumableId: 'metheglin', consumableUsed: false });
    expect(eventsOfType(r.events, 'item_changed')).toEqual([
      { type: 'item_changed', week: ENTRY.waxing, itemId: 'gambeson', amount: -1, source: 'pilgrimage_slot_out' },
      { type: 'item_changed', week: ENTRY.waxing, itemId: 'metheglin', amount: -1, source: 'pilgrimage_slot_out' },
    ]);
  });

  it('validates every slot before anything changes', () => {
    const state = home({ gambeson: 1, theriac: 1 });
    const begin = (items: { equipmentId?: string; consumableId?: string }): GameAction =>
      ({ type: 'BEGIN_PILGRIMAGE', carry: 0, ...items });
    expect(rejection(state, begin({ equipmentId: 'excalibur' }))).toBe('INVALID_ITEM');
    expect(rejection(state, begin({ equipmentId: 'theriac' }))).toBe('INVALID_ITEM');
    expect(rejection(state, begin({ consumableId: 'gambeson' }))).toBe('INVALID_ITEM');
    expect(rejection(state, begin({ equipmentId: 'saints_relic' }))).toBe('ITEM_UNAVAILABLE');
    expect(rejection(state, begin({ equipmentId: 'gambeson', consumableId: 'metheglin' }))).toBe('ITEM_UNAVAILABLE');
    const noSlots = withOverrides(config, { items: { maxConsumables: 0 } });
    expect(rejection(state, begin({ consumableId: 'theriac' }), noSlots)).toBe('INVALID_ACTION');
  });

  it('a retreat returns both unused slot items', () => {
    const state = onRoad(ENTRY.waxing, { stage: 'continue_or_retreat', encounterIndex: 1, equipmentId: 'gambeson', consumableId: 'theriac' }, { inventory: { theriac: 1 } });
    const r = run(state, [{ type: 'RETREAT' }]);
    expect(r.final.inventory).toEqual({ gambeson: 1, theriac: 2 });
  });
});

describe('burden consumables (Theriac, St. John\'s Wort)', () => {
  it('Theriac lowers Fatigue by 30 between encounters, clamped at 0, and is used once', () => {
    const state = onRoad(ENTRY.waxing, { stage: 'continue_or_retreat', encounterIndex: 1, consumableId: 'theriac' }, { fatigue: 20 });
    const r = run(state, [{ type: 'USE_CONSUMABLE', itemId: 'theriac' }]);
    expect(r.final.fatigue).toBe(0);
    expect(r.final.rng).toEqual(state.rng);
    expect(r.final.pilgrimage).toMatchObject({ stage: 'continue_or_retreat', consumableId: 'theriac', consumableUsed: true });
    expect(r.events).toEqual([
      { type: 'item_changed', week: ENTRY.waxing + 1, itemId: 'theriac', amount: 0, source: 'consumed' },
      { type: 'consumable_used', week: ENTRY.waxing + 1, itemId: 'theriac' },
      { type: 'burden_changed', week: ENTRY.waxing + 1, burden: 'fatigue', amount: -20, source: 'consumable' },
    ]);
    expect(rejection(r.final, { type: 'USE_CONSUMABLE', itemId: 'theriac' })).toBe('CONSUMABLE_ALREADY_USED');
    expect(getAvailableActions(r.final, config)).toEqual([{ type: 'CONTINUE_ENCOUNTER' }, { type: 'RETREAT' }]);
  });

  it('Q8: St. John\'s Wort works at a waystation; a used one does not come home', () => {
    const state = onRoad(ENTRY.waxing, { stage: 'waystation_decision', encounterIndex: 5, consumableId: 'st_johns_wort' }, { melancholy: 45, furthestWaystation: 1 });
    expect(getAvailableActions(state, config)).toContainEqual({ type: 'USE_CONSUMABLE', itemId: 'st_johns_wort' });
    const r = run(state, [{ type: 'USE_CONSUMABLE', itemId: 'st_johns_wort' }, { type: 'RETURN_HOME' }]);
    expect(r.steps[0]!.melancholy).toBe(15);
    expect(r.final.inventory.st_johns_wort ?? 0).toBe(0);
    expect(itemEvents(r.events, 'st_johns_wort').map((e) => e.source)).toEqual(['consumed']);
  });

  it('respects stages and the slot', () => {
    const choose = onRoad(ENTRY.waxing, { currentThreat: 'oratores', consumableId: 'theriac' });
    expect(rejection(choose, { type: 'USE_CONSUMABLE', itemId: 'theriac' })).toBe('INVALID_STAGE');
    expect(getAvailableActions(choose, config).map((a) => a.type)).not.toContain('USE_CONSUMABLE');
    const between = onRoad(ENTRY.waxing, { stage: 'continue_or_retreat', encounterIndex: 1, consumableId: 'theriac' }, { inventory: { st_johns_wort: 1 } });
    expect(rejection(between, { type: 'USE_CONSUMABLE', itemId: 'st_johns_wort' })).toBe('ITEM_UNAVAILABLE');
    expect(rejection(between, { type: 'USE_CONSUMABLE', itemId: 'potion' })).toBe('INVALID_ITEM');
    expect(rejection(ruleState({ inventory: { theriac: 1 } }), { type: 'USE_CONSUMABLE', itemId: 'theriac' })).toBe('INVALID_PHASE');
    const metheglin = onRoad(ENTRY.waxing, { stage: 'continue_or_retreat', encounterIndex: 1, consumableId: 'metheglin' });
    expect(rejection(metheglin, { type: 'USE_CONSUMABLE', itemId: 'metheglin' })).toBe('INVALID_STAGE');
  });
});

describe('Metheglin reroll', () => {
  const failed = (rolls: number[], rest: Omit<StateOverrides, 'pilgrimage'> = {}, pilgrimage: PilgrimageOverrides = {}) =>
    run(onRoad(ENTRY.waxing, { currentThreat: 'oratores', consumableId: 'metheglin', ...pilgrimage }, rest, rolls), [
      { type: 'CHOOSE_APPROACH', estate: 'bellatores' },
    ]);

  it('the reroll window offers accepting or drinking it', () => {
    const r = failed([100]);
    expect(getAvailableActions(r.final, config)).toEqual([
      { type: 'ACCEPT_RESULT' }, { type: 'USE_CONSUMABLE', itemId: 'metheglin' },
    ]);
  });

  it('a successful reroll pays the reward from rng.rewards and leaves the stake unchanged', () => {
    const first = failed([100, 1], {}, { carriedCoin: 4, departureCarriedCoin: 4 });
    const r = run(first.final, [{ type: 'USE_CONSUMABLE', itemId: 'metheglin' }]);
    expect(r.events.map((e) => e.type)).toEqual(['item_changed', 'encounter_resolved', 'reroll_used', 'coin_changed']);
    expect(r.final.rng.encounters).not.toBe(first.final.rng.encounters);
    expect(r.final.rng.rewards).not.toBe(first.final.rng.rewards);
    expect(r.final.pilgrimage).toMatchObject({ encounterIndex: 1, lastRoll: 1 });
    expect(r.final.pilgrimage?.pendingFailure).toBeUndefined();
  });

  it('a failed reroll that wipes out does not lose the drunk Metheglin a second time', () => {
    const first = failed([100, 100], { fatigue: 70 });
    const r = run(first.final, [{ type: 'USE_CONSUMABLE', itemId: 'metheglin' }]);
    expect(eventsOfType(r.events, 'wipeout')).toMatchObject([{ cause: 'fatigue' }]);
    expect(itemEvents(r.events, 'metheglin').map((e) => e.source)).toEqual(['consumed']);
    expect(r.final.inventory.metheglin ?? 0).toBe(0);
  });
});

describe('New Moon skip (Q3: once per segment, Q9: carried fee, counts toward N)', () => {
  const newMoon = (pilgrimage: PilgrimageOverrides = {}) =>
    onRoad(ENTRY.new, { currentThreat: 'bellatores', carriedCoin: 12, departureCarriedCoin: 12, ...pilgrimage });

  it('is offered and passes the card with no roll, paid from carried Coin', () => {
    const state = newMoon();
    expect(getAvailableActions(state, skipping)).toContainEqual({ type: 'SKIP_ENCOUNTER' });
    const r = run(state, [{ type: 'SKIP_ENCOUNTER' }], skipping);
    expect(r.final.rng).toEqual(state.rng);
    expect(coinDelta(r.events, 'carried', 'skip_fee')).toBe(-SKIP_FEE);
    expect(eventsOfType(r.events, 'encounter_skipped')).toEqual([
      { type: 'encounter_skipped', week: ENTRY.new + 1, encounterIndex: 0, source: 'new_moon_bribe' },
    ]);
    expect(eventsOfType(r.events, 'encounter_resolved')).toEqual([]);
    expect(r.final.pilgrimage).toMatchObject({ stage: 'continue_or_retreat', encounterIndex: 1, skipUsed: true, carriedCoin: 7 });
  });

  it('is refused a second time in the same segment, and resets on the next segment', () => {
    const r = run(newMoon(), [{ type: 'SKIP_ENCOUNTER' }, { type: 'CONTINUE_ENCOUNTER' }], skipping);
    expect(r.final.pilgrimage?.stage).toBe('choose_approach');
    expect(getAvailableActions(r.final, skipping).map((a) => a.type)).not.toContain('SKIP_ENCOUNTER');
    expect(rejection(r.final, { type: 'SKIP_ENCOUNTER' }, skipping)).toBe('SKIP_ALREADY_USED');

    const waystation = onRoad(ENTRY.new, { stage: 'waystation_decision', encounterIndex: 5, skipUsed: true }, { furthestWaystation: 1 });
    const next = run(waystation, [{ type: 'CONTINUE_SEGMENT' }], skipping);
    expect(next.final.pilgrimage).toMatchObject({ segmentIndex: 1, skipUsed: false });
  });

  it('skipping the last card reaches the waystation', () => {
    const r = run(newMoon({ encounterIndex: 4 }), [{ type: 'SKIP_ENCOUNTER' }], skipping);
    expect(r.final.pilgrimage).toMatchObject({ stage: 'waystation_decision', encounterIndex: 5 });
    expect(r.final.furthestWaystation).toBe(1);
  });

  it('is refused outside New Moon, when disabled, at the wrong stage, or without enough carried Coin', () => {
    for (const phase of ['waxing', 'full', 'waning'] as const) {
      const state = onRoad(ENTRY[phase], { currentThreat: 'bellatores', carriedCoin: 12, departureCarriedCoin: 12 });
      expect(rejection(state, { type: 'SKIP_ENCOUNTER' }, skipping)).toBe('INVALID_ACTION');
      expect(getAvailableActions(state, skipping).map((a) => a.type)).not.toContain('SKIP_ENCOUNTER');
    }
    expect(rejection(newMoon(), { type: 'SKIP_ENCOUNTER' }, config)).toBe('INVALID_ACTION');
    const poor = newMoon({ carriedCoin: SKIP_FEE - 1, departureCarriedCoin: SKIP_FEE - 1 });
    expect(rejection(poor, { type: 'SKIP_ENCOUNTER' }, skipping)).toBe('INSUFFICIENT_FUNDS');
    expect(getAvailableActions(poor, skipping).map((a) => a.type)).not.toContain('SKIP_ENCOUNTER');
    const between = newMoon({ stage: 'continue_or_retreat', encounterIndex: 1 });
    expect(rejection(between, { type: 'SKIP_ENCOUNTER' }, skipping)).toBe('INVALID_STAGE');
    expect(rejection(ruleState(), { type: 'SKIP_ENCOUNTER' }, skipping)).toBe('INVALID_PHASE');
  });
});

describe('random walks with items and skipping', () => {
  const variant = withOverrides(skipping, {
    startingState: { startingInventory: Object.fromEntries(Object.keys(config.items.catalog).map((id) => [id, 3])) },
  });

  /** Picks offered actions (items included) until the campaign ends or 3000 steps. */
  function walk(seed: number): { state: CampaignState; types: Set<string> } {
    let state = ruleState({ treasury: 200, inventory: { ...variant.startingState.startingInventory } }, seed);
    let choice = createRngStreams(seed + 7).jobs;
    const pick = <T>(items: readonly T[]): T => {
      choice = (Math.imul(choice ^ (choice >>> 15), 0x2c1b3c6d) + 0x6d2b79f5) >>> 0;
      return items[choice % items.length]!;
    };
    const types = new Set<string>();
    for (let step = 0; step < 3000 && state.phase !== 'defeat' && state.phase !== 'victory'; step++) {
      const offered = getAvailableActions(state, variant);
      if (offered.length === 0) break; // the final gauntlet waits for C4
      const choice: AvailableAction = pick(offered);
      const action: GameAction = choice.type === 'BEGIN_PILGRIMAGE'
        ? {
          type: 'BEGIN_PILGRIMAGE',
          carry: Math.min(choice.maxCarry, 20),
          ...(choice.equipmentIds.length ? { equipmentId: pick(choice.equipmentIds) } : {}),
          ...(choice.consumableIds.length ? { consumableId: pick(choice.consumableIds) } : {}),
        }
        : choice;
      const result = applyAction(state, action, variant);
      assertInvariants(result.state, variant, state);
      types.add(action.type);
      state = result.state;
    }
    return { state, types };
  }

  it('every offered action applies cleanly, and the walks exercise items and skips', () => {
    const seen = new Set<string>();
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      for (const type of walk(seed).types) seen.add(type);
    }
    expect(seen).toContain('USE_CONSUMABLE');
    expect(seen).toContain('SKIP_ENCOUNTER');
  });
});
