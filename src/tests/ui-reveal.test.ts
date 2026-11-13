import { describe, expect, it } from 'vitest';
import { isLineComplete, revealPress, revealStart, revealTick } from '../ui/engine/reveal.js';

const lines = ['Hello', 'Hi'];

describe('intro text reveal', () => {
  it('reveals letter by letter, never past the line end', () => {
    let r = revealStart(lines, false);
    expect(r).toEqual({ index: 0, shown: 0 });
    r = revealTick(r, lines);
    r = revealTick(r, lines, 2);
    expect(r.shown).toBe(3);
    expect(isLineComplete(r, lines)).toBe(false);
    r = revealTick(r, lines, 10);
    expect(r).toEqual({ index: 0, shown: 5 });
    expect(revealTick(r, lines)).toBe(r);
  });

  it('a press completes the line, the next press advances, then done', () => {
    let r = revealStart(lines, false);
    const completed = revealPress(r, lines, false);
    expect(completed).toEqual({ index: 0, shown: 5 });
    r = completed as typeof r;
    const next = revealPress(r, lines, false);
    expect(next).toEqual({ index: 1, shown: 0 });
    expect(revealPress({ index: 1, shown: 2 }, lines, false)).toBe('done');
  });

  it('shows whole lines when motion is reduced', () => {
    const r = revealStart(lines, true);
    expect(r).toEqual({ index: 0, shown: 5 });
    expect(revealPress(r, lines, true)).toEqual({ index: 1, shown: 2 });
  });
});
