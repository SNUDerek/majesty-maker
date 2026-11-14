/** STORY_BEAT engine support (docs/dialog-and-story-beats-plan.md §7, task T3). */
import { describe, expect, it } from 'vitest';
import { applyAction, createCampaign, getAvailableActions } from '../core/index.js';
import { RuleError, type CampaignState, type GameAction } from '../core/types.js';
import { chronicleEntry } from '../ui/engine/chronicle.js';
import { readSlot, slotKey, writeSave, type SaveStorage } from '../ui/engine/persistence.js';
import { summarize } from '../ui/engine/summarize.js';
import { assertInvariants } from './invariants.js';
import { DEFAULT_OPTIONS } from './scenarios/harness.js';
import { loadContentConfig } from './support/config.js';

const config = loadContentConfig();
const start = (overrides: Partial<CampaignState> = {}): CampaignState =>
  ({ ...createCampaign(DEFAULT_OPTIONS, config), ...overrides });
const beat = (beatId: string, reward?: { coin?: number; items?: string[] }): GameAction =>
  ({ type: 'STORY_BEAT', beatId, ...(reward === undefined ? {} : { reward }) });

function rejects(state: CampaignState, action: GameAction, code: RuleError['code']): void {
  try {
    applyAction(state, action, config);
  } catch (error) {
    expect(error).toBeInstanceOf(RuleError);
    expect((error as RuleError).code).toBe(code);
    return;
  }
  throw new Error(`expected ${code}`);
}

function memoryStorage(): SaveStorage {
  const data = new Map<string, string>();
  return { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v), removeItem: (k) => void data.delete(k) };
}

describe('STORY_BEAT', () => {
  it('records the beat with its week and grants coin and items', () => {
    const before = start({ elapsedWeeks: 7 });
    const { state, events } = applyAction(before, beat('knight_1', { coin: 30, items: ['gambeson'] }), config);
    expect(state.storyBeats).toEqual({ knight_1: 7 });
    expect(state.treasury).toBe(before.treasury + 30);
    expect(state.inventory.gambeson).toBe((before.inventory.gambeson ?? 0) + 1);
    expect(events).toEqual([
      { type: 'story_beat', week: 7, beatId: 'knight_1' },
      { type: 'coin_changed', week: 7, account: 'treasury', amount: 30, source: 'story_reward' },
      { type: 'item_changed', week: 7, itemId: 'gambeson', amount: 1, source: 'reward' },
    ]);
    expect(before.storyBeats).toBeUndefined(); // input untouched
    assertInvariants(state, config, before);
  });

  it('keeps earlier beats and works without a reward', () => {
    const first = applyAction(start(), beat('a'), config).state;
    const { state, events } = applyAction({ ...first, elapsedWeeks: 3 }, beat('b'), config);
    expect(state.storyBeats).toEqual({ a: 0, b: 3 });
    expect(events).toEqual([{ type: 'story_beat', week: 3, beatId: 'b' }]);
  });

  it('spends no week, draws no randomness and keeps the Waxing chain', () => {
    const worked = applyAction(start(), { type: 'WORK', job: 'stables' }, config).state;
    const { state, events } = applyAction(worked, beat('stables_1', { coin: 5 }), config);
    expect(events.some((e) => e.type === 'week_spent')).toBe(false);
    expect(state.elapsedWeeks).toBe(worked.elapsedWeeks);
    expect(state.rng).toEqual(worked.rng);
    expect(state.lastWeeklyActivityId).toBe(worked.lastWeeklyActivityId);
    expect(state.waxingStreak).toBe(worked.waxingStreak);
    expect({ ...state, storyBeats: undefined, treasury: worked.treasury }).toEqual({ ...worked, storyBeats: undefined });
  });

  it('caps coin at the treasury maximum', () => {
    const max = config.startingState.treasuryMax;
    const { state, events } = applyAction(start({ treasury: max - 10 }), beat('rich', { coin: 500 }), config);
    expect(state.treasury).toBe(max);
    expect(events).toContainEqual({ type: 'coin_changed', week: 0, account: 'treasury', amount: 10, source: 'story_reward' });
    const full = applyAction(start({ treasury: max }), beat('rich', { coin: 5 }), config);
    expect(full.events.filter((e) => e.type === 'coin_changed')).toEqual([]);
  });

  it('grants items even when random acquisition is disabled', () => {
    expect(config.items.acquisition).toBe('disabled');
    const { state } = applyAction(start(), beat('relic', { items: ['saints_relic', 'saints_relic'] }), config);
    expect(state.inventory.saints_relic).toBe(2);
  });

  it('rejects replays, unknown items and bad coin', () => {
    const played = applyAction(start(), beat('knight_1'), config).state;
    rejects(played, beat('knight_1'), 'INVALID_ACTION');
    rejects(start(), beat('x', { items: ['excalibur'] }), 'INVALID_ITEM');
    rejects(start(), beat('x', { items: ['__proto__'] }), 'INVALID_ITEM');
    rejects(start(), beat('x', { coin: -1 }), 'INVALID_ACTION');
    rejects(start(), beat('x', { coin: 1.5 }), 'INVALID_ACTION');
    rejects(start(), beat(''), 'INVALID_ACTION');
  });

  it('is rejected outside home and during convalescence', () => {
    rejects(start({ pendingConvalescence: 'home_collapse' }), beat('x'), 'INVALID_ACTION');
    const departure = getAvailableActions(start(), config).find((a) => a.type === 'BEGIN_PILGRIMAGE');
    if (departure?.type !== 'BEGIN_PILGRIMAGE') throw new Error('expected a departure');
    const road = applyAction(start(), { type: 'BEGIN_PILGRIMAGE', carry: departure.minCarry }, config).state;
    expect(road.phase).toBe('pilgrimage');
    rejects(road, beat('x'), 'INVALID_PHASE');
    rejects(start({ phase: 'victory' }), beat('x'), 'CAMPAIGN_FINISHED');
    rejects(start({ elapsedWeeks: config.calendar.totalWeeks }), beat('x'), 'DEADLINE_REACHED');
  });

  it('is never offered by getAvailableActions', () => {
    expect(getAvailableActions(start(), config).some((a) => (a.type as string) === 'STORY_BEAT')).toBe(false);
  });
});

describe('STORY_BEAT in the UI layer', () => {
  it('shows no result panel and gets a Chronicle entry', () => {
    const before = start();
    const action = beat('knight_4', { coin: 20, items: ['gambeson'] });
    const { state, events } = applyAction(before, action, config);
    expect(summarize(action, events, state)).toBeNull();
    const entry = chronicleEntry(before, action, events, state, config);
    expect(entry.title).toBe('A story: knight_4');
    expect(entry.detail).toBe(`Received ${config.items.catalog.gambeson!.name}.`);
    expect(entry.rows).toEqual([{ quantity: 'treasury', amount: 20 }]);
  });

  it('loads old saves without storyBeats, and saves with them', () => {
    const storage = memoryStorage();
    writeSave(storage, 'auto', start(), config, new Date());
    const old = readSlot(storage, 'auto', config);
    expect(old.status).toBe('ok');
    expect(old.status === 'ok' && old.save.state.storyBeats).toBeUndefined();

    writeSave(storage, 'slot1', applyAction(start(), beat('a'), config).state, config, new Date());
    const loaded = readSlot(storage, 'slot1', config);
    expect(loaded.status === 'ok' && loaded.save.state.storyBeats).toEqual({ a: 0 });
  });

  it('rejects malformed storyBeats as corrupt', () => {
    const storage = memoryStorage();
    for (const storyBeats of [[], { a: -1 }, { a: 'x' }, null]) {
      writeSave(storage, 'slot2', start(), config, new Date());
      const save = JSON.parse(storage.getItem(slotKey('slot2'))!);
      save.state.storyBeats = storyBeats;
      storage.setItem(slotKey('slot2'), JSON.stringify(save));
      expect(readSlot(storage, 'slot2', config).status, JSON.stringify(storyBeats)).toBe('corrupt');
    }
  });
});
