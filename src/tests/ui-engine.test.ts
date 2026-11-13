import { describe, expect, it } from 'vitest';
import {
  applyAction, createCampaign, getAvailableActions, hashConfig,
  type CampaignState, type CreateCampaignOptions, type GameEvent,
} from '../core/index.js';
import { activityOptions } from '../ui/engine/activities.js';
import { readSlot, slotKey, writeSave, deleteSave, type SaveStorage } from '../ui/engine/persistence.js';
import { deriveScreen, type UiState } from '../ui/engine/screen.js';
import { GameStore } from '../ui/engine/store.js';
import { summarize, weeksLine } from '../ui/engine/summarize.js';
import { loadShippedConfig } from './support/config.js';

const config = loadShippedConfig();
const OPTIONS: CreateCampaignOptions = {
  seed: 1234, birthSign: 'aries', playerName: { first: 'Aldous', last: 'Wyke' }, scionName: 'Elaine',
};
const game: UiState = { menu: 'game', homeView: 'hub' };

function memoryStorage(): SaveStorage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  };
}

const fresh = (): CampaignState => createCampaign(OPTIONS, config);

describe('deriveScreen', () => {
  it('routes by menu, phase, stage and convalescence', () => {
    const state = fresh();
    expect(deriveScreen(null, game)).toEqual({ kind: 'title' });
    expect(deriveScreen(state, { ...game, menu: 'title' })).toEqual({ kind: 'title' });
    expect(deriveScreen(state, { ...game, homeView: 'job' })).toEqual({ kind: 'home', view: 'job', convalescence: false });
    expect(deriveScreen({ ...state, pendingConvalescence: 'home_collapse' }, { ...game, homeView: 'job' }))
      .toEqual({ kind: 'home', view: 'hub', convalescence: true });
    expect(deriveScreen({ ...state, phase: 'defeat' }, game)).toEqual({ kind: 'outcome', outcome: 'deadline' });
    expect(deriveScreen({ ...state, phase: 'victory' }, game)).toEqual({ kind: 'outcome', outcome: 'victory' });
    const road = { stage: 'waystation_decision' } as CampaignState['pilgrimage'];
    expect(deriveScreen({ ...state, phase: 'pilgrimage', pilgrimage: road }, game)).toEqual({ kind: 'waystation' });
    expect(deriveScreen({ ...state, phase: 'pilgrimage', pilgrimage: { ...road!, stage: 'choose_approach' } }, game))
      .toEqual({ kind: 'encounter' });
  });
});

describe('summarize', () => {
  it('nets stat, burden and coin rows with sources and tones', () => {
    const events: GameEvent[] = [
      { week: 0, type: 'week_spent', reason: 'tutor' },
      { week: 0, type: 'coin_changed', account: 'treasury', amount: -20, source: 'tutor_fee' },
      { week: 0, type: 'stat_changed', estate: 'bellatores', amount: 5, source: 'tutor' },
      { week: 0, type: 'stat_changed', estate: 'laboratores', amount: -1, source: 'tutor_opposing' },
      { week: 0, type: 'burden_changed', burden: 'fatigue', amount: 5, source: 'tutor' },
    ];
    const summary = summarize({ type: 'TRAIN', tutor: 'hedge_knight' }, events)!;
    expect(summary.title).toBe('Lessons with The Hedge Knight');
    expect(summary.rows.map((r) => [r.quantity, r.amount, r.tone])).toEqual([
      ['bellatores', 5, 'good'], ['laboratores', -1, 'bad'], ['fatigue', 5, 'bad'], ['treasury', -20, 'bad'],
    ]);
    expect(summary.rows[1]!.sources).toEqual(['neglect']);
    expect(weeksLine(summary.weeks)).toBe('1 week passed: lessons.');
    expect(summarize({ type: 'RETREAT' }, [])).toBeNull();
  });

  it('reports job rolls, collapses and the deadline', () => {
    const job: GameEvent = { week: 3, type: 'job_resolved', job: 'alehouse', success: false, probability: 50, roll: 72, automatic: false };
    const collapse: GameEvent = { week: 3, type: 'collapse', cause: 'fatigue', fee: { nominal: 20, paid: 4 } };
    const s = summarize({ type: 'WORK', job: 'alehouse' }, [job, collapse, { week: 3, type: 'deadline' }])!;
    expect(s.title).toBe('The Alehouse: failure — collapse!');
    expect(s.detail).toBe('Rolled 72 against 50%.');
    expect(s.tone).toBe('bad');
    expect(s.notes.join(' ')).toMatch(/collapsed from Fatigue.*could only pay 4.*sixteenth birthday/);
    const stables = summarize({ type: 'WORK', job: 'stables' },
      [{ week: 0, type: 'job_resolved', job: 'stables', success: true, probability: 100, automatic: true }])!;
    expect(stables.title).toBe('The Stables: done');
  });

  it('summarises real applyAction results', () => {
    const { events } = applyAction(fresh(), { type: 'REST', rest: 'bathhouse' }, config);
    const s = summarize({ type: 'REST', rest: 'bathhouse' }, events)!;
    expect(s.title).toBe('The Bathhouse');
    expect(s.rows.find((r) => r.quantity === 'treasury')?.amount).toBe(-config.rest.bathhouse.cost);
  });
});

describe('activityOptions', () => {
  it('disables unaffordable activities with a reason instead of hiding them', () => {
    const poor = { ...fresh(), treasury: 10 };
    const tutors = activityOptions(poor, 'tutor', config);
    expect(tutors).toHaveLength(3);
    expect(tutors.every((o) => !o.enabled && o.reason === 'Costs 20, treasury 10')).toBe(true);
    expect(activityOptions(poor, 'job', config).every((o) => o.enabled)).toBe(true);
  });

  it('only allows rest at home while convalescing', () => {
    const state = { ...fresh(), pendingConvalescence: 'home_collapse' as const };
    const rests = activityOptions(state, 'rest', config);
    expect(rests.filter((o) => o.enabled).map((o) => o.action)).toEqual([{ type: 'REST', rest: 'rest_home' }]);
    expect(rests.find((o) => !o.enabled)?.reason).toBe('She must rest at home this week');
    expect(activityOptions(state, 'job', config).some((o) => o.enabled)).toBe(false);
  });
});

describe('persistence', () => {
  it('round-trips a save and flags config mismatches and corrupt slots', () => {
    const storage = memoryStorage();
    const state = fresh();
    const save = writeSave(storage, 'slot2', state, config, new Date('2026-01-02T03:04:05Z'));
    expect(save).toMatchObject({ format: 1, savedAt: '2026-01-02T03:04:05.000Z', configId: config.id, configHash: hashConfig(config) });
    expect(readSlot(storage, 'slot2', config)).toEqual({ slot: 'slot2', status: 'ok', save, compatible: true });
    expect(readSlot(storage, 'slot1', config)).toEqual({ slot: 'slot1', status: 'empty' });

    storage.setItem(slotKey('slot3'), JSON.stringify({ ...save, configHash: 'other' }));
    expect(readSlot(storage, 'slot3', config)).toMatchObject({ status: 'ok', compatible: false });

    storage.setItem(slotKey('slot1'), '{not json');
    expect(readSlot(storage, 'slot1', config).status).toBe('corrupt');
    storage.setItem(slotKey('slot1'), JSON.stringify({ ...save, format: 2 }));
    expect(readSlot(storage, 'slot1', config).status).toBe('corrupt');
    storage.setItem(slotKey('slot1'), JSON.stringify({ ...save, state: { ...state, phase: 'pilgrimage' } }));
    expect(readSlot(storage, 'slot1', config).status).toBe('corrupt');

    storage.setItem(slotKey('slot1'), JSON.stringify({ ...save, state: { ...state, birthSign: 'ophiuchus' } }));
    expect(readSlot(storage, 'slot1', config).status).toBe('corrupt');

    deleteSave(storage, 'slot2');
    expect(readSlot(storage, 'slot2', config).status).toBe('empty');
  });
});

describe('GameStore', () => {
  it('applies actions, shows a result, returns to the hub and autosaves', () => {
    const storage = memoryStorage();
    const store = new GameStore(config, storage);
    let notified = 0;
    store.subscribe(() => notified++);
    store.newGame(OPTIONS);
    store.setUi({ homeView: 'job' });
    const before = store.getSnapshot();
    store.dispatch({ type: 'WORK', job: 'stables' });
    const after = store.getSnapshot();
    expect(after).not.toBe(before);
    expect(after.state!.elapsedWeeks).toBe(1);
    expect(after.ui.homeView).toBe('hub');
    expect(after.ui.pendingResult?.title).toBe('The Stables: done');
    expect(notified).toBeGreaterThan(0);

    // Blocked until the result is dismissed.
    store.dispatch({ type: 'WORK', job: 'stables' });
    expect(store.getSnapshot().state!.elapsedWeeks).toBe(1);
    store.dismissResult();
    expect(store.getSnapshot().ui.pendingResult).toBeUndefined();

    const auto = readSlot(storage, 'auto', config);
    expect(auto.status === 'ok' && auto.save.state).toEqual(after.state);
  });

  it('rejects unavailable actions without changing state', () => {
    const store = new GameStore(config, null);
    store.newGame(OPTIONS);
    const state = store.getSnapshot().state;
    store.dispatch({ type: 'RETREAT' });
    expect(store.getSnapshot().state).toBe(state);
    expect(store.getSnapshot().error).toBe('That action is not available now.');
    store.clearError();
    expect(store.getSnapshot().error).toBeNull();
  });

  it('saves to and loads from a manual slot', () => {
    const storage = memoryStorage();
    const store = new GameStore(config, storage);
    store.newGame(OPTIONS);
    store.dispatch({ type: 'TRAIN', tutor: 'hermit' });
    store.save('slot1');
    const saved = store.getSnapshot().state;
    store.quitToTitle();
    expect(store.getSnapshot().state).toBeNull();
    expect(store.load('slot1')).toBe(true);
    expect(store.getSnapshot().state).toEqual(saved);
    expect(store.getSnapshot().ui).toEqual({ menu: 'game', homeView: 'hub' });
    expect(store.load('slot3')).toBe(false);
    expect(store.getSnapshot().error).toBe('That slot is empty.');
  });

  it('plays a home-only campaign to the deadline using only enabled options', () => {
    const store = new GameStore(config, memoryStorage());
    store.newGame(OPTIONS);
    const kinds = ['tutor', 'job', 'rest'] as const;
    const seen = new Set<string>();
    let turn = 0;
    while (store.getSnapshot().state!.phase === 'home') {
      const state = store.getSnapshot().state!;
      if (getAvailableActions(state, config).length === 0) break;
      // Rest when strained, otherwise rotate kinds, picking the first enabled option.
      const strained = state.fatigue > 40 || state.melancholy > 40;
      const order = strained ? (['rest', 'job', 'tutor'] as const) : [kinds[turn % 3]!, 'job' as const, 'rest' as const];
      const enabled = order.map((k) => activityOptions(state, k, config).filter((o) => o.enabled)).find((l) => l.length > 0);
      expect(enabled).toBeDefined();
      const choice = enabled![turn % enabled!.length]!;
      seen.add(choice.preview.activityId);
      store.dispatch(choice.action);
      expect(store.getSnapshot().error).toBeNull();
      const result = store.getSnapshot().ui.pendingResult;
      expect(result).toBeDefined();
      store.dismissResult();
      turn++;
      expect(turn).toBeLessThan(500);
    }
    const end = store.getSnapshot();
    expect(end.state!.phase).toBe('defeat');
    expect(end.state!.outcome).toBe('deadline');
    expect(deriveScreen(end.state, end.ui)).toEqual({ kind: 'outcome', outcome: 'deadline' });
    expect(seen.size).toBeGreaterThanOrEqual(9);
  });
});
