/// <reference types="vite/client" />
/** Story beats: tag parsing, the trigger rule and the store flow (docs/dialog-and-story-beats-plan.md §6, task T4). */
import { describe, expect, it } from 'vitest';
import { Compiler } from 'inkjs/full';
import { createCampaign, getAvailableActions, type CampaignState } from '../core/index.js';
import { BACKGROUND } from '../ui/assets.js';
import { GameStore } from '../ui/engine/store.js';
import { beatReward, loadBeats, nextBeat, rewardLines, validateBeats, type Beat } from '../ui/engine/story.js';
import { CHARACTERS } from '../ui/text/characters.js';
import { STORY } from '../ui/text/stories.js';
import { loadShippedConfig } from './support/config.js';

const config = loadShippedConfig();
const OPTIONS = { seed: 1234, birthSign: 'aries' as const, playerName: { first: 'Aldous', last: 'Wyke' }, scionName: 'Elaine' };
const HEADER = 'VAR scion = "Joan"\nVAR player = "Gerald"\nVAR bellatores = 15\nVAR oratores = 15\nVAR laboratores = 15\n';
const ink = (source: string): string => new Compiler(HEADER + source).Compile().ToJson()!;
const knot = (name: string, tags: string, line = 'Hello.') => `=== ${name} ===\n${tags}\n${line}\n-> END\n`;
const fresh = (overrides: Partial<CampaignState> = {}): CampaignState => ({ ...createCampaign(OPTIONS, config), ...overrides });

const KNOWN = {
  activities: [...Object.keys(config.classes.tutors), ...Object.keys(config.jobs.definitions), ...Object.keys(config.rest)],
  items: Object.keys(config.items.catalog),
  backgrounds: Object.keys(BACKGROUND),
  characters: Object.keys(CHARACTERS),
};

/** Two knight beats, one father talk. */
const FIXTURE = loadBeats({
  'knight.ink': ink(`# cooldown: 2\n-> END\n${knot('k2', '# order: 20\n# activity: hedge_knight\n# stat: bellatores 30\n# reward: item gambeson')}`
    + knot('k1', '# order: 10\n# title: First Lesson\n# activity: hedge_knight village_watch\n# reward: coin 25')),
  'father.ink': ink(`-> END\n${knot('talk', '# order: 10\n# activity: socialize\n# month: 1')}`),
}).beats;
const byId = (id: string): Beat => FIXTURE.find((b) => b.id === id)!;

describe('content/story', () => {
  it('parses and validates', () => {
    expect(STORY.errors).toEqual([]);
    expect(validateBeats(STORY.beats, KNOWN)).toEqual([]);
    expect(new Set(STORY.beats.map((b) => b.thread))).toEqual(new Set(['alley', 'cloister', 'father', 'knight', 'stables']));
  });
});

describe('loadBeats', () => {
  it('reads knot tags with defaults, sorted by order', () => {
    expect(FIXTURE.map((b) => b.id)).toEqual(['father/talk', 'knight/k1', 'knight/k2']);
    expect(byId('knight/k1')).toMatchObject({
      thread: 'knight', knot: 'k1', title: 'First Lesson', order: 10, activities: ['hedge_knight', 'village_watch'],
      month: 1, stats: [], rewards: [{ kind: 'coin', amount: 25 }], cooldown: 2,
    });
    expect(byId('knight/k2')).toMatchObject({ title: 'k2', stats: [['bellatores', 30]], rewards: [{ kind: 'item', id: 'gambeson' }] });
    expect(byId('father/talk').cooldown).toBe(2); // default
    expect(byId('knight/k1').bg).toBeUndefined();
  });

  it('skips knots without an order tag and reports bad tags', () => {
    const { beats, errors } = loadBeats({
      'bad.ink': ink(`# cooldown: soon\n-> END\n${knot('helper', '# bg: home')}`),
      'odd.ink': ink(`-> END\n${knot('a', '# order: ten\n# activity: stables')}${knot('b', '# order: 10')}`
        + knot('c', '# order: 20\n# activity: stables\n# stat: luck 5\n# reward: coin -3\n# month: 0')),
    });
    expect(beats).toEqual([]);
    expect(errors).toEqual(expect.arrayContaining([
      'bad: bad cooldown "soon"', 'odd/a: bad order "ten"', 'odd/b: missing activity',
      'odd/c: bad stat "luck 5"', 'odd/c: bad reward "coin -3"', 'odd/c: bad month "0"',
    ]));
  });

  it('rejects unsafe numeric tags and overflowing combined rewards before playback', () => {
    const unsafe = '9007199254740992';
    for (const tag of [`order: ${unsafe}`, `month: ${unsafe}`, `stat: bellatores ${unsafe}`, `reward: coin ${unsafe}`]) {
      const loaded = loadBeats({ 'unsafe.ink': ink(`-> END\n${knot('a', `# order: 10\n# activity: stables\n# ${tag}`.replace('# order: 10\n', tag.startsWith('order:') ? '' : '# order: 10\n'))}`) });
      expect(loaded.beats, tag).toEqual([]);
      expect(loaded.errors.length, tag).toBeGreaterThan(0);
    }
    const combined = loadBeats({ 'sum.ink': ink(`-> END\n${knot('a', '# order: 10\n# activity: stables\n# reward: coin 9007199254740991\n# reward: coin 1')}`) });
    expect(combined.beats).toEqual([]);
    expect(combined.errors).toContain('sum/a: total coin reward exceeds safe integer range');
    expect(loadBeats({ 'cool.ink': ink(`# cooldown: ${unsafe}\n-> END\n${knot('a', '# order: 10\n# activity: stables')}`) }).beats).toEqual([]);
  });

  it('validates ids and duplicate orders', () => {
    const { beats } = loadBeats({
      'x.ink': ink(`-> END\n${knot('a', '# order: 10\n# activity: jousting\n# reward: item excalibur\n# bg: moon\n# left: dragon')}`
        + knot('b', '# order: 10\n# activity: stables')),
    });
    expect(validateBeats(beats, KNOWN)).toEqual([
      'x/a: unknown activity jousting', 'x/a: unknown item excalibur', 'x/a: unknown background moon',
      'x/a: unknown character dragon', 'x/b: duplicate order 10 in x',
    ]);
  });

  it('turns rewards into the core reward and display lines', () => {
    expect(beatReward(byId('knight/k1'))).toEqual({ coin: 25 });
    expect(beatReward(byId('knight/k2'))).toEqual({ items: ['gambeson'] });
    expect(beatReward(byId('father/talk'))).toBeUndefined();
    expect(rewardLines(byId('knight/k2'), config)).toEqual([config.items.catalog.gambeson!.name]);
  });
});

describe('nextBeat', () => {
  it('only offers the first unplayed beat of a thread, for its activities', () => {
    const strong = fresh({ stats: { bellatores: 50, oratores: 15, laboratores: 15 } });
    expect(nextBeat(FIXTURE, strong, 'hedge_knight', config)?.id).toBe('knight/k1'); // never skips ahead to k2
    expect(nextBeat(FIXTURE, strong, 'village_watch', config)?.id).toBe('knight/k1');
    expect(nextBeat(FIXTURE, strong, 'hermit', config)).toBeUndefined();
    const played = { ...strong, elapsedWeeks: 5, storyBeats: { 'knight/k1': 1 } };
    expect(nextBeat(FIXTURE, played, 'hedge_knight', config)?.id).toBe('knight/k2');
    expect(nextBeat(FIXTURE, played, 'village_watch', config)).toBeUndefined(); // k2 is knight-only
  });

  it('gates on month and minimum stats', () => {
    const month = loadBeats({ 'm.ink': ink(`-> END\n${knot('a', '# order: 10\n# activity: stables\n# month: 3')}`) }).beats;
    expect(nextBeat(month, fresh({ elapsedWeeks: 7 }), 'stables', config)).toBeUndefined();
    expect(nextBeat(month, fresh({ elapsedWeeks: 8 }), 'stables', config)?.id).toBe('m/a');
    const after = { elapsedWeeks: 5, storyBeats: { 'knight/k1': 1 } };
    expect(nextBeat(FIXTURE, fresh({ ...after, stats: { bellatores: 29, oratores: 15, laboratores: 15 } }), 'hedge_knight', config)).toBeUndefined();
    expect(nextBeat(FIXTURE, fresh({ ...after, stats: { bellatores: 30, oratores: 15, laboratores: 15 } }), 'hedge_knight', config)?.id).toBe('knight/k2');
  });

  it('applies the thread cooldown and one beat per week', () => {
    const strong = { stats: { bellatores: 50, oratores: 15, laboratores: 15 } };
    expect(nextBeat(FIXTURE, fresh({ ...strong, elapsedWeeks: 4, storyBeats: { 'knight/k1': 3 } }), 'hedge_knight', config)).toBeUndefined();
    expect(nextBeat(FIXTURE, fresh({ ...strong, elapsedWeeks: 5, storyBeats: { 'knight/k1': 3 } }), 'hedge_knight', config)?.id).toBe('knight/k2');
    // Another thread's beat this week blocks the father talk, though its thread is fresh.
    expect(nextBeat(FIXTURE, fresh({ elapsedWeeks: 5, storyBeats: { 'knight/k1': 5 } }), 'socialize', config)).toBeUndefined();
    expect(nextBeat(FIXTURE, fresh({ elapsedWeeks: 6, storyBeats: { 'knight/k1': 5 } }), 'socialize', config)?.id).toBe('father/talk');
  });
});

describe('GameStore story flow', () => {
  const newStore = (beats: readonly Beat[] = FIXTURE) => {
    const data = new Map<string, string>();
    const store = new GameStore(config, {
      getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v), removeItem: (k) => void data.delete(k),
    }, () => new Date(0), beats);
    store.newGame(OPTIONS);
    return store;
  };

  it('plays a beat after the activity, with the result waiting behind it', () => {
    const store = newStore();
    const before = store.getSnapshot().state!;
    store.dispatch({ type: 'TRAIN', tutor: 'hedge_knight' });
    const snap = store.getSnapshot();
    expect(snap.ui.pendingDialog).toEqual({ beatId: 'knight/k1', activity: 'hedge_knight' });
    expect(snap.ui.pendingResult).toBeDefined();
    store.dispatch({ type: 'WORK', job: 'stables' }); // blocked while the scene is open
    expect(store.getSnapshot().state).toBe(snap.state);

    store.finishBeat();
    const done = store.getSnapshot();
    expect(done.ui.pendingDialog).toBeUndefined();
    expect(done.ui.pendingResult).toEqual(snap.ui.pendingResult);
    expect(done.state!.storyBeats).toEqual({ 'knight/k1': 1 });
    expect(done.state!.treasury).toBe(snap.state!.treasury + 25);
    expect(done.state!.elapsedWeeks).toBe(before.elapsedWeeks + 1);
    expect(done.log.at(-1)).toMatchObject({ title: 'A story: First Lesson', rows: [{ quantity: 'treasury', amount: 25 }] });
  });

  it('grants items through the engine', () => {
    const store = newStore();
    store.devReplaceState({ ...store.getSnapshot().state!, elapsedWeeks: 4, storyBeats: { 'knight/k1': 1 },
      stats: { bellatores: 40, oratores: 15, laboratores: 15 } });
    store.dispatch({ type: 'TRAIN', tutor: 'hedge_knight' });
    expect(store.getSnapshot().ui.pendingDialog?.beatId).toBe('knight/k2');
    const items = store.getSnapshot().state!.inventory.gambeson ?? 0;
    store.finishBeat();
    expect(store.getSnapshot().state!.inventory.gambeson).toBe(items + 1);
  });

  it('skips beats after the forced recovery rest, a collapse, or at the deadline', () => {
    const rest = loadBeats({ 'r.ink': ink(`-> END\n${knot('a', '# order: 10\n# activity: rest_home')}`) }).beats;
    const restStore = newStore(rest);
    restStore.devReplaceState({ ...restStore.getSnapshot().state!, pendingConvalescence: 'home_collapse' });
    restStore.dispatch({ type: 'REST', rest: 'rest_home' });
    expect(restStore.getSnapshot().ui.pendingDialog).toBeUndefined();

    const collapse = newStore();
    collapse.devReplaceState({ ...collapse.getSnapshot().state!, fatigue: 76 });
    collapse.dispatch({ type: 'TRAIN', tutor: 'hedge_knight' });
    expect(collapse.getSnapshot().lastEvents.some((e) => e.type === 'collapse')).toBe(true);
    expect(collapse.getSnapshot().ui.pendingDialog).toBeUndefined();

    const deadline = newStore();
    deadline.devReplaceState({ ...deadline.getSnapshot().state!, elapsedWeeks: config.calendar.totalWeeks - 1 });
    deadline.dispatch({ type: 'TRAIN', tutor: 'hedge_knight' });
    expect(deadline.getSnapshot().state!.phase).toBe('defeat');
    expect(deadline.getSnapshot().ui.pendingDialog).toBeUndefined();
  });

  it('Social talks spend no week and show no result panel', () => {
    const store = newStore();
    const before = store.getSnapshot().state!;
    expect(store.socialBeat()?.id).toBe('father/talk');
    store.startTalk();
    expect(store.getSnapshot().ui.pendingDialog).toEqual({ beatId: 'father/talk', activity: 'socialize' });
    store.finishBeat();
    const after = store.getSnapshot();
    expect(after.ui.pendingResult).toBeUndefined();
    expect(after.state!.elapsedWeeks).toBe(before.elapsedWeeks);
    expect(after.state!.rng).toEqual(before.rng);
    expect(after.state!.storyBeats).toEqual({ 'father/talk': 0 });
    expect(store.socialBeat()).toBeUndefined();
    expect(getAvailableActions(after.state!, config)).toEqual(getAvailableActions(before, config));
  });

  it('offers no Social talk during the forced recovery week', () => {
    const store = newStore();
    store.devReplaceState({ ...store.getSnapshot().state!, pendingConvalescence: 'home_collapse' });
    expect(store.socialBeat()).toBeUndefined();
    store.startTalk();
    expect(store.getSnapshot().ui.pendingDialog).toBeUndefined();
  });

  it('a reload mid-scene leaves the beat unplayed', () => {
    const store = newStore();
    store.dispatch({ type: 'TRAIN', tutor: 'hedge_knight' });
    expect(store.getSnapshot().ui.pendingDialog).toBeDefined();
    store.quitToTitle();
    expect(store.load('auto')).toBe(true);
    const snap = store.getSnapshot();
    expect(snap.ui.pendingDialog).toBeUndefined();
    expect(snap.state!.storyBeats).toBeUndefined();
    store.dispatch({ type: 'TRAIN', tutor: 'hedge_knight' });
    expect(store.getSnapshot().ui.pendingDialog?.beatId).toBe('knight/k1');
  });
});
