/**
 * Seeded, pure random number generation for the rules engine.
 *
 * Every function takes an explicit uint32 state and returns the drawn value
 * together with the next state. Nothing holds hidden state, so a campaign is
 * fully reproducible from its stored RNG state.
 *
 * Generator: Mulberry32 (Tommy Ettinger, public domain).
 * Seed derivation: splitmix32 (32-bit variant of Steele/Lea/Flood's SplitMix).
 *
 * Decision (T0.4): randomness is split into named substreams (`jobs`,
 * `encounters`, `rewards`), each with its own uint32 state, all derived from
 * the master seed by splitmix32. A policy that consumes extra draws on one
 * stream therefore does not shift the draws on the others, which keeps
 * paired-seed comparisons across policies meaningful (tech doc §9).
 */

/** A uint32 generator state. */
export type RngState = number;

/** The result of a draw: the value and the generator state after it. */
export interface Draw<T> {
  readonly value: T;
  readonly state: RngState;
}

export const RNG_STREAM_NAMES = ['jobs', 'encounters', 'rewards'] as const;

export type RngStreamName = (typeof RNG_STREAM_NAMES)[number];

/** Independent generator state per named substream. */
export type RngStreams = Readonly<Record<RngStreamName, RngState>>;

export const UINT32_RANGE = 0x1_0000_0000;

function toUint32(seed: number): RngState {
  if (!Number.isSafeInteger(seed)) {
    throw new RangeError(`RNG seed/state must be a safe integer, got ${seed}`);
  }
  return seed >>> 0;
}

/** Mulberry32: advances the state and returns a uniform uint32. */
export function next(state: RngState): Draw<number> {
  const nextState = (toUint32(state) + 0x6d2b79f5) >>> 0;
  let t = nextState;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return { value: (t ^ (t >>> 14)) >>> 0, state: nextState };
}

/** splitmix32: used only to derive well-mixed substream seeds from a master seed. */
export function splitmix32(state: RngState): Draw<number> {
  const nextState = (toUint32(state) + 0x9e3779b9) >>> 0;
  let z = nextState;
  z = Math.imul(z ^ (z >>> 16), 0x21f0aaad);
  z = Math.imul(z ^ (z >>> 15), 0x735a2d97);
  return { value: (z ^ (z >>> 15)) >>> 0, state: nextState };
}

/**
 * Uniform integer in [min, max] (inclusive), using rejection sampling so that
 * no outcome is favoured by modulo bias.
 */
export function rollInt(state: RngState, min: number, max: number): Draw<number> {
  if (!Number.isSafeInteger(min) || !Number.isSafeInteger(max) || min > max) {
    throw new RangeError(`rollInt needs integers with min <= max, got [${min}, ${max}]`);
  }
  const range = max - min + 1;
  if (range > UINT32_RANGE) {
    throw new RangeError(`rollInt range must not exceed 2^32, got ${range}`);
  }

  // Largest multiple of `range` that fits in uint32; draws at or above it are rejected.
  const limit = UINT32_RANGE - (UINT32_RANGE % range);
  let current = state;
  for (;;) {
    const draw = next(current);
    current = draw.state;
    if (draw.value < limit) {
      return { value: min + (draw.value % range), state: current };
    }
  }
}

export function d4(state: RngState): Draw<number> {
  return rollInt(state, 1, 4);
}

export function d10(state: RngState): Draw<number> {
  return rollInt(state, 1, 10);
}

export function d100(state: RngState): Draw<number> {
  return rollInt(state, 1, 100);
}

/** Uniformly picks one element. Throws on an empty array. */
export function pick<T>(state: RngState, items: readonly T[]): Draw<T> {
  if (items.length === 0) {
    throw new RangeError('pick needs a non-empty array');
  }
  const index = rollInt(state, 0, items.length - 1);
  return { value: items[index.value] as T, state: index.state };
}

/**
 * Derives every substream's initial state from the master seed. Streams are
 * derived in the fixed order of RNG_STREAM_NAMES; append new names to the end
 * so existing streams keep their seeds.
 */
export function createRngStreams(masterSeed: number): RngStreams {
  let state = toUint32(masterSeed);
  const streams: Partial<Record<RngStreamName, RngState>> = {};
  for (const name of RNG_STREAM_NAMES) {
    const derived = splitmix32(state);
    state = derived.state;
    streams[name] = derived.value;
  }
  return streams as RngStreams;
}

/**
 * Runs a draw function on one named substream and returns the value with the
 * updated set of streams. Other streams are left untouched.
 */
export function drawFrom<T>(
  streams: RngStreams,
  name: RngStreamName,
  draw: (state: RngState) => Draw<T>,
): { readonly value: T; readonly streams: RngStreams } {
  const result = draw(streams[name]);
  return { value: result.value, streams: { ...streams, [name]: result.state } };
}

/** Draw from ordered relative weights; zero weights exclude entries. Always consumes a draw. */
export function drawWeighted<T>(
  state: RngState,
  entries: readonly (readonly [T, number])[],
): Draw<T> {
  const total = entries.reduce((sum, [, weight]) => sum + weight, 0);
  if (entries.some(([, weight]) => !Number.isSafeInteger(weight) || weight < 0) ||
      !Number.isSafeInteger(total) || total <= 0 || total > UINT32_RANGE) {
    throw new RangeError('Weights must be non-negative integers with a total in [1, 2^32]');
  }
  const draw = rollInt(state, 1, total);
  let remaining = draw.value;
  for (const [value, weight] of entries) {
    remaining -= weight;
    if (remaining <= 0) return { value, state: draw.state };
  }
  throw new RangeError('Invalid weighted distribution');
}
