/// <reference types="vite/client" />
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { Story } from 'inkjs';
import novicePortrait from '../../assets/portraits/portrait_novice_right_360x540.webp';
import { BACKGROUND } from '../ui/assets.js';
import { openScene, type DialogStep } from '../ui/engine/dialog.js';
import { CHARACTERS, characterName } from '../ui/text/characters.js';
import { STORY } from '../ui/text/stories.js';

const inputs = { scion: 'Elaine', player: 'Aldous', bellatores: 0, oratores: 0, laboratores: 0, fatigue: 0, melancholy: 0 };
const sources = Object.fromEntries(['alley', 'cloister', 'father', 'knight', 'stables'].map(thread =>
  [thread, readFileSync(new URL(`../../content/story/${thread}.ink`, import.meta.url), 'utf8')]));

it('contains every drafted scene and resolves named characters to their portraits', () => {
  for (const [thread, count] of Object.entries({ alley: 6, cloister: 6, father: 6, knight: 6, stables: 3 })) {
    expect(STORY.beats.filter(beat => beat.thread === thread)).toHaveLength(count);
  }
  for (const [id, name] of Object.entries({ player: 'Aldous', scion: 'Elaine', squire: 'Sebastian',
    hedge_knight: 'Bedivere', watch_captain: 'Baldwin', hermit: 'Diogenes', deacon: 'Jerome',
    novice: 'Serena', smuggler: 'Hancock', urchin: 'Nicole', alewife: 'Helga', stablemaster: 'Olaf' })) {
    expect(characterName(id, inputs)).toBe(name);
    expect(CHARACTERS[id]?.portrait).toBeTruthy();
  }
  expect(CHARACTERS.novice?.portrait).toBe(novicePortrait);
});

it('keeps Olaf’s intended metheglin reward', () => {
  expect(STORY.beats.find(beat => beat.id === 'stables/stables_3')?.rewards)
    .toEqual([{ kind: 'item', id: 'metheglin' }]);
});

describe.each(STORY.beats)('$id playback', beat => {
  for (const high of [false, true]) for (const choice of [0, 1]) {
    it(`finishes choice ${choice} with ${high ? 'high' : 'low'} stats and valid speakers and tags`, () => {
      const values = { ...inputs, ...Object.fromEntries(['bellatores', 'oratores', 'laboratores', 'fatigue', 'melancholy']
        .map(stat => [stat, high ? 100 : 0])) };
      const cursor = openScene(new Story(beat.json), beat.knot, values);
      const lines: Extract<DialogStep, { kind: 'line' }>[] = [];
      let step = cursor.next();
      while (step.kind === 'line') { lines.push(step); step = cursor.next(); }
      expect(step).toMatchObject({ kind: 'choice', options: [{ index: 0 }, { index: 1 }] });
      step = cursor.choose(choice);
      while (step.kind === 'line') { lines.push(step); step = cursor.next(); }
      expect(step.kind).toBe('end');
      for (const line of lines) {
        // An unregistered speaker silently renders as narration in the engine.
        expect(line.text).not.toMatch(/^[a-z_]+:/);
        for (const id of [line.speaker, line.left, line.right]) {
          if (id) expect(Object.hasOwn(CHARACTERS, id), id).toBe(true);
        }
        if (line.bg) expect(Object.hasOwn(BACKGROUND, line.bg), line.bg).toBe(true);
      }
      const section = sources[beat.thread]!.split(`=== ${beat.knot} ===`)[1]!.split(/^===/m)[0]!;
      const conditional = /\{[^\n]+:\n([\s\S]*?)\n- else:\n([\s\S]*?)\n\}/.exec(section)!;
      expect(conditional).not.toBeNull();
      for (const [index, branch] of [conditional[1]!, conditional[2]!].entries()) {
        const expected = branch.trim().split('\n').map(line => line.trim()
          .replace(/^[a-z_]+:\s*/, '').replace(/\s+#.*$/, ''));
        for (const text of expected) expect(lines.some(line => line.text === text), text).toBe(high === (index === 0));
      }
    });
  }
});
