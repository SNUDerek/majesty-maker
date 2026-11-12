/** D3 / tech §13: 1,000 full campaigns, deterministic replay, and atomic invalid actions. */
import { describe, it } from 'vitest';
import { withOverrides } from '../../core/config.js';
import type { ZodiacSign } from '../../core/types.js';
import { DEFAULT_OPTIONS, defaultConfig, ENGINE_SUITES, requireEngine } from '../scenarios/harness.js';
import { replayCampaign, walkCampaign } from './walker.js';

const signs = [
  'aries', 'taurus', 'gemini', 'cancer', 'leo', 'virgo',
  'libra', 'scorpio', 'sagittarius', 'capricorn', 'aquarius', 'pisces',
] as const satisfies readonly ZodiacSign[];

// Baseline has no items or skipping. Exercise those C3 paths with an explicit test variant too.
const withItems = withOverrides(defaultConfig, {
  id: 'd3-items-and-skips',
  startingState: {
    startingInventory: Object.fromEntries(Object.keys(defaultConfig.items.catalog).map((id) => [id, 2])),
  },
  items: { acquisition: 'test_table' },
  astrology: { newMoon: { skipFee: 5 } },
});

// Same explicit readiness contract as D2. Once C2–C4 enable their flags, a
// missing/broken engine fails requireEngine() rather than silently skipping.
const ready = ENGINE_SUITES.pilgrimage && ENGINE_SUITES.items && ENGINE_SUITES.final;

describe.skipIf(!ready)('D3 full engine campaigns (requires C2–C4 readiness flags)', () => {
  it.each(Array.from({ length: 1000 }, (_, seed) => seed))('seed %i: invariants, replay, atomicity', (seed) => {
    const config = Math.floor(seed / signs.length) % 2 === 0 ? defaultConfig : withItems;
    const options = { ...DEFAULT_OPTIONS, seed, birthSign: signs[seed % signs.length]! };
    const engine = requireEngine();
    const trace = walkCampaign(engine, options, config);
    replayCampaign(engine, trace, config);
  });
});
