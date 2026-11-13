import { describe, expect, it } from 'vitest';
import {
  applyAction, createCampaign, getAvailableActions, previewApproaches, withOverrides,
  type CampaignState, type CreateCampaignOptions, type GameAction,
} from '../core/index.js';
import { chronicleByWeek, chronicleEntry } from '../ui/engine/chronicle.js';
import { readSlot, slotKey, writeSave, type SaveStorage } from '../ui/engine/persistence.js';
import { departureAction, departureOption } from '../ui/engine/road.js';
import { activityOptions } from '../ui/engine/activities.js';
import { GameStore } from '../ui/engine/store.js';
import { loadShippedConfig } from './support/config.js';

const config = loadShippedConfig();
const items = withOverrides(config, { startingState: { startingInventory: { theriac: 2, metheglin: 2, gambeson: 1 } } });
const OPTIONS: CreateCampaignOptions = { seed: 8, birthSign: 'leo', playerName: { first: 'A', last: 'Wyke' }, scionName: 'Elaine' };

function memoryStorage(): SaveStorage {
  const data = new Map<string, string>();
  return { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v), removeItem: (k) => void data.delete(k) };
}

/** Applies an action and returns its Chronicle entry plus the next state. */
function step(state: CampaignState, action: GameAction, cfg = config) {
  const result = applyAction(state, action, cfg);
  return { entry: chronicleEntry(state, action, result.events, result.state, cfg), state: result.state };
}

describe('chronicleEntry', () => {
  it('logs home activities with their result headline and net rows', () => {
    const home = createCampaign(OPTIONS, config);
    const { entry } = step(home, { type: 'TRAIN', tutor: 'hermit' });
    expect(entry).toMatchObject({ week: 0, action: { type: 'TRAIN', tutor: 'hermit' }, title: 'Lessons with The Hermit' });
    expect(entry.rows.map((r) => r.quantity)).toEqual(['oratores', 'melancholy', 'treasury']);
    expect(entry.rows.find((r) => r.quantity === 'treasury')?.amount).toBe(-config.classes.tutors.hermit.cost);
    const job = step(home, { type: 'WORK', job: 'alehouse' }).entry;
    expect(job.title).toMatch(/^The Alehouse: (success|failure)$/);
    expect(job.detail).toMatch(/^Rolled \d+ against \d+%\.$/);
  });

  it('logs actions that have no result panel: departure, reveals, remedies, next segment', () => {
    const home = createCampaign(OPTIONS, items);
    const depart = step(home, { type: 'BEGIN_PILGRIMAGE', carry: 20, equipmentId: 'gambeson', consumableId: 'theriac' }, items);
    expect(depart.entry.title).toBe('Set out on Road to Waystation 1');
    expect(depart.entry.detail).toMatch(/^Carrying 20 Coin and Gambeson, Theriac\. A (Bellatores|Oratores|Laboratores) threat\.$/);
    expect(depart.entry.rows).toEqual([{ quantity: 'treasury', amount: -30 }, { quantity: 'carried', amount: 20 }]);

    // Play on until a press-on reveal and a remedy are possible.
    let state = depart.state;
    let reveal; let remedy;
    for (let i = 0; i < 20 && state.phase === 'pilgrimage' && (reveal === undefined || remedy === undefined); i++) {
      const stage = state.pilgrimage!.stage;
      if (stage === 'choose_approach') {
        const best = previewApproaches(state, items).sort((a, b) => b.odds.probability - a.odds.probability)[0]!;
        state = step(state, { type: 'CHOOSE_APPROACH', estate: best.estate }, items).state;
      } else if (stage === 'reroll_or_accept') {
        state = step(state, { type: 'ACCEPT_RESULT' }, items).state;
      } else if (stage === 'continue_or_retreat') {
        if (remedy === undefined && getAvailableActions(state, items).some((a) => a.type === 'USE_CONSUMABLE')) {
          const r = step({ ...state, fatigue: 40 }, { type: 'USE_CONSUMABLE', itemId: 'theriac' }, items);
          remedy = r.entry; state = r.state; continue;
        }
        const r = step(state, { type: 'CONTINUE_ENCOUNTER' }, items);
        reveal = r.entry; state = r.state;
      } else break;
    }
    expect(reveal?.title).toMatch(/^A (Bellatores|Oratores|Laboratores) threat$/);
    expect(remedy).toMatchObject({ title: 'Used Theriac', rows: [{ quantity: 'fatigue', amount: -30 }] });
  });

  it('logs pressing on from a waystation', () => {
    const road = applyAction(createCampaign(OPTIONS, config), { type: 'BEGIN_PILGRIMAGE', carry: 10 }, config).state;
    const atWaystation: CampaignState = { ...road, furthestWaystation: 1,
      pilgrimage: { ...road.pilgrimage!, stage: 'waystation_decision', encounterIndex: 5 } };
    const { entry } = step(atWaystation, { type: 'CONTINUE_SEGMENT' });
    expect(entry.title).toBe('Pressed on to Road to Waystation 2');
    expect(entry.detail).toMatch(/threat\.$/);
  });

  it('groups by week, newest first throughout', () => {
    const e = (week: number, title: string) => ({ week, action: { type: 'RETREAT' } as GameAction, title, rows: [], notes: [] });
    expect(chronicleByWeek([e(0, 'a'), e(1, 'b'), e(1, 'c'), e(3, 'd')]).map((w) => [w.week, w.entries.map((x) => x.title)]))
      .toEqual([[3, ['d']], [1, ['c', 'b']], [0, ['a']]]);
  });
});

describe('Chronicle storage', () => {
  it('appends per action, clears on New Game, restores on load and survives saves', () => {
    const storage = memoryStorage();
    const store = new GameStore(config, storage);
    store.newGame(OPTIONS);
    store.dispatch({ type: 'WORK', job: 'stables' }); store.dismissResult();
    store.dispatch({ type: 'REST', rest: 'rest_home' }); store.dismissResult();
    expect(store.getSnapshot().log.map((e) => e.title)).toEqual(['The Stables: done', 'Rest at Home']);
    store.save('slot1');
    const saved = store.getSnapshot().log;

    store.newGame(OPTIONS);
    expect(store.getSnapshot().log).toEqual([]);
    expect(store.load('slot1')).toBe(true);
    expect(store.getSnapshot().log).toEqual(saved);
    store.quitToTitle();
    expect(store.getSnapshot().log).toEqual([]);
    expect(store.load('auto')).toBe(true); // autosave from the second New Game: empty log
    expect(store.getSnapshot().log).toEqual([]);
  });

  it('reads older saves without a log, and drops malformed entries', () => {
    const storage = memoryStorage();
    const state = createCampaign(OPTIONS, config);
    const save = writeSave(storage, 'slot2', state, config, new Date(0));
    const { log: _omitted, ...old } = save;
    storage.setItem(slotKey('slot2'), JSON.stringify(old));
    const info = readSlot(storage, 'slot2', config);
    expect(info.status === 'ok' && info.save.log).toEqual([]);
    storage.setItem(slotKey('slot2'), JSON.stringify({ ...old, log: [{ week: 'x' }, { week: 0, title: 'ok', rows: [], notes: [], action: { type: 'RETREAT' } }] }));
    const info2 = readSlot(storage, 'slot2', config);
    expect(info2.status === 'ok' && info2.save.log!.map((e) => e.title)).toEqual(['ok']);
    storage.setItem(slotKey('slot2'), JSON.stringify({ ...old, log: 'nope' }));
    const info3 = readSlot(storage, 'slot2', config);
    expect(info3.status === 'ok' && info3.save.log).toEqual([]);
  });

  it('a full seeded campaign logs one entry per action and stays small', () => {
    const storage = memoryStorage();
    const store = new GameStore(config, storage);
    store.newGame({ ...OPTIONS, seed: 4 });
    let actions = 0;
    for (let i = 0; i < 2000 && store.getSnapshot().state!.phase !== 'victory' && store.getSnapshot().state!.phase !== 'defeat'; i++) {
      if (store.getSnapshot().ui.pendingResult !== undefined) { store.dismissResult(); continue; }
      const state = store.getSnapshot().state!;
      let action: GameAction;
      if (state.phase === 'home') {
        const departure = departureOption(state, config);
        const tired = state.fatigue > 40 || state.melancholy > 40;
        if (departure !== null && !tired && state.elapsedWeeks > 30 && state.elapsedWeeks % 4 === 0) action = departureAction(departure, departure.maxCarry);
        else action = activityOptions(state, tired ? 'rest' : state.treasury < 40 ? 'job' : 'tutor', config).find((o) => o.enabled)?.action
          ?? { type: 'REST', rest: 'rest_home' };
      } else {
        const stage = state.pilgrimage!.stage;
        action = stage === 'choose_approach' ? { type: 'CHOOSE_APPROACH', estate: previewApproaches(state, config).sort((a, b) => b.odds.probability - a.odds.probability)[0]!.estate }
          : stage === 'reroll_or_accept' ? { type: 'ACCEPT_RESULT' }
          : stage === 'continue_or_retreat' ? { type: state.fatigue > 50 || state.melancholy > 50 ? 'RETREAT' : 'CONTINUE_ENCOUNTER' }
          : { type: 'RETURN_HOME' };
      }
      store.dispatch(action);
      expect(store.getSnapshot().error).toBeNull();
      actions++;
    }
    const { log } = store.getSnapshot();
    expect(log).toHaveLength(actions);
    expect(log.some((e) => e.title.startsWith('Set out on'))).toBe(true);
    expect(log.some((e) => /^A \w+ threat$/.test(e.title))).toBe(true);
    const auto = readSlot(storage, 'auto', config);
    expect(auto.status === 'ok' && auto.save.log).toEqual(log);
    expect(JSON.stringify(log).length).toBeLessThan(200_000);
  });
});
