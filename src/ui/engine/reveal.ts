/**
 * Letter-by-letter text for the intro (docs/archive/ui-playtest-plan.md §5 I2). Pure:
 * the component drives `tick` from a timer and `press` from click/Space/Enter.
 */

export interface Reveal {
  /** Line being shown. */
  index: number;
  /** Characters of that line revealed so far. */
  shown: number;
}

/** First line; fully revealed at once when motion is reduced. */
export function revealStart(lines: readonly string[], reducedMotion: boolean): Reveal {
  return { index: 0, shown: reducedMotion ? (lines[0]?.length ?? 0) : 0 };
}

export function isLineComplete(r: Reveal, lines: readonly string[]): boolean {
  return r.shown >= (lines[r.index]?.length ?? 0);
}

/** Reveals `chars` more characters of the current line (never past its end). */
export function revealTick(r: Reveal, lines: readonly string[], chars = 1): Reveal {
  const length = lines[r.index]?.length ?? 0;
  return r.shown >= length ? r : { ...r, shown: Math.min(length, r.shown + chars) };
}

/**
 * A press first completes the current line; on a complete line it moves to
 * the next one (revealed from the start, or whole when motion is reduced).
 * Returns 'done' after the last line.
 */
export function revealPress(r: Reveal, lines: readonly string[], reducedMotion: boolean): Reveal | 'done' {
  if (!isLineComplete(r, lines)) return { ...r, shown: lines[r.index]?.length ?? 0 };
  const index = r.index + 1;
  if (index >= lines.length) return 'done';
  return { index, shown: reducedMotion ? lines[index]!.length : 0 };
}
