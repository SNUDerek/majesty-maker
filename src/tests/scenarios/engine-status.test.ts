/**
 * Guard for the D2 capability gates: once src/core/index.ts exists, the C1
 * home probe must pass, so the engine scenarios cannot stay skipped by accident.
 */
import { describe, expect, it } from 'vitest';
import { engine, hasHome } from './harness.js';

describe.runIf(engine)('D2 engine gates', () => {
  it('the C1 engine passes the home probe (REST at home spends one week)', () => {
    expect(hasHome).toBe(true);
  });
});
