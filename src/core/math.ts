/** Integer-percentage arithmetic shared by the rules engine (T0.2 integer-math rule). */

/**
 * Multiply `base` by each integer percentage (100 = x1.0) and floor exactly once.
 *
 * - `base` and every percentage must be integers; percentages must be >= 0.
 * - Pass magnitudes (non-negative bases) and apply the sign at the call site:
 *   flooring a negative product rounds toward -Infinity (A2 "floor the magnitude first").
 * - Uses exact BigInt intermediates; throws only if the floored result leaves
 *   the safe-integer range.
 */
export function applyIntegerPercent(base: number, ...percentages: number[]): number {
  if (!Number.isSafeInteger(base)) {
    throw new RangeError(`applyIntegerPercent: base must be a safe integer, got ${base}`);
  }
  let numerator = BigInt(base);
  let denominator = 1n;
  for (const percentage of percentages) {
    if (!Number.isSafeInteger(percentage) || percentage < 0) {
      throw new RangeError(
        `applyIntegerPercent: percentage must be a non-negative integer, got ${percentage}`,
      );
    }
    numerator *= BigInt(percentage);
    denominator *= 100n;
  }
  // BigInt division truncates toward zero; preserve floor for negative bases.
  const floored = numerator / denominator - (numerator < 0n && numerator % denominator !== 0n ? 1n : 0n);
  const result = Number(floored);
  if (!Number.isSafeInteger(result)) {
    throw new RangeError('applyIntegerPercent: result exceeds safe-integer range');
  }
  return result;
}
