import { describe, expect, it } from 'vitest';
import { createCampaign, type CampaignState, type GameEvent, type JobId, type TutorId } from '../core/index.js';
import { FLAVOR, fillNames, pickLine, resultFlavor, thoughtLine, type FlavorContent } from '../ui/engine/flavor.js';
import { GameStore } from '../ui/engine/store.js';
import { loadShippedConfig } from './support/config.js';

const config = loadShippedConfig();
const fresh = (seed = 1234): CampaignState => createCampaign({
  seed, birthSign: 'aries', playerName: { first: 'Aldous', last: 'Wyke' }, scionName: 'Elaine',
}, config);

const TUTORS: TutorId[] = ['hedge_knight', 'hermit', 'smuggler'];
const JOBS: JobId[] = ['stables', 'alehouse', 'village_watch', 'scriptorium'];

describe('content/flavor.json', () => {
  it('has the minimum line counts', () => {
    for (const tutor of TUTORS) expect(FLAVOR.tutor[tutor].length, tutor).toBeGreaterThanOrEqual(3);
    for (const job of JOBS) {
      expect(FLAVOR.job[job].success.length, `${job} success`).toBeGreaterThanOrEqual(4);
      // Stables never fails, so it needs no failure lines.
      if (job !== 'stables') expect(FLAVOR.job[job].failure.length, `${job} failure`).toBeGreaterThanOrEqual(4);
    }
    expect(FLAVOR.thought.idle.length).toBeGreaterThanOrEqual(1);
    expect(FLAVOR.thought.talk_ready.length).toBeGreaterThanOrEqual(1);
  });

  it('only uses real activity ids and known placeholders', () => {
    expect(Object.keys(FLAVOR.tutor).sort()).toEqual([...TUTORS].sort());
    expect(Object.keys(FLAVOR.job).sort()).toEqual([...JOBS].sort());
    const all = [
      ...Object.values(FLAVOR.tutor).flat(),
      ...Object.values(FLAVOR.job).flatMap((j) => [...j.success, ...j.failure]),
      ...Object.values(FLAVOR.thought).flat(),
    ];
    for (const line of all) {
      expect(line.trim(), 'empty line').not.toBe('');
      for (const [placeholder] of line.matchAll(/\{[^}]*\}/g)) expect(['{scion}', '{player}'], line).toContain(placeholder);
    }
  });
});

describe('pickLine', () => {
  it('is deterministic for a key and covers the list across keys', () => {
    const lines = ['a', 'b', 'c'];
    expect(pickLine(lines, '1:5:thought')).toBe(pickLine(lines, '1:5:thought'));
    const seen = new Set(Array.from({ length: 50 }, (_, week) => pickLine(lines, `1:${week}:thought`)));
    expect(seen).toEqual(new Set(lines));
    expect(pickLine([], 'x')).toBeUndefined();
  });

  it('fills in names', () => {
    expect(fillNames('{scion} and {player}; {scion}.', fresh())).toBe('Elaine and Aldous; Elaine.');
  });
});

describe('resultFlavor', () => {
  const content: FlavorContent = {
    tutor: { hedge_knight: ['knight {scion}'], hermit: [], smuggler: [] },
    job: {
      stables: { success: [], failure: [] },
      alehouse: { success: ['ale won'], failure: ['ale lost'] },
      village_watch: { success: [], failure: [] },
      scriptorium: { success: [], failure: [] },
    },
    thought: { idle: ['idle'], talk_ready: ['ready'] },
  };
  const resolved = (success: boolean): GameEvent[] => [{
    week: 0, type: 'job_resolved', job: 'alehouse', success, automatic: false, probability: 50, roll: 10,
  } as GameEvent];

  it('picks success or failure lines from the job_resolved event', () => {
    const state = fresh();
    expect(resultFlavor(state, { type: 'WORK', job: 'alehouse' }, resolved(true), content)).toBe('ale won');
    expect(resultFlavor(state, { type: 'WORK', job: 'alehouse' }, resolved(false), content)).toBe('ale lost');
    expect(resultFlavor(state, { type: 'WORK', job: 'alehouse' }, [], content)).toBeUndefined();
  });

  it('uses tutor lines for TRAIN and nothing for other actions', () => {
    const state = fresh();
    expect(resultFlavor(state, { type: 'TRAIN', tutor: 'hedge_knight' }, [], content)).toBe('knight Elaine');
    expect(resultFlavor(state, { type: 'TRAIN', tutor: 'hermit' }, [], content)).toBeUndefined();
    expect(resultFlavor(state, { type: 'REST', rest: 'rest_home' }, [], content)).toBeUndefined();
  });
});

describe('flavor in the store', () => {
  it('adds flavor to tutor and job results without touching the RNG streams', () => {
    const store = new GameStore(config, null);
    store.newGame({ seed: 77, birthSign: 'aries', playerName: { first: 'Aldous', last: 'Wyke' }, scionName: 'Elaine' });
    const before = store.getSnapshot().state!;
    store.dispatch({ type: 'TRAIN', tutor: 'hermit' });
    const after = store.getSnapshot();
    expect(after.ui.pendingResult?.flavor).toBe(resultFlavor(before, { type: 'TRAIN', tutor: 'hermit' }, after.lastEvents));
    expect(FLAVOR.tutor.hermit.map((l) => fillNames(l, before))).toContain(after.ui.pendingResult?.flavor);

    store.dismissResult();
    store.dispatch({ type: 'WORK', job: 'stables' });
    const work = store.getSnapshot();
    expect(FLAVOR.job.stables.success.map((l) => fillNames(l, before))).toContain(work.ui.pendingResult?.flavor);

    const rng = { ...work.state!.rng };
    resultFlavor(work.state!, { type: 'WORK', job: 'stables' }, work.lastEvents);
    thoughtLine(work.state!);
    expect(work.state!.rng).toEqual(rng);
  });

  it('gives the same thought for the same week and seed', () => {
    expect(thoughtLine(fresh())).toBe(thoughtLine(fresh()));
    expect(FLAVOR.thought.idle).toContain(thoughtLine(fresh()));
    expect(FLAVOR.thought.talk_ready).toContain(thoughtLine(fresh(), 'talk_ready'));
  });
});
