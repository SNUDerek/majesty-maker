/** D2: a present C1 engine must satisfy its home contract (§5). */
import { describe, expect, it } from 'vitest';
import { defaultConfig, DEFAULT_OPTIONS, engine, scenario } from './harness.js';

describe.runIf(engine !== null)('D2 engine readiness (§5)', () => {
  it('REST at home spends one week', () => {
    const result = scenario({}, [{ type: 'REST', rest: 'rest_home' }]);
    expect(result.error).toBeUndefined();
    expect(result.final.elapsedWeeks).toBe(1);
    expect(engine!.getAvailableActions(engine!.createCampaign(DEFAULT_OPTIONS, defaultConfig), defaultConfig))
      .toEqual(expect.arrayContaining([expect.objectContaining({ type: 'REST', rest: 'rest_home' })]));
  });
});
