/**
 * B1 encounter math (tech §7): matchups, success probability, failure penalties
 * and road bonuses. Pure functions; every number comes from the rules config.
 */
import type { RulesConfig } from './config.js';
import { getItem, penaltyModifier, probabilityBonus } from './items.js';
import { applyIntegerPercent } from './math.js';
import { type Estate, type LunarPhase } from './types.js';

export type Matchup = 'advantage' | 'neutral' | 'disadvantage';

/** The resource a failed approach costs (approach decides it, not the threat colour). */
export type PenaltyResource = 'fatigue' | 'melancholy' | 'coin';

export interface FailurePenalty {
  resource: PenaltyResource;
  /** Non-negative magnitude; the caller applies it as a burden gain or a carried-Coin loss. */
  amount: number;
  /** Trace tags, e.g. ['lunar:full', 'item:gambeson']. */
  sources: string[];
}

export interface FailurePenaltyInput {
  approach: Estate;
  lunar: LunarPhase;
  /** Equipped item id, if any. Only items tied to `approach` change the penalty. */
  equipmentId?: string;
  /**
   * Current Purse Protection percent (`getDerivedStats().purseProtectionPct`).
   * Used only for Laboratores failures when `failure.purseProtection.appliesToLabFailures`
   * is on (§9 Q2); ignored otherwise.
   */
  purseProtectionPct?: number;
}

export interface EncounterOddsInput {
  stat: number;
  approach: Estate;
  threat: Estate;
  lunar: LunarPhase;
  segmentIndex: number;
  isFinal: boolean;
  equipmentId?: string;
}

/** Every term of the pre-roll probability, for explanations and simulation diagnostics. */
export interface EncounterOdds {
  matchup: Matchup;
  multiplierPct: number;
  roadBonus: number;
  flatBonus: number;
  probability: number;
}

const PENALTY_RESOURCE: Readonly<Record<Estate, PenaltyResource>> = {
  bellatores: 'fatigue',
  oratores: 'melancholy',
  laboratores: 'coin',
};

/** Rock-paper-scissors result of `approach` against `threat`, from `encounters.beats`. */
export function matchup(approach: Estate, threat: Estate, config: RulesConfig): Matchup {
  if (approach === threat) return 'neutral';
  if (config.encounters.beats[approach] === threat) return 'advantage';
  if (config.encounters.beats[threat] === approach) return 'disadvantage';
  // Unreachable for a validated config (beats is a 3-cycle), but never guess.
  throw new RangeError(`encounters.beats does not relate ${approach} and ${threat}`);
}

/** Stat multiplier as an integer percent: 150 / 100 / 75, and the Full Moon value (200) for advantage. */
export function approachMultiplierPct(result: Matchup, lunar: LunarPhase, config: RulesConfig): number {
  if (result === 'advantage' && lunar === 'full') return config.astrology.fullMoon.advantageMultiplierPct;
  return config.encounters.matchupPct[result];
}

/**
 * `clamp(floor(stat * multPct / 100) + roadBonus + flatBonus, successMin, successMax)`.
 * Tech §7 floors the whole sum; the bonuses are integers, so the two forms agree.
 */
export function encounterProbability(
  stat: number,
  multiplierPct: number,
  roadBonus: number,
  flatBonus: number,
  config: RulesConfig,
): number {
  if (!Number.isSafeInteger(stat) || stat < 0) {
    throw new RangeError(`encounterProbability: stat must be a non-negative integer, got ${stat}`);
  }
  if (!Number.isSafeInteger(roadBonus) || !Number.isSafeInteger(flatBonus)) {
    throw new RangeError('encounterProbability: bonuses must be integers');
  }
  const { successMin, successMax } = config.encounters;
  const raw = applyIntegerPercent(stat, multiplierPct) + roadBonus + flatBonus;
  return Math.min(successMax, Math.max(successMin, raw));
}

/** Roll-under check: an integer roll in 1..100 succeeds iff it is at most the probability. */
export function isEncounterSuccess(probability: number, roll: number): boolean {
  if (!Number.isSafeInteger(probability) || probability < 0 || probability > 100) {
    throw new RangeError(`encounter probability must be an integer in [0, 100], got ${probability}`);
  }
  if (!Number.isSafeInteger(roll) || roll < 1 || roll > 100) {
    throw new RangeError(`encounter roll must be an integer in [1, 100], got ${roll}`);
  }
  return roll <= probability;
}

/**
 * Road bonus for a segment. Regular segments are `0..regularSegments-1`; the final
 * gauntlet is the segment after them, so `isFinal` requires `segmentIndex === regularSegments`.
 */
export function roadBonusFor(segmentIndex: number, isFinal: boolean, config: RulesConfig): number {
  const { regularSegments, roadBonus, finalRoadBonus } = config.route;
  if (isFinal) {
    if (segmentIndex !== regularSegments) {
      throw new RangeError(`final gauntlet is segment ${regularSegments}, got ${segmentIndex}`);
    }
    return finalRoadBonus;
  }
  const bonus = Number.isSafeInteger(segmentIndex) && segmentIndex >= 0 ? roadBonus[segmentIndex] : undefined;
  if (bonus === undefined) {
    throw new RangeError(`regular segment index must be an integer in [0, ${regularSegments - 1}], got ${segmentIndex}`);
  }
  return bonus;
}

/**
 * Flat success-probability points from equipment against `threat` (Saint's Relic:
 * +10 versus an Oratores threat). Points add to probability, not to the die (§9 Q10).
 */
export function equipmentProbabilityBonus(
  equipmentId: string | undefined,
  threat: Estate,
  config: RulesConfig,
): number {
  return probabilityBonus(equipmentId, threat, config);
}

/** Full pre-roll breakdown for one encounter. */
export function encounterOdds(input: EncounterOddsInput, config: RulesConfig): EncounterOdds {
  const result = matchup(input.approach, input.threat, config);
  const multiplierPct = approachMultiplierPct(result, input.lunar, config);
  const roadBonus = roadBonusFor(input.segmentIndex, input.isFinal, config);
  const flatBonus = equipmentProbabilityBonus(input.equipmentId, input.threat, config);
  return {
    matchup: result,
    multiplierPct,
    roadBonus,
    flatBonus,
    probability: encounterProbability(input.stat, multiplierPct, roadBonus, flatBonus, config),
  };
}

/**
 * Cost of a failed (non-wipeout) encounter.
 *
 * - Bellatores: Fatigue; Full Moon doubles it, **then** Gambeson subtracts its amount
 *   (15 x2 - 5 = 25; order is open, §9 Q6). Never below 0.
 * - Oratores: Melancholy; Full Moon doubles it.
 * - Laboratores: carried Coin; never affected by the moon. Weighted Coin (50%) and,
 *   when enabled, Purse Protection multiply together and are floored once (15 -> 7).
 */
export function failurePenalty(input: FailurePenaltyInput, config: RulesConfig): FailurePenalty {
  const { approach, lunar } = input;
  const resource = PENALTY_RESOURCE[approach];
  const sources: string[] = [];
  const base = config.encounters.failurePenalty;
  const modifier = penaltyModifier(input.equipmentId, approach, config);
  const item = input.equipmentId === undefined ? undefined : getItem(input.equipmentId, config);
  const itemApplies = item !== undefined && item.estate === approach;

  if (resource === 'coin') {
    const percents: number[] = [];
    if (itemApplies && item.effect === 'coin_penalty_pct') {
      percents.push(modifier.coinPenaltyPct);
      sources.push(`item:${input.equipmentId}`);
    }
    if (config.failure.purseProtection.appliesToLabFailures) {
      const protection = input.purseProtectionPct ?? 0;
      if (!Number.isSafeInteger(protection) || protection < 0 || protection > 100) {
        throw new RangeError(`purseProtectionPct must be an integer in [0, 100], got ${protection}`);
      }
      if (protection > 0) {
        percents.push(100 - protection);
        sources.push('purse_protection');
      }
    }
    return { resource, amount: applyIntegerPercent(base, ...percents), sources };
  }

  let amount = base;
  if (lunar === 'full') {
    amount = applyIntegerPercent(amount, config.astrology.fullMoon.pilgrimageBurdenPenaltyPct);
    sources.push('lunar:full');
  }
  if (itemApplies && item.effect === 'reduce_failure_fatigue' && resource === 'fatigue') {
    amount = Math.max(0, amount - modifier.fatigueReduction);
    sources.push(`item:${input.equipmentId}`);
  }
  return { resource, amount, sources };
}
