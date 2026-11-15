/// <reference types="vite/client" />
import { expect, it } from 'vitest';
import { Story } from 'inkjs';
import { openScene } from '../ui/engine/dialog.js';
import { characterName } from '../ui/text/characters.js';
import { STORY } from '../ui/text/stories.js';

const inputs = { scion: 'Elaine', player: 'Aldous', bellatores: 15, oratores: 15, laboratores: 15, fatigue: 0, melancholy: 0 };

it('displays the Serena arc characters by their names', () => {
  expect(characterName('novice', inputs)).toBe('Serena');
  expect(characterName('deacon', inputs)).toBe('Jerome');
  expect(characterName('hermit', inputs)).toBe('Diogenes');
});

it('recognizes Jerome as the deacon in his introduction', () => {
  const beat = STORY.beats.find(beat => beat.id === 'cloister/cloister_1b')!;
  const cursor = openScene(new Story(beat.json), beat.knot, inputs);
  expect(cursor.next()).toMatchObject({ style: 'narration' });
  expect(cursor.next()).toMatchObject({ style: 'speech', speaker: 'deacon' });
});
