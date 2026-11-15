/// <reference types="vite/client" />
/// <reference path="../ui/ink.d.ts" />
import { describe, expect, it } from 'vitest';
import { Story } from 'inkjs';
import { Compiler } from 'inkjs/full';
import sample from './fixtures/sample.ink';
import { openScene } from '../ui/engine/dialog.js';
import { STORY } from '../ui/text/stories.js';
import { inkPlugin } from '../../scripts/vite-plugin-ink.js';

const inputs = { scion: 'Elaine', player: 'Aldous', bellatores: 35, oratores: 20, laboratores: 15, fatigue: 70, melancholy: 10 };
describe('Ink dialog cursor', () => {
  it('compiles real content, inserts names, and parses speech, thoughts, narration and tags', () => {
    const cursor = openScene(new Story(sample), 'sample_meeting', inputs);
    expect(cursor.next()).toEqual({ kind: 'line', style: 'speech', speaker: 'hedge_knight',
      text: 'A steady hand, Elaine. Your guardian Aldous would be proud.', bg: 'school', left: 'scion' });
    expect(cursor.next()).toMatchObject({ style: 'thought', speaker: 'scion', text: '(He makes it sound so easy.)' });
    expect(cursor.next()).toEqual({ kind: 'line', style: 'narration', text: 'The courtyard falls silent.' });
    expect(cursor.next()).toMatchObject({ speaker: 'squire', right: 'squire' });
    expect(cursor.next()).toEqual({ kind: 'choice', options: [
      { index: 0, text: 'Accept the challenge' }, { index: 1, text: 'Ask for advice' },
    ] });
    expect(cursor.choose(1)).toMatchObject({ speaker: 'scion', text: 'Show me how you hold your guard first.' });
    expect(cursor.next()).toMatchObject({ bg: 'job', right: 'hedge_knight' });
    expect(cursor.next()).toEqual({ kind: 'end' });
  });
  it('both choices rejoin, and reopening resets choices and inputs', () => {
    const story = new Story(sample);
    for (const index of [0, 1]) {
      const cursor = openScene(story, 'sample_meeting', inputs);
      for (let i = 0; i < 5; i++) cursor.next();
      expect(cursor.choose(index).kind).toBe('line');
      expect(cursor.next()).toMatchObject({ speaker: 'hedge_knight' });
      expect(cursor.next()).toEqual({ kind: 'end' });
    }
    expect(openScene(story, 'sample_meeting', { ...inputs, scion: 'Rose' }).next()).toMatchObject({ text: expect.stringContaining('Rose') });
  });
  it('treats unknown speakers as narration and applies input stats', () => {
    const story = new Compiler(`VAR scion = "Joan"
VAR player = "Gerald"
VAR bellatores = 15
VAR oratores = 15
VAR laboratores = 15
VAR fatigue = 0
VAR melancholy = 0
-> END
=== test ===
stranger: {bellatores >= 30:Strong.|Weak.}
{fatigue >= 60:Tired.|Fresh.} {melancholy >= 60:Sad.|Cheerful.}
Burdens: {fatigue}, {melancholy}.
-> END`).Compile();
    const cursor = openScene(story, 'test', inputs);
    expect(cursor.next()).toEqual({ kind: 'line', style: 'narration', text: 'stranger: Strong.' });
    expect(cursor.next()).toEqual({ kind: 'line', style: 'narration', text: 'Tired. Cheerful.' });
    expect(cursor.next()).toMatchObject({ text: 'Burdens: 70, 10.' });
    expect(() => cursor.choose(0)).toThrow('Invalid dialog choice');
    const reopened = openScene(story, 'test', { ...inputs, fatigue: 10, melancholy: 85 });
    reopened.next();
    expect(reopened.next()).toMatchObject({ text: 'Fresh. Sad.' });
    expect(reopened.next()).toMatchObject({ text: 'Burdens: 10, 85.' });
  });
  it('every shipped beat opens with the full set of inputs', () => {
    for (const beat of STORY.beats) {
      expect(() => openScene(new Story(beat.json), beat.knot, inputs).next(), beat.id).not.toThrow();
    }
  });
  it('fails compilation with the source filename and line', () => {
    const plugin = inkPlugin();
    const transform = plugin.transform as (source: string, id: string) => unknown;
    expect(() => transform('-> missing_knot', '/story/broken.ink')).toThrow(/broken\.ink:.*line 1/s);
    expect(() => transform('INCLUDE other.ink', '/story/include.ink')).toThrow('INCLUDE is not supported');
  });
});
