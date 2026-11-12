/**
 * Condition mechanics: derived burden ceilings, Purse Protection, and the
 * integer clamp/floor helpers every rules module uses to mutate stats,
 * burdens and Coin (tech doc §4; implementation task A2).
 *
 * Fatigue and Melancholy are accumulated burdens that start at 0. Reaching
 * the current derived ceiling is a collapse. Ceilings are always recomputed
 * from current stats and never stored, so a stat drop can push the ceiling
 * below an existing burden and cause a collapse.
 */

import type { RulesConfig } from './config.js';
import type { CampaignState, Estate, GameEvent } from './types.js';

/** Ceiling formula constants (tech §4, confirmed): clamp(floor(75 + (stat - 15) / 2), 75, 100). */
export const CEILING_BASE = 75;
export const CEILING_REFERENCE_STAT = 15;
export const CEILING_MAX = 100;

export type Burden = 'fatigue' | 'melancholy';
export type CollapseCause = Extract<GameEvent, { type: 'collapse' }>['cause'];

/** The slice of state the condition helpers read. */
export type ConditionState = Pick<CampaignState, 'stats' | 'fatigue' | 'melancholy'>;

function assertInteger(name: string, value: number): void {
  if (!Number.isSafeInteger(value)) {
    throw new RangeError(`${name} must be a safe integer, got ${value}`);
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Burden ceiling governed by a stat. Floors half points, then clamps to 75..100. */
export function ceilingForStat(stat: number): number {
  assertInteger('stat', stat);
  return clamp(CEILING_BASE + Math.floor((stat - CEILING_REFERENCE_STAT) / 2), CEILING_BASE, CEILING_MAX);
}

/** Fatigue ceiling, governed by Bellatores. */
export function fatigueCeiling(stats: Readonly<Record<Estate, number>>): number {
  return ceilingForStat(stats.bellatores);
}

/** Melancholy ceiling, governed by Oratores. */
export function melancholyCeiling(stats: Readonly<Record<Estate, number>>): number {
  return ceilingForStat(stats.oratores);
}

/**
 * Share of carried Coin kept on wipeout, as an integer percentage:
 * floor(laboratores / 200) as a fraction, i.e. floor(laboratores / 2) percent.
 */
export function purseProtectionPct(stats: Readonly<Record<Estate, number>>): number {
  assertInteger('laboratores', stats.laboratores);
  return Math.floor(Math.max(0, stats.laboratores) / 2);
}

/** Clamp a stat to the configured range (default 0..100). */
export function clampStat(value: number, config: RulesConfig): number {
  assertInteger('stat', value);
  return clamp(value, config.startingState.statMin, config.startingState.statMax);
}

/** Clamp treasury Coin to the configured range (default 0..9999). */
export function clampTreasury(value: number, config: RulesConfig): number {
  assertInteger('treasury', value);
  return clamp(value, 0, config.startingState.treasuryMax);
}

/**
 * Add a signed integer delta to a burden; the result never goes below 0.
 * Burdens have no upper clamp: exceeding the ceiling is a collapse, not an overflow.
 */
export function addBurden(value: number, delta: number): number {
  assertInteger('burden', value);
  assertInteger('delta', delta);
  return Math.max(0, value + delta);
}

/**
 * Apply a decrement given as a non-negative magnitude: floor the magnitude
 * first, then subtract, flooring the result at 0 (tech §5 step 4).
 */
export function subtractMagnitude(value: number, magnitude: number): number {
  assertInteger('value', value);
  if (!Number.isFinite(magnitude) || magnitude < 0) {
    throw new RangeError(`magnitude must be a finite non-negative number, got ${magnitude}`);
  }
  return Math.max(0, value - Math.floor(magnitude));
}

/** Which burden(s) are at or above their current ceiling, or null if none. */
export function collapseCause(state: ConditionState): CollapseCause | null {
  const fatigue = state.fatigue >= fatigueCeiling(state.stats);
  const melancholy = state.melancholy >= melancholyCeiling(state.stats);
  if (fatigue && melancholy) return 'both';
  if (fatigue) return 'fatigue';
  if (melancholy) return 'melancholy';
  return null;
}

/** True when either burden has reached its current ceiling. */
export function isCollapsed(state: ConditionState): boolean {
  return collapseCause(state) !== null;
}
