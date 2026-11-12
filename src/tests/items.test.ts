import { describe, expect, it } from 'vitest';
import { ConfigError, withOverrides } from '../core/config.js';
import {
  canUseConsumable, consumableEffect, drawItemReward, getItem,
  penaltyModifier, probabilityBonus, startingInventory,
} from '../core/items.js';
import { rollInt } from '../core/rng.js';
import { RuleError, type Estate, type PilgrimageStage } from '../core/types.js';
import { loadContentConfig } from './support/config.js';

const config = loadContentConfig();
const estates: Estate[] = ['bellatores', 'oratores', 'laboratores'];
const stages: PilgrimageStage[] = [
  'encounter_reveal', 'choose_approach', 'reroll_or_accept',
  'continue_or_retreat', 'waystation_decision',
];

describe('B2 item definitions and hooks', () => {
  it('loads all six catalog items', () => {
    expect(Object.keys(config.items.catalog)).toHaveLength(6);
    expect(getItem('theriac', config)).toMatchObject({ name: 'Theriac', amount: 30 });
  });

  it('rejects unknown IDs, including inherited object keys, with a typed error', () => {
    for (const id of ['missing', 'toString', '__proto__']) {
      for (const lookup of [
        () => getItem(id, config),
        () => probabilityBonus(id, 'oratores', config),
        () => penaltyModifier(id, 'bellatores', config),
        () => canUseConsumable(id, 'choose_approach', config),
      ]) {
        expect(lookup).toThrow(RuleError);
        expect(lookup).toThrow(expect.objectContaining({ code: 'INVALID_ITEM' }));
      }
    }
  });

  it('applies the Relic only against an Oratores threat', () => {
    expect(estates.map(threat => probabilityBonus('saints_relic', threat, config))).toEqual([0, 10, 0]);
    expect(probabilityBonus(undefined, 'oratores', config)).toBe(0);
    expect(probabilityBonus('gambeson', 'oratores', config)).toBe(0);
    expect(() => probabilityBonus('theriac', 'oratores', config)).toThrow(RuleError);
  });

  it('modifies only the matching approach penalty, with neutral defaults', () => {
    for (const approach of estates) {
      expect(penaltyModifier('gambeson', approach, config)).toEqual({
        fatigueReduction: approach === 'bellatores' ? 5 : 0, coinPenaltyPct: 100,
      });
      expect(penaltyModifier('weighted_coin', approach, config)).toEqual({
        fatigueReduction: 0, coinPenaltyPct: approach === 'laboratores' ? 50 : 100,
      });
      expect(penaltyModifier('saints_relic', approach, config)).toEqual({ fatigueReduction: 0, coinPenaltyPct: 100 });
    }
    expect(penaltyModifier(undefined, 'bellatores', config)).toEqual({ fatigueReduction: 0, coinPenaltyPct: 100 });
    const gambeson = penaltyModifier('gambeson', 'bellatores', config);
    expect(15 * 2 - gambeson.fatigueReduction).toBe(25);
    expect(Math.floor(15 * penaltyModifier('weighted_coin', 'laboratores', config).coinPenaltyPct / 100)).toBe(7);
    expect(() => penaltyModifier('metheglin', 'bellatores', config)).toThrow(RuleError);
  });

  it('enforces every consumable timing window', () => {
    for (const stage of stages) {
      for (const id of ['theriac', 'st_johns_wort']) {
        expect(canUseConsumable(id, stage, config)).toBe(['continue_or_retreat', 'waystation_decision'].includes(stage));
      }
      expect(canUseConsumable('metheglin', stage, config)).toBe(stage === 'reroll_or_accept');
      expect(canUseConsumable('gambeson', stage, config)).toBe(false);
    }
    expect(() => consumableEffect('theriac', 'reroll_or_accept', { fatigue: 50, melancholy: 50 }, config))
      .toThrow(expect.objectContaining({ code: 'INVALID_STAGE' }));
    expect(() => consumableEffect('gambeson', 'continue_or_retreat', { fatigue: 0, melancholy: 0 }, config))
      .toThrow(expect.objectContaining({ code: 'INVALID_ITEM' }));
  });

  it.each([0, 12, 30, 50])('returns clamped recovery deltas for burden %i', value => {
    const burdens = Object.freeze({ fatigue: value, melancholy: value });
    const delta = -Math.min(30, value) || 0;
    expect(consumableEffect('theriac', 'continue_or_retreat', burdens, config)).toEqual({ fatigue: delta, melancholy: 0, reroll: false });
    expect(consumableEffect('st_johns_wort', 'waystation_decision', burdens, config)).toEqual({ fatigue: 0, melancholy: delta, reroll: false });
    expect(consumableEffect('metheglin', 'reroll_or_accept', burdens, config)).toEqual({ fatigue: 0, melancholy: 0, reroll: true });
  });

  it('uses configured effects rather than fixed IDs or magnitudes', () => {
    const custom = withOverrides(config, { items: { catalog: {
      theriac: { amount: 9 }, saints_relic: { amount: 13, estate: 'bellatores' },
    } } });
    expect(consumableEffect('theriac', 'continue_or_retreat', { fatigue: 50, melancholy: 0 }, custom).fatigue).toBe(-9);
    expect(probabilityBonus('saints_relic', 'bellatores', custom)).toBe(13);
  });

  it('copies scenario starting inventory independently of acquisition mode', () => {
    expect(startingInventory(config)).toEqual({});
    const custom = withOverrides(config, { startingState: { startingInventory: { theriac: 2, gambeson: 1 } } });
    const inventory = startingInventory(custom);
    expect(inventory).toEqual({ theriac: 2, gambeson: 1 });
    inventory.theriac = 0;
    expect(startingInventory(custom).theriac).toBe(2);
  });
});

describe('B2 experimental item rewards', () => {
  it('makes no draw in the baseline or experimental baseline configs', () => {
    for (const rules of [config, loadContentConfig('rules.experimental.json')]) {
      expect(drawItemReward(123, rules)).toEqual({ value: undefined, state: 123 });
    }
  });

  it('enables repeatable rewards only in the item test variant', () => {
    const enabled = loadContentConfig('variants/items-test-table.json');
    const seen = new Set<string | undefined>();
    let state = 123;
    for (let i = 0; i < 100; i++) {
      const result = drawItemReward(state, enabled);
      expect(drawItemReward(state, enabled)).toEqual(result);
      expect(result.state).not.toBe(state);
      seen.add(result.value);
      state = result.state;
    }
    expect([...seen].sort()).toEqual(Object.keys(config.items.catalog).sort());
  });

  it('respects weighted tables and is independent of object key order', () => {
    const weighted = withOverrides(config, { items: { acquisition: 'test_table', testRewardTable: {
      gambeson: 1, metheglin: 2, saints_relic: 3, st_johns_wort: 4, theriac: 5, weighted_coin: 6,
    } } });
    const reordered = { ...weighted, items: { ...weighted.items,
      testRewardTable: Object.fromEntries(Object.entries(weighted.items.testRewardTable).reverse()),
    } };
    const slots = Object.keys(weighted.items.testRewardTable).sort()
      .flatMap(id => Array<string>(weighted.items.testRewardTable[id]!).fill(id));
    for (let seed = 0; seed < 100; seed++) {
      const roll = rollInt(seed, 1, 21);
      expect(drawItemReward(seed, weighted)).toEqual({ value: slots[roll.value - 1], state: roll.state });
      expect(drawItemReward(seed, reordered)).toEqual(drawItemReward(seed, weighted));
    }
  });

  it('rejects invalid reward tables at config loading', () => {
    for (const table of [{ mystery: 1 }, { theriac: 0 }, { theriac: -1 }, { theriac: 1.5 }, { theriac: 0x1_0000_0000 }]) {
      expect(() => withOverrides(config, { items: { testRewardTable: table } })).toThrow(ConfigError);
    }
    const empty = { ...config, items: { ...config.items, acquisition: 'test_table' as const, testRewardTable: {} } };
    expect(() => withOverrides(empty, {})).toThrow(ConfigError);
  });
});
