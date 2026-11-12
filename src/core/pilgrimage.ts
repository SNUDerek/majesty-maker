/** Pure encounter generation (B3); segment transitions are implemented by C2. */
import type { RulesConfig } from './config.js';
import { drawWeighted, type Draw, type RngState } from './rng.js';
import type { Estate } from './types.js';

// Fixed order makes seeded draws independent of JSON property insertion order.
const THREAT_ORDER = ['bellatores', 'oratores', 'laboratores'] as const satisfies readonly Estate[];

/**
 * Draw with replacement from relative integer weights. Pass rng.encounters and
 * store the returned state in that stream. This has no player-build input and
 * never adjusts the distribution to counter the player. Zero weights exclude
 * an Estate; even a single possible threat consumes a draw.
 */
export function drawThreat(
  state: RngState,
  distribution: RulesConfig['encounters']['distribution'],
): Draw<Estate> {
  return drawWeighted(state, THREAT_ORDER.map((estate) => [estate, distribution[estate]] as const));
}
