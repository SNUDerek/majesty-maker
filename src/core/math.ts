/** Integer-percentage arithmetic shared by the rules engine (T0.2 integer-math rule). */

/**
 * Multiply `base` by each integer percentage (100 = x1.0) and floor exactly once.
 *
 * - `base` and every percentage must be integers; percentages must be >= 0.
 * - Pass magnitudes (non-negative bases) and apply the sign at the call site:
 *   flooring a negative product rounds toward -Infinity (A2 "floor the magnitude first").
 * - Throws if the intermediate product leaves the safe-integer range, so the
 *   result is never silently imprecise.
 */
export function applyIntegerPercent(base: number, ...percentages: number[]): number {
  if (!Number.isSafeInteger(base)) {
    throw new RangeError(`applyIntegerPercent: base must be a safe integer, got ${base}`);
  }
  let numerator = base;
  let denominator = 1;
  for (const percentage of percentages) {
    if (!Number.isSafeInteger(percentage) || percentage < 0) {
      throw new RangeError(
        `applyIntegerPercent: percentage must be a non-negative integer, got ${percentage}`,
      );
    }
    numerator *= percentage;
    denominator *= 100;
    if (!Number.isSafeInteger(numerator) || !Number.isSafeInteger(denominator)) {
      throw new RangeError('applyIntegerPercent: intermediate product exceeds safe-integer range');
    }
  }
  return Math.floor(numerator / denominator);
}
