/**
 * D2 item scenarios (tech §7 "Equipment and consumables", §13): Weighted
 * Coin, Saint's Relic against an Oratores (blue) encounter, Metheglin
 * rerolling a failed roll, Gambeson under a Full Moon, and slot items on
 * wipeout or retreat.
 */
import { describe, expect, it } from 'vitest';
import { withOverrides } from '../../core/config.js';
import { encounterOdds, failurePenalty } from '../../core/encounter.js';
import { canUseConsumable, consumableEffect } from '../../core/items.js';
import type { PilgrimageStage } from '../../core/types.js';
import {
  coinDelta,
  defaultConfig as config,
  eventsOfType,
  forcedRolls,
  hasItems,
  ruleState,
  scenario,
  type PilgrimageOverrides,
  type StateOverrides,
} from './harness.js';

/** Waxing-locked entry in a month with no solar aspect (week 5). */
const WAXING_ENTRY = 5;
const FULL_ENTRY = 6;

function onRoad(pilgrimage: PilgrimageOverrides, rolls: number[], rest: StateOverrides = {}, entry = WAXING_ENTRY): StateOverrides {
  return {
    elapsedWeeks: entry + 1,
    ...rest,
    rng: { ...ruleState().rng, encounters: forcedRolls(...rolls) },
    pilgrimage: { segmentEntryWeek: entry, ...pilgrimage },
  };
}

// ---------------------------------------------------------------------------
// Rule-level scenarios
// ---------------------------------------------------------------------------

describe('§7 Weighted Coin (rule level)', () => {
  it('halves a Laboratores failure from 15 to 7, Full Moon or not', () => {
    for (const lunar of ['waxing', 'full'] as const) {
      expect(failurePenalty({ approach: 'laboratores', lunar, equipmentId: 'weighted_coin' }, config)).toEqual({
        resource: 'coin',
        amount: 7,
        sources: ['item:weighted_coin'],
      });
    }
  });

  it('does nothing for the other approaches', () => {
    expect(failurePenalty({ approach: 'bellatores', lunar: 'waxing', equipmentId: 'weighted_coin' }, config).amount).toBe(15);
    expect(failurePenalty({ approach: 'oratores', lunar: 'full', equipmentId: 'weighted_coin' }, config).amount).toBe(30);
  });

  it('Q2 variant: with Purse Protection, both percents are floored once', () => {
    const q2 = withOverrides(config, { failure: { purseProtection: { appliesToLabFailures: true } } });
    const penalty = failurePenalty(
      { approach: 'laboratores', lunar: 'waxing', equipmentId: 'weighted_coin', purseProtectionPct: 30 },
      q2,
    );
    expect(penalty.amount).toBe(5); // floor(15 * 50% * 70%) = floor(5.25)
  });
});

describe('§7 Saint\'s Relic versus an Oratores encounter (rule level)', () => {
  const odds = (threat: 'oratores' | 'bellatores', equipmentId?: string, stat = 15) =>
    encounterOdds(
      { stat, approach: 'laboratores', threat, lunar: 'waxing', segmentIndex: 0, isFinal: false, ...(equipmentId ? { equipmentId } : {}) },
      config,
    );

  it('adds +10 probability against a blue card (Q10: probability, not the die)', () => {
    // floor(15 * 1.5) + 40 road = 62; +10 relic
    expect(odds('oratores').probability).toBe(62);
    expect(odds('oratores', 'saints_relic')).toMatchObject({ matchup: 'advantage', flatBonus: 10, probability: 72 });
  });

  it('adds nothing against another Estate', () => {
    expect(odds('bellatores', 'saints_relic')).toMatchObject({ flatBonus: 0, probability: odds('bellatores').probability });
  });

  it('cannot push past the 95% clamp', () => {
    expect(odds('oratores', 'saints_relic', 40).probability).toBe(95); // 60 + 40 + 10
  });
});

describe('§7 Gambeson under a Full Moon (rule level)', () => {
  it('Q6: doubles first, then subtracts 5 (25 Fatigue)', () => {
    expect(failurePenalty({ approach: 'bellatores', lunar: 'full', equipmentId: 'gambeson' }, config).amount).toBe(25);
    expect(failurePenalty({ approach: 'bellatores', lunar: 'waxing', equipmentId: 'gambeson' }, config).amount).toBe(10);
  });
});

describe('§7 Metheglin (rule level)', () => {
  const stages: PilgrimageStage[] = ['encounter_reveal', 'choose_approach', 'reroll_or_accept', 'continue_or_retreat', 'waystation_decision'];

  it('is usable only in the post-failure reaction window', () => {
    expect(stages.filter((stage) => canUseConsumable('metheglin', stage, config))).toEqual(['reroll_or_accept']);
  });

  it('is a reroll that changes no burden', () => {
    expect(consumableEffect('metheglin', 'reroll_or_accept', { fatigue: 50, melancholy: 50 }, config))
      .toEqual({ fatigue: 0, melancholy: 0, reroll: true });
  });

  it('the burden consumables cannot be used in the reroll window', () => {
    expect(canUseConsumable('theriac', 'reroll_or_accept', config)).toBe(false);
    expect(canUseConsumable('st_johns_wort', 'reroll_or_accept', config)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Engine scenarios (C3)
// ---------------------------------------------------------------------------

describe.runIf(hasItems)('engine: §7 equipping Weighted Coin', () => {
  const road = (equipmentId?: string) =>
    onRoad({ carriedCoin: 10, departureCarriedCoin: 10, currentThreat: 'bellatores', ...(equipmentId ? { equipmentId } : {}) }, [100]);

  it('a Laboratores failure with 10 carried costs 7 and survives', () => {
    const result = scenario(road('weighted_coin'), [{ type: 'CHOOSE_APPROACH', estate: 'laboratores' }]);
    expect(eventsOfType(result.events, 'wipeout')).toEqual([]);
    expect(coinDelta(result.events, 'carried', 'laboratores_penalty')).toBe(-7);
    expect(result.final.pilgrimage).toMatchObject({ carriedCoin: 3, encounterIndex: 1 });
  });

  it('the same failure without it is a financial wipeout', () => {
    const result = scenario(road(), [{ type: 'CHOOSE_APPROACH', estate: 'laboratores' }]);
    expect(eventsOfType(result.events, 'wipeout')).toMatchObject([{ cause: 'coin' }]);
  });

  it('BEGIN_PILGRIMAGE moves it from the inventory into the equipment slot', () => {
    const result = scenario(
      { inventory: { weighted_coin: 1 }, treasury: 50 },
      [{ type: 'BEGIN_PILGRIMAGE', carry: 10, equipmentId: 'weighted_coin' }],
    );
    expect(result.final.pilgrimage?.equipmentId).toBe('weighted_coin');
    expect(result.final.inventory.weighted_coin ?? 0).toBe(0);
    expect(eventsOfType(result.events, 'item_changed')).toMatchObject([
      { itemId: 'weighted_coin', amount: -1, source: 'pilgrimage_slot_out' },
    ]);
  });

  it('an item not in the inventory cannot be equipped', () => {
    const result = scenario({ inventory: {} }, [{ type: 'BEGIN_PILGRIMAGE', carry: 0, equipmentId: 'weighted_coin' }]);
    expect(result.error?.code).toBe('ITEM_UNAVAILABLE');
    expect(result.final).toEqual(result.initial);
  });
});

describe.runIf(hasItems)('engine: §7 Saint\'s Relic versus an Oratores encounter', () => {
  const probabilityWith = (equipmentId?: string) => {
    const result = scenario(
      onRoad({ currentThreat: 'oratores', ...(equipmentId ? { equipmentId } : {}) }, [1]),
      [{ type: 'CHOOSE_APPROACH', estate: 'laboratores' }],
    );
    return eventsOfType(result.events, 'encounter_resolved')[0]?.probability;
  };

  it('raises the resolved probability by 10', () => {
    expect(probabilityWith()).toBe(62);
    expect(probabilityWith('saints_relic')).toBe(72);
  });
});

describe.runIf(hasItems)('engine: §7 a failed roll rerolled with Metheglin', () => {
  const road = (rolls: number[]) =>
    onRoad({ consumableId: 'metheglin', currentThreat: 'oratores' }, rolls, { fatigue: 10 });

  it('a failure with Metheglin carried waits in the reroll window without charging the penalty', () => {
    const result = scenario(road([100]), [{ type: 'CHOOSE_APPROACH', estate: 'bellatores' }]);
    expect(result.final.pilgrimage).toMatchObject({ stage: 'reroll_or_accept', encounterIndex: 0, pendingFailure: true });
    expect(result.final.fatigue).toBe(10);
  });

  it('a successful reroll cancels the first penalty and advances the encounter once', () => {
    const result = scenario(road([100, 1]), [
      { type: 'CHOOSE_APPROACH', estate: 'bellatores' },
      { type: 'USE_CONSUMABLE', itemId: 'metheglin' },
    ]);
    expect(result.error).toBeUndefined();
    expect(eventsOfType(result.events, 'reroll_used')).toMatchObject([{ itemId: 'metheglin', roll: 1 }]);
    expect(eventsOfType(result.events, 'burden_changed')).toEqual([]);
    expect(result.final.fatigue).toBe(10);
    expect(result.final.pilgrimage).toMatchObject({ encounterIndex: 1, consumableUsed: true, stage: 'continue_or_retreat' });
    const resolved = eventsOfType(result.events, 'encounter_resolved');
    expect(resolved.at(-1)).toMatchObject({ threat: 'oratores', approach: 'bellatores', success: true });
  });

  it('a failed reroll applies the normal penalty exactly once', () => {
    const result = scenario(road([100, 100]), [
      { type: 'CHOOSE_APPROACH', estate: 'bellatores' },
      { type: 'USE_CONSUMABLE', itemId: 'metheglin' },
    ]);
    expect(eventsOfType(result.events, 'burden_changed')).toMatchObject([
      { burden: 'fatigue', amount: 15, source: 'encounter_penalty' },
    ]);
    expect(result.final.fatigue).toBe(25);
    expect(result.final.pilgrimage).toMatchObject({ encounterIndex: 1, consumableUsed: true });
  });

  it('accepting the failure keeps Metheglin and charges the penalty once', () => {
    const result = scenario(road([100]), [
      { type: 'CHOOSE_APPROACH', estate: 'bellatores' },
      { type: 'ACCEPT_RESULT' },
    ]);
    expect(result.final.fatigue).toBe(25);
    expect(result.final.pilgrimage).toMatchObject({ encounterIndex: 1, consumableUsed: false, consumableId: 'metheglin' });
  });

  it('cannot be drunk before a roll has failed', () => {
    const result = scenario(road([100]), [{ type: 'USE_CONSUMABLE', itemId: 'metheglin' }]);
    expect(result.error).toBeDefined();
    expect(result.final).toEqual(result.initial);
  });
});

describe.runIf(hasItems)('engine: §7 Gambeson under a Full Moon', () => {
  it('a failed Bellatores approach costs 25 Fatigue', () => {
    const result = scenario(
      onRoad({ equipmentId: 'gambeson', currentThreat: 'oratores' }, [100], {}, FULL_ENTRY),
      [{ type: 'CHOOSE_APPROACH', estate: 'bellatores' }],
    );
    expect(result.final.fatigue).toBe(25);
  });
});

describe.runIf(hasItems)('engine: §7 slot items on wipeout and retreat', () => {
  it('wipeout returns the equipment to inventory and loses the consumable', () => {
    const result = scenario(
      onRoad({ equipmentId: 'gambeson', consumableId: 'theriac', currentThreat: 'bellatores' }, [100], { inventory: {} }),
      [{ type: 'CHOOSE_APPROACH', estate: 'laboratores' }],
    );
    expect(eventsOfType(result.events, 'wipeout')).toMatchObject([{ cause: 'coin' }]);
    expect(result.final.inventory.gambeson).toBe(1);
    expect(result.final.inventory.theriac ?? 0).toBe(0);
    expect(eventsOfType(result.events, 'item_changed')).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ itemId: 'theriac', source: 'wipeout_lost' }),
        expect.objectContaining({ itemId: 'gambeson', source: 'pilgrimage_slot_returned' }),
      ]),
    );
  });

  it('a consumable already used is not lost or returned a second time', () => {
    const result = scenario(
      onRoad(
        { stage: 'continue_or_retreat', encounterIndex: 2, consumableId: 'theriac' },
        [100],
        { fatigue: 40, inventory: {} },
      ),
      [{ type: 'USE_CONSUMABLE', itemId: 'theriac' }, { type: 'RETREAT' }],
    );
    expect(result.error).toBeUndefined();
    expect(result.steps[0]!.after.fatigue).toBe(10);
    const theriacEvents = eventsOfType(result.events, 'item_changed').filter((e) => e.itemId === 'theriac');
    expect(theriacEvents).toMatchObject([{ source: 'consumed' }]);
    expect(result.final.inventory.theriac ?? 0).toBe(0);
  });
});
