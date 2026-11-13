/** U1: draw-free UI previews (docs/ui-technical-plan.md §4.2) agree with what applyAction actually does. */
import { describe, expect, it } from 'vitest';
import { withOverrides, type RulesConfig } from '../core/config.js';
import {
  applyAction,
  createCampaign,
  getAvailableActions,
  previewApproaches,
  previewHomeActivity,
  type ActivityOutcome,
  type AvailableAction,
  type CampaignState,
  type Estate,
  type GameAction,
  type GameEvent,
} from '../core/index.js';
import { RuleError } from '../core/types.js';
import { DEFAULT_OPTIONS } from './scenarios/harness.js';
import { loadContentConfig, loadShippedConfig } from './support/config.js';

const ESTATES: readonly Estate[] = ['bellatores', 'oratores', 'laboratores'];
type HomeAction = Extract<GameAction, { type: 'TRAIN' | 'WORK' | 'REST' }>;

const ALL_HOME_ACTIONS: readonly HomeAction[] = [
  { type: 'TRAIN', tutor: 'hedge_knight' }, { type: 'TRAIN', tutor: 'hermit' }, { type: 'TRAIN', tutor: 'smuggler' },
  { type: 'WORK', job: 'stables' }, { type: 'WORK', job: 'alehouse' },
  { type: 'WORK', job: 'village_watch' }, { type: 'WORK', job: 'scriptorium' },
  { type: 'REST', rest: 'rest_home' }, { type: 'REST', rest: 'bathhouse' },
  { type: 'REST', rest: 'shrine' }, { type: 'REST', rest: 'banquet' },
];

/** Every item in the inventory, so equipment and consumables reach the pilgrimage paths. */
const ITEMS_VARIANT = {
  startingState: {
    startingInventory: {
      theriac: 5, st_johns_wort: 5, metheglin: 5, gambeson: 5, saints_relic: 5, weighted_coin: 5,
    },
  },
};

const CONFIGS: ReadonlyArray<[string, RulesConfig]> = [
  ['shipped defaults', loadShippedConfig()],
  ['legacy control', loadContentConfig()],
  ['shipped + items', withOverrides(loadShippedConfig(), ITEMS_VARIANT)],
];

/** Small deterministic PRNG for choosing walk actions (independent of the engine RNG). */
function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 0x1_0000_0000;
  };
}

function concrete(action: AvailableAction, rand: () => number): GameAction {
  if (action.type !== 'BEGIN_PILGRIMAGE') return action;
  const pick = (ids: string[]) => (ids.length > 0 && rand() < 0.7 ? ids[Math.floor(rand() * ids.length)] : undefined);
  const equipmentId = pick(action.equipmentIds);
  const consumableId = pick(action.consumableIds);
  return {
    type: 'BEGIN_PILGRIMAGE',
    carry: action.minCarry + Math.floor(rand() * (action.maxCarry - action.minCarry + 1)),
    ...(equipmentId === undefined ? {} : { equipmentId }),
    ...(consumableId === undefined ? {} : { consumableId }),
  };
}

/** Random legal play; favours tutoring so later segments and the gauntlet are reached sometimes. */
function* walk(seed: number, config: RulesConfig): Generator<CampaignState> {
  const rand = lcg(seed);
  let state = createCampaign({ ...DEFAULT_OPTIONS, seed, birthSign: (['aries', 'taurus', 'gemini'] as const)[seed % 3]! }, config);
  for (let step = 0; step < 600; step++) {
    yield state;
    const actions = getAvailableActions(state, config);
    if (actions.length === 0) return;
    const tutors = actions.filter((a) => a.type === 'TRAIN');
    const pool = tutors.length > 0 && rand() < 0.35 ? tutors : actions;
    const choice = pool[Math.floor(rand() * pool.length)]!;
    state = applyAction(state, concrete(choice, rand), config).state;
  }
}

const sum = (events: readonly GameEvent[], pick: (e: GameEvent) => number | undefined) =>
  events.reduce((total, e) => total + (pick(e) ?? 0), 0);

/** The activity's own deltas (excluding any collapse fee / convalescence that followed). */
function activityDeltas(events: readonly GameEvent[]) {
  const statSources = new Set(['tutor', 'tutor_opposing', 'job']);
  const burdenSources = new Set(['tutor', 'job', 'rest']);
  const coinSources = new Set(['tutor_fee', 'job_payout', 'rest_fee']);
  return {
    stats: Object.fromEntries(ESTATES.map((estate) => [estate, sum(events, (e) =>
      e.type === 'stat_changed' && e.estate === estate && statSources.has(e.source) ? e.amount : undefined)])),
    fatigue: sum(events, (e) =>
      e.type === 'burden_changed' && e.burden === 'fatigue' && burdenSources.has(e.source) ? e.amount : undefined),
    melancholy: sum(events, (e) =>
      e.type === 'burden_changed' && e.burden === 'melancholy' && burdenSources.has(e.source) ? e.amount : undefined),
    coin: sum(events, (e) => e.type === 'coin_changed' && coinSources.has(e.source) ? e.amount : undefined),
  };
}

function expectMatches(predicted: ActivityOutcome, events: readonly GameEvent[]): void {
  const actual = activityDeltas(events);
  expect(actual.stats).toEqual(predicted.stats);
  expect(actual.fatigue).toBe(predicted.fatigue);
  expect(actual.melancholy).toBe(predicted.melancholy);
  expect(actual.coin).toBeGreaterThanOrEqual(predicted.coin.min);
  expect(actual.coin).toBeLessThanOrEqual(predicted.coin.max);
  const collapse = events.find((e) => e.type === 'collapse');
  expect(collapse?.type === 'collapse' ? collapse.cause : null).toBe(predicted.collapse);
}

describe.each(CONFIGS)('previewHomeActivity (%s)', (_label, config) => {
  it('matches applyAction for every legal home activity along random campaigns', () => {
    let checked = 0;
    for (let seed = 1; seed <= 12; seed++) {
      for (const state of walk(seed, config)) {
        if (state.phase !== 'home') continue;
        const legal = getAvailableActions(state, config);
        for (const action of ALL_HOME_ACTIONS) {
          const snapshot = structuredClone(state);
          const preview = previewHomeActivity(state, action, config);
          expect(state).toEqual(snapshot); // pure: no mutation, no RNG advance

          const isLegal = legal.some((a) => JSON.stringify(a) === JSON.stringify(action));
          if (!isLegal) {
            if (state.pendingConvalescence === undefined) {
              expect(preview.affordable).toBe(false);
              expect(preview.cost).toBeGreaterThan(state.treasury);
            }
            continue;
          }
          expect(preview.affordable).toBe(true);
          const { events } = applyAction(state, action, config);

          if (preview.convalescence) {
            const recovered = (burden: 'fatigue' | 'melancholy') => sum(events, (e) =>
              e.type === 'burden_changed' && e.burden === burden && e.source === 'convalescence' ? e.amount : undefined);
            expect(recovered('fatigue')).toBe(preview.success.fatigue);
            expect(recovered('melancholy')).toBe(preview.success.melancholy);
            checked++;
            continue;
          }

          const job = events.find((e) => e.type === 'job_resolved');
          if (job?.type === 'job_resolved') {
            expect(job.automatic).toBe(preview.chance === null);
            if (preview.chance !== null) expect(job.probability).toBe(preview.chance);
            expectMatches(job.success ? preview.success : preview.failure ?? preview.success, events);
          } else {
            expect(preview.chance).toBeNull();
            expectMatches(preview.success, events);
          }
          checked++;
        }
      }
    }
    expect(checked).toBeGreaterThan(500);
  });
});

describe.each(CONFIGS)('previewApproaches (%s)', (_label, config) => {
  it('matches the roll odds, penalty and wipeout outcome of every approach', () => {
    let checked = 0;
    let wipeouts = 0;
    for (let seed = 1; seed <= 25; seed++) {
      for (const state of walk(seed, config)) {
        const stage = state.pilgrimage?.stage;
        if (stage !== 'choose_approach') continue;
        const snapshot = structuredClone(state);
        const previews = previewApproaches(state, config);
        expect(state).toEqual(snapshot);
        expect(previews.map((p) => p.estate)).toEqual(ESTATES);

        for (const preview of previews) {
          const { state: after, events } = applyAction(state, { type: 'CHOOSE_APPROACH', estate: preview.estate }, config);
          const resolved = events.find((e) => e.type === 'encounter_resolved');
          if (resolved?.type !== 'encounter_resolved') throw new Error('no encounter_resolved');
          expect(resolved.probability).toBe(preview.odds.probability);
          checked++;
          if (resolved.success) {
            const reward = sum(events, (e) => e.type === 'coin_changed' && e.source === 'encounter_reward' ? e.amount : undefined);
            expect(reward).toBeGreaterThanOrEqual(preview.reward.min);
            expect(reward).toBeLessThanOrEqual(preview.reward.max);
            continue;
          }
          // A carried Metheglin defers the penalty; accept it to see the failure.
          const failed = after.pilgrimage?.stage === 'reroll_or_accept'
            ? applyAction(after, { type: 'ACCEPT_RESULT' }, config).events
            : events;
          const wiped = failed.some((e) => e.type === 'wipeout');
          expect(wiped).toBe(preview.failureWipesOut);
          if (wiped) {
            wipeouts++;
          } else if (preview.failure.resource === 'coin') {
            const paid = sum(failed, (e) => e.type === 'coin_changed' && e.source === 'laboratores_penalty' ? e.amount : undefined);
            expect(-paid).toBe(preview.failure.amount);
          } else {
            const resource = preview.failure.resource;
            const gained = sum(failed, (e) =>
              e.type === 'burden_changed' && e.burden === resource && e.source === 'encounter_penalty' ? e.amount : undefined);
            expect(gained).toBe(preview.failure.amount);
          }
        }
      }
    }
    expect(checked).toBeGreaterThan(300);
    expect(wipeouts).toBeGreaterThan(0);
  });

  it('is also valid at reroll_or_accept', () => {
    if ((config.startingState.startingInventory.metheglin ?? 0) === 0) return; // only the items config can reroll
    let seen = 0;
    for (let seed = 1; seed <= 40 && seen === 0; seed++) {
      for (const state of walk(seed, config)) {
        if (state.pilgrimage?.stage !== 'reroll_or_accept') continue;
        const snapshot = structuredClone(state);
        const previews = previewApproaches(state, config);
        expect(previews.map((preview) => preview.estate)).toEqual([state.pilgrimage.currentApproach]);
        const rerolled = applyAction(state, { type: 'USE_CONSUMABLE', itemId: 'metheglin' }, config);
        const roll = rerolled.events.find((event) => event.type === 'encounter_resolved');
        expect(roll?.type === 'encounter_resolved' ? roll.probability : undefined).toBe(previews[0]!.odds.probability);
        const accepted = applyAction(state, { type: 'ACCEPT_RESULT' }, config);
        expect(accepted.events.some((event) => event.type === 'wipeout')).toBe(previews[0]!.failureWipesOut);
        expect(state).toEqual(snapshot);
        seen++;
      }
    }
    expect(seen).toBeGreaterThan(0);
  });
});

describe('preview guards and labels', () => {
  const config = loadShippedConfig();
  const fresh = () => createCampaign({ ...DEFAULT_OPTIONS, seed: 7 }, config);

  it('rejects the wrong phase or stage', () => {
    const home = fresh();
    expect(() => previewApproaches(home, config)).toThrow(RuleError);
    const road = applyAction(home, { type: 'BEGIN_PILGRIMAGE', carry: 10 }, config).state;
    expect(() => previewHomeActivity(road, { type: 'WORK', job: 'stables' }, config)).toThrow(RuleError);
    expect(() => previewHomeActivity(home, { type: 'TRAIN', tutor: 'nobody' as never }, config)).toThrow(RuleError);
  });

  it('reports astrology sources for the week', () => {
    // Week 16 = month 4 from the birth month: a Trine (job +15) in a New Moon week; month 5 has no aspect.
    const state: CampaignState = { ...fresh(), elapsedWeeks: 16 };
    const alehouse = previewHomeActivity(state, { type: 'WORK', job: 'alehouse' }, config);
    expect(alehouse.modifiers).toEqual(expect.arrayContaining(['solar:trine', 'lunar:new']));
    const plain = previewHomeActivity({ ...state, elapsedWeeks: 20 }, { type: 'WORK', job: 'alehouse' }, config);
    expect(alehouse.chance).toBe((plain.chance ?? 0) + config.astrology.solar.trineJobSuccessPts);
  });

  it('gives the coin-die range for the Alehouse and a guaranteed Stables outcome', () => {
    const state = { ...fresh(), elapsedWeeks: 1 }; // no solar aspect, Waxing without a repeat
    const alehouse = previewHomeActivity(state, { type: 'WORK', job: 'alehouse' }, config);
    expect(alehouse.success.coin).toEqual({ min: 11, max: 20 });
    expect(alehouse.failure).toBeDefined();
    const stables = previewHomeActivity(state, { type: 'WORK', job: 'stables' }, config);
    expect(stables.chance).toBeNull();
    expect(stables.failure).toBeUndefined();
    expect(stables.success.coin).toEqual({ min: 6, max: 6 });
  });

  it('flags a collapse and previews the forced convalescence', () => {
    const tired: CampaignState = { ...fresh(), elapsedWeeks: 1, fatigue: 78 }; // +5 Fatigue vs a ceiling of 80 after the lesson
    expect(previewHomeActivity(tired, { type: 'TRAIN', tutor: 'hedge_knight' }, config).success.collapse).toBe('fatigue');
    const pending: CampaignState = { ...tired, fatigue: 80, pendingConvalescence: 'home_collapse' };
    const rest = previewHomeActivity(pending, { type: 'REST', rest: 'rest_home' }, config);
    expect(rest.convalescence).toBe(true);
    expect(rest.success.fatigue).toBe(-config.failure.homeCollapse.recovery);
  });

  it('previews unaffordable activities as not affordable', () => {
    const broke: CampaignState = { ...fresh(), treasury: 5 };
    const banquet = previewHomeActivity(broke, { type: 'REST', rest: 'banquet' }, config);
    expect(banquet.affordable).toBe(false);
    expect(banquet.success.coin.min).toBe(-banquet.cost);
  });
});
