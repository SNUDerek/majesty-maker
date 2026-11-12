/** Pure encounter generation (B3); segment transitions are implemented by C2. */
import type { RulesConfig } from './config.js';
import { rollInt, type Draw, type RngState } from './rng.js';
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
  const weights = THREAT_ORDER.map((estate) => distribution[estate]);
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  if (
    weights.some((weight) => !Number.isSafeInteger(weight) || weight < 0) ||
    !Number.isSafeInteger(total) || total <= 0 || total > 2 ** 32
  ) {
    throw new RangeError('Threat weights must be non-negative integers with a total in [1, 2^32]');
  }

  const draw = rollInt(state, 1, total);
  let remaining = draw.value;
  for (const estate of THREAT_ORDER) {
    remaining -= distribution[estate];
    if (remaining <= 0) return { value: estate, state: draw.state };
  }
  throw new RangeError('Invalid threat distribution');
}
