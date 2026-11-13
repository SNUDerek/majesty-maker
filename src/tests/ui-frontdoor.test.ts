import { readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { applyAction, createCampaign, type CreateCampaignOptions } from '../core/index.js';
import { deriveScreen } from '../ui/engine/screen.js';
import { writeSave, type SaveStorage } from '../ui/engine/persistence.js';
import { slotSummary } from '../ui/engine/slots.js';
import { GameStore } from '../ui/engine/store.js';
import { INTRO } from '../ui/text/intro.js';
import { loadShippedConfig } from './support/config.js';

const config = loadShippedConfig();
const OPTIONS: CreateCampaignOptions = { seed: 5, birthSign: 'pisces', playerName: { first: 'A', last: 'B' }, scionName: 'Elaine' };

function memoryStorage(): SaveStorage {
  const data = new Map<string, string>();
  return { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v), removeItem: (k) => void data.delete(k) };
}

describe('front door routing', () => {
  it('routes intro and setup without a campaign', () => {
    expect(deriveScreen(null, { menu: 'intro', homeView: 'hub' })).toEqual({ kind: 'intro' });
    expect(deriveScreen(null, { menu: 'setup', homeView: 'hub' })).toEqual({ kind: 'setup' });
    expect(deriveScreen(null, { menu: 'game', homeView: 'hub' })).toEqual({ kind: 'title' });
  });
});

describe('intro script', () => {
  it('uses every intro panel in the assets except 04B, in order', () => {
    const files = readdirSync(new URL('../../assets/misc/intro_panels/', import.meta.url))
      .map((f) => /^intro_(\w+)_1024x768\.webp$/.exec(f)?.[1]).filter((id): id is string => id !== undefined).sort();
    expect(INTRO.map((l) => l.panel)).toEqual(files.filter((id) => id !== '04B'));
    expect(INTRO.every((l) => l.text.length > 20)).toBe(true);
  });
});

describe('slot summaries', () => {
  it('describes home, road, waystation and finished saves', () => {
    const home = createCampaign(OPTIONS, config);
    const save = (state: typeof home) => writeSave(memoryStorage(), 'slot1', state, config, new Date(0));
    expect(slotSummary(save(home), config)).toEqual({ name: 'Elaine', birthSign: 'pisces', date: 'Week 1 of February, 1450', where: 'At home' });
    const road = applyAction(home, { type: 'BEGIN_PILGRIMAGE', carry: 10 }, config).state;
    expect(slotSummary(save(road), config).where).toBe(`On the road: Road to Waystation 1, 1/${config.route.encountersPerSegment}`);
    expect(slotSummary(save({ ...road, pilgrimage: { ...road.pilgrimage!, stage: 'waystation_decision' } }), config).where).toBe('At Waystation 1');
    expect(slotSummary(save({ ...home, phase: 'victory', outcome: 'victory' }), config).where).toBe('Victory');
  });
});

describe('GameStore menus', () => {
  it('lists, saves, deletes slots and closes overlays', () => {
    const store = new GameStore(config, memoryStorage());
    expect(store.slots().map((s) => s.status)).toEqual(['empty', 'empty', 'empty', 'empty']);
    store.newGame(OPTIONS);
    store.save('slot2');
    expect(store.slots().map((s) => s.status)).toEqual(['ok', 'empty', 'ok', 'empty']);
    store.deleteSlot('slot2');
    expect(store.slots()[2]!.status).toBe('empty');
    store.setUi({ overlay: 'saveload' });
    expect(store.getSnapshot().ui.overlay).toBe('saveload');
    store.closeOverlay();
    expect('overlay' in store.getSnapshot().ui).toBe(false);
    expect(new GameStore(config, null).slots()).toEqual([]);
  });

  it('uses and keeps the dev seed, and lets the dev panel replace state', () => {
    const store = new GameStore(config, memoryStorage());
    store.setUi({ devSeed: 777 });
    store.newGame({ ...OPTIONS, seed: store.getSnapshot().ui.devSeed! });
    expect(store.getSnapshot().state!.seed).toBe(777);
    expect(store.getSnapshot().ui.devSeed).toBe(777);
    const state = store.getSnapshot().state!;
    store.devReplaceState({ ...state, treasury: state.treasury + 100 });
    expect(store.getSnapshot().state!.treasury).toBe(state.treasury + 100);
    expect(store.slots()[0]!.status === 'ok' && store.slots()[0]!.status).toBe('ok');
  });
});
