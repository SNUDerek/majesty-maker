/** Integer-percentage arithmetic shared by the rules engine (T0.2 integer-math rule). */

/**
 * Multiply `base` by each integer percentage (100 = x1.0) and floor exactly once.
 *
 * - `base` and every percentage must be integers; percentages must be >= 0.
 * - Pass magnitudes (non-negative bases) and apply the sign at the call site:
 *   flooring a negative product rounds toward -Infinity (A2 "floor the magnitude first").
 * - Exact for any inputs: uses number arithmetic while every intermediate is a
 *   safe integer, and BigInt otherwise; throws only if the floored result
 *   leaves the safe-integer range.
 */
export function applyIntegerPercent(base: number, ...percentages: number[]): number {
  if (!Number.isSafeInteger(base)) {
    throw new RangeError(`applyIntegerPercent: base must be a safe integer, got ${base}`);
  }
  for (const percentage of percentages) {
    if (!Number.isSafeInteger(percentage) || percentage < 0) {
      throw new RangeError(
        `applyIntegerPercent: percentage must be a non-negative integer, got ${percentage}`,
      );
    }
  }

  // Fast path (the common case): exact while the product and denominator stay
  // safe integers. Math.floor(n / d) is exact for safe integers because the
  // rounding error of n / d is smaller than 1 / d, the gap to the next integer.
  let fastNumerator = base;
  let fastDenominator = 1;
  let safe = true;
  for (const percentage of percentages) {
    fastNumerator *= percentage;
    fastDenominator *= 100;
    if (!Number.isSafeInteger(fastNumerator) || !Number.isSafeInteger(fastDenominator)) {
      safe = false;
      break;
    }
  }
  // `+ 0` normalizes -0 (a negative base times a 0% factor) to 0, matching the BigInt path.
  if (safe) return Math.floor(fastNumerator / fastDenominator) + 0;

  let numerator = BigInt(base);
  let denominator = 1n;
  for (const percentage of percentages) {
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
