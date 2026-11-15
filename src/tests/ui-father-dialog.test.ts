/// <reference types="vite/client" />
import { describe, expect, it } from 'vitest';
import { Story } from 'inkjs';
import playerPortrait from '../../assets/portraits/portrait_player_right_360x540.webp';
import { openScene, type DialogInputs, type DialogStep } from '../ui/engine/dialog.js';
import { CHARACTERS, characterName } from '../ui/text/characters.js';
import { STORY } from '../ui/text/stories.js';

const inputs: DialogInputs = { scion: 'Elaine', player: 'Aldous', bellatores: 15, oratores: 15, laboratores: 15, fatigue: 0, melancholy: 0 };
const cases = [
  { knot: 'father_1', month: 1, stat: 'fatigue', threshold: 50,
    high: 'She looks exhausted', low: 'She is intensely focused' },
  { knot: 'father_2', month: 3, stat: 'melancholy', threshold: 40,
    high: 'I had the nightmare again.', low: 'I had a strange dream last night.' },
  { knot: 'father_3', month: 5, stat: 'oratores', threshold: 30,
    high: 'Diogenes is teaching me', low: 'Ser Bedivere is drilling me' },
  { knot: 'father_4', month: 7, stat: 'laboratores', threshold: 40,
    high: 'You hid the key well', low: 'You left the lockbox open' },
  { knot: 'father_5', month: 9, stat: 'melancholy', threshold: 60,
    high: 'The weight of the kingdom', low: 'The anger has faded' },
  { knot: 'father_6', month: 11, stat: 'bellatores', threshold: 50,
    high: 'She stands tall', low: 'She still looks so small' },
] as const;

it('uses the player portrait and input name for player and legacy father IDs', () => {
  for (const id of ['player', 'father']) {
    expect(CHARACTERS[id]?.portrait).toBe(playerPortrait);
    expect(characterName(id, inputs)).toBe('Aldous');
    expect(characterName(id, { ...inputs, player: 'Gerald' })).toBe('Gerald');
  }
});

describe.each(cases)('$knot', scene => {
  for (const high of [false, true]) for (const choice of [0, 1]) {
    it(`plays choice ${choice} with the ${high ? 'high' : 'low'} stat branch`, () => {
      const beat = STORY.beats.find(beat => beat.id === `father/${scene.knot}`)!;
      expect(beat).toMatchObject({ month: scene.month, activities: ['socialize'], left: 'player', bg: 'home' });
      const cursor = openScene(new Story(beat.json), beat.knot,
        { ...inputs, [scene.stat]: scene.threshold + (high ? 1 : 0) });
      const lines: Extract<DialogStep, { kind: 'line' }>[] = [];
      let step = cursor.next();
      while (step.kind === 'line') { lines.push(step); step = cursor.next(); }
      expect(step).toMatchObject({ kind: 'choice', options: [{ index: 0 }, { index: 1 }] });
      step = cursor.choose(choice);
      while (step.kind === 'line') { lines.push(step); step = cursor.next(); }
      expect(step.kind).toBe('end');
      expect(lines.some(line => line.text.startsWith(scene.high))).toBe(high);
      expect(lines.some(line => line.text.startsWith(scene.low))).toBe(!high);
      expect(lines.some(line => line.speaker === 'player' && line.style === 'thought')).toBe(true);
      expect(lines.filter(line => line.speaker).every(line => ['player', 'scion'].includes(line.speaker!))).toBe(true);
      if (scene.knot === 'father_2') {
        expect(lines.some(line => line.text.startsWith('(If I validate it'))).toBe(choice === 0);
        expect(lines.some(line => line.text.startsWith('(I promised the Queen'))).toBe(choice === 1);
      }
      if (scene.knot === 'father_4') {
        expect(lines).toContainEqual(expect.objectContaining({ speaker: 'player', style: 'thought', text: '(The day I have dreaded for fourteen years is here.)' }));
        expect(lines).toContainEqual(expect.objectContaining({ speaker: 'player', style: 'speech', text: "You are the true heir to the throne. You are the Queen's daughter." }));
      }
    });
  }
});
