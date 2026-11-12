/** Pure item hooks (B2). Slot ownership, consumption and rerolls are handled by C3. */
import type { ItemDefinition, RulesConfig } from './config.js';
import { subtractMagnitude } from './conditions.js';
import { rollInt, type Draw, type RngState } from './rng.js';
import { RuleError, type Estate, type PilgrimageStage } from './types.js';

export function getItem(itemId: string, config: RulesConfig): ItemDefinition {
  if (!Object.hasOwn(config.items.catalog, itemId)) {
    throw new RuleError('INVALID_ITEM', `Unknown item: ${itemId}`);
  }
  return config.items.catalog[itemId]!;
}

function equipment(itemId: string | undefined, config: RulesConfig): ItemDefinition | undefined {
  if (itemId === undefined) return undefined;
  const item = getItem(itemId, config);
  if (item.kind !== 'equipment') {
    throw new RuleError('INVALID_ITEM', `Item is not equipment: ${itemId}`);
  }
  return item;
}

export function probabilityBonus(
  equipmentId: string | undefined, threat: Estate, config: RulesConfig,
): number {
  const item = equipment(equipmentId, config);
  return item?.effect === 'success_bonus_vs_threat' && item.estate === threat ? item.amount : 0;
}

export interface PenaltyModifier {
  /** Subtract after lunar multiplication, flooring the resulting burden at zero. */
  fatigueReduction: number;
  /** Apply to the Coin penalty and floor once. Does not affect wipeout retention. */
  coinPenaltyPct: number;
}

export function penaltyModifier(
  equipmentId: string | undefined, approach: Estate, config: RulesConfig,
): PenaltyModifier {
  const item = equipment(equipmentId, config);
  return {
    fatigueReduction: item?.effect === 'reduce_failure_fatigue' && item.estate === approach ? item.amount : 0,
    coinPenaltyPct: item?.effect === 'coin_penalty_pct' && item.estate === approach ? item.amount : 100,
  };
}

export function canUseConsumable(itemId: string, stage: PilgrimageStage, config: RulesConfig): boolean {
  const item = getItem(itemId, config);
  if (item.kind !== 'consumable') return false;
  return item.effect === 'reroll_failed_check'
    ? stage === 'reroll_or_accept'
    : stage === 'continue_or_retreat' || stage === 'waystation_decision';
}

/** Actual burden deltas, clamped at zero; rerolls leave both burdens unchanged. */
export function consumableEffect(
  itemId: string,
  stage: PilgrimageStage,
  burdens: Readonly<{ fatigue: number; melancholy: number }>,
  config: RulesConfig,
): { fatigue: number; melancholy: number; reroll: boolean } {
  const item = getItem(itemId, config);
  if (item.kind !== 'consumable') {
    throw new RuleError('INVALID_ITEM', `Item is not a consumable: ${itemId}`);
  }
  if (!canUseConsumable(itemId, stage, config)) {
    throw new RuleError('INVALID_STAGE', `Cannot use ${itemId} at ${stage}`);
  }
  return {
    fatigue: item.effect === 'reduce_fatigue' ? subtractMagnitude(burdens.fatigue, item.amount) - burdens.fatigue : 0,
    melancholy: item.effect === 'reduce_melancholy' ? subtractMagnitude(burdens.melancholy, item.amount) - burdens.melancholy : 0,
    reroll: item.effect === 'reroll_failed_check',
  };
}

/** Fresh inventory for each campaign; scenario overrides work even with acquisition disabled. */
export function startingInventory(config: RulesConfig): Record<string, number> {
  return { ...config.startingState.startingInventory };
}

/** One test reward per explicit call. Disabled acquisition consumes no RNG. */
export function drawItemReward(state: RngState, config: RulesConfig): Draw<string | undefined> {
  if (config.items.acquisition === 'disabled') return { value: undefined, state };
  const entries = Object.entries(config.items.testRewardTable).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0);
  const total = entries.reduce((sum, [, weight]) => sum + weight, 0);
  const draw = rollInt(state, 1, total);
  let remaining = draw.value;
  for (const [itemId, weight] of entries) {
    remaining -= weight;
    if (remaining <= 0) return { value: itemId, state: draw.state };
  }
  throw new RangeError('Invalid test reward table');
}
