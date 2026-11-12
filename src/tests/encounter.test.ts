import { describe, expect, it } from 'vitest';
import { withOverrides } from '../core/config.js';
import {
  approachMultiplierPct,
  encounterOdds,
  encounterProbability,
  equipmentProbabilityBonus,
  failurePenalty,
  isEncounterSuccess,
  matchup,
  roadBonusFor,
  type Matchup,
} from '../core/encounter.js';
import { type Estate, type LunarPhase, RuleError } from '../core/types.js';
import { loadContentConfig } from './support/config.js';

const config = loadContentConfig();
const estates: Estate[] = ['bellatores', 'oratores', 'laboratores'];
const phases: LunarPhase[] = ['new', 'waxing', 'full', 'waning'];

describe('matchup', () => {
  // Rows: approach; columns: threat. B beats L, L beats O, O beats B (tech §7).
  const table: Record<Estate, Record<Estate, Matchup>> = {
    bellatores: { bellatores: 'neutral', oratores: 'disadvantage', laboratores: 'advantage' },
    oratores: { bellatores: 'advantage', oratores: 'neutral', laboratores: 'disadvantage' },
    laboratores: { bellatores: 'disadvantage', oratores: 'advantage', laboratores: 'neutral' },
  };
  for (const approach of estates) {
    for (const threat of estates) {
      it(`${approach} vs ${threat} is ${table[approach][threat]}`, () => {
        expect(matchup(approach, threat, config)).toBe(table[approach][threat]);
      });
    }
  }

  it('follows a reversed beats cycle from config', () => {
    const reversed = withOverrides(config, {
      encounters: { beats: { bellatores: 'oratores', oratores: 'laboratores', laboratores: 'bellatores' } },
    });
    expect(matchup('bellatores', 'oratores', reversed)).toBe('advantage');
    expect(matchup('bellatores', 'laboratores', reversed)).toBe('disadvantage');
  });
});

describe('approachMultiplierPct', () => {
  for (const lunar of phases) {
    it(`uses 150/100/75 with ${lunar === 'full' ? '200 for advantage' : 'no change'} at ${lunar}`, () => {
      expect(approachMultiplierPct('advantage', lunar, config)).toBe(lunar === 'full' ? 200 : 150);
      expect(approachMultiplierPct('neutral', lunar, config)).toBe(100);
      expect(approachMultiplierPct('disadvantage', lunar, config)).toBe(75);
    });
  }

  it('reads values from config', () => {
    const custom = withOverrides(config, {
      encounters: { matchupPct: { advantage: 140, neutral: 90, disadvantage: 60 } },
      astrology: { fullMoon: { advantageMultiplierPct: 180 } },
    });
    expect(approachMultiplierPct('advantage', 'new', custom)).toBe(140);
    expect(approachMultiplierPct('advantage', 'full', custom)).toBe(180);
    expect(approachMultiplierPct('neutral', 'full', custom)).toBe(90);
    expect(approachMultiplierPct('disadvantage', 'full', custom)).toBe(60);
  });
});

describe('encounterProbability', () => {
  it.each([
    // stat, multPct, road, flat, expected
    [0, 100, -20, 0, 5], // floor clamp
    [100, 150, 40, 0, 95], // ceiling clamp
    [0, 150, 0, 0, 5],
    [15, 150, 40, 0, 62], // floor(22.5) = 22
    [15, 75, 0, 0, 11], // floor(11.25)
    [33, 75, 10, 10, 44], // floor(24.75) + 20
    [45, 100, 40, 10, 95],
    [44, 100, 40, 10, 94],
    [20, 100, -20, 0, 5],
    [26, 100, -20, 0, 6],
  ])('stat %i at %i pct + road %i + flat %i = %i', (stat, mult, road, flat, expected) => {
    expect(encounterProbability(stat, mult, road, flat, config)).toBe(expected);
  });

  it('uses no float drift: 10 x 110% is exactly 11', () => {
    expect(encounterProbability(10, 110, 0, 0, config)).toBe(11);
  });

  it('clamps to the configured bounds', () => {
    const custom = withOverrides(config, { encounters: { successMin: 10, successMax: 90 } });
    expect(encounterProbability(0, 100, 0, 0, custom)).toBe(10);
    expect(encounterProbability(100, 100, 0, 0, custom)).toBe(90);
  });

  it('rejects non-integer or negative input', () => {
    expect(() => encounterProbability(-1, 100, 0, 0, config)).toThrow(RangeError);
    expect(() => encounterProbability(1.5, 100, 0, 0, config)).toThrow(RangeError);
    expect(() => encounterProbability(10, 100, 0.5, 0, config)).toThrow(RangeError);
    expect(() => encounterProbability(10, -1, 0, 0, config)).toThrow(RangeError);
  });
});

describe('isEncounterSuccess', () => {
  it('is roll-under inclusive', () => {
    expect(isEncounterSuccess(50, 50)).toBe(true);
    expect(isEncounterSuccess(50, 51)).toBe(false);
    expect(isEncounterSuccess(5, 1)).toBe(true);
    expect(isEncounterSuccess(95, 96)).toBe(false);
  });

  it('rejects rolls outside 1..100', () => {
    for (const roll of [0, 101, 2.5]) expect(() => isEncounterSuccess(50, roll)).toThrow(RangeError);
  });
});

describe('roadBonusFor', () => {
  it('returns the default regular and final bonuses', () => {
    expect([0, 1, 2, 3, 4].map((index) => roadBonusFor(index, false, config))).toEqual([40, 30, 20, 10, 0]);
    expect(roadBonusFor(5, true, config)).toBe(-20);
  });

  it('rejects out-of-range or mismatched segments', () => {
    expect(() => roadBonusFor(-1, false, config)).toThrow(RangeError);
    expect(() => roadBonusFor(5, false, config)).toThrow(RangeError);
    expect(() => roadBonusFor(1.5, false, config)).toThrow(RangeError);
    expect(() => roadBonusFor(4, true, config)).toThrow(RangeError);
  });

  it('follows a different route length', () => {
    const short = withOverrides(config, {
      route: { regularSegments: 3, roadBonus: [30, 15, 0], finalRoadBonus: -10 },
    });
    expect(roadBonusFor(1, false, short)).toBe(15);
    expect(roadBonusFor(3, true, short)).toBe(-10);
    expect(() => roadBonusFor(3, false, short)).toThrow(RangeError);
  });
});

describe('failurePenalty', () => {
  const penalty = (approach: Estate, lunar: LunarPhase, equipmentId?: string) =>
    failurePenalty({ approach, lunar, ...(equipmentId === undefined ? {} : { equipmentId }) }, config);

  // [approach, lunar, equipment, resource, amount]
  const table: [Estate, LunarPhase, string | undefined, string, number][] = [
    ['bellatores', 'new', undefined, 'fatigue', 15],
    ['bellatores', 'full', undefined, 'fatigue', 30],
    ['bellatores', 'new', 'gambeson', 'fatigue', 10],
    ['bellatores', 'full', 'gambeson', 'fatigue', 25], // double first, then -5 (Q6)
    ['oratores', 'waxing', undefined, 'melancholy', 15],
    ['oratores', 'full', undefined, 'melancholy', 30],
    ['oratores', 'full', 'gambeson', 'melancholy', 30], // Gambeson only covers Bellatores
    ['laboratores', 'new', undefined, 'coin', 15],
    ['laboratores', 'full', undefined, 'coin', 15], // the moon never doubles Coin loss
    ['laboratores', 'new', 'weighted_coin', 'coin', 7], // floor(7.5)
    ['laboratores', 'full', 'weighted_coin', 'coin', 7],
    ['bellatores', 'full', 'weighted_coin', 'fatigue', 30], // Weighted Coin only covers Laboratores
    ['oratores', 'new', 'saints_relic', 'melancholy', 15], // Relic only affects probability
  ];
  for (const [approach, lunar, equipmentId, resource, amount] of table) {
    it(`${approach} at ${lunar}${equipmentId ? ` with ${equipmentId}` : ''} costs ${amount} ${resource}`, () => {
      expect(penalty(approach, lunar, equipmentId)).toMatchObject({ resource, amount });
    });
  }

  it('records trace sources', () => {
    expect(penalty('bellatores', 'full', 'gambeson').sources).toEqual(['lunar:full', 'item:gambeson']);
    expect(penalty('laboratores', 'full', 'weighted_coin').sources).toEqual(['item:weighted_coin']);
    expect(penalty('oratores', 'new').sources).toEqual([]);
  });

  it('never goes below zero when equipment exceeds the penalty', () => {
    const strong = withOverrides(config, { items: { catalog: { gambeson: { amount: 40 } } } });
    expect(failurePenalty({ approach: 'bellatores', lunar: 'full', equipmentId: 'gambeson' }, strong).amount).toBe(0);
  });

  it('reads the base penalty and Full Moon factor from config', () => {
    const custom = withOverrides(config, {
      encounters: { failurePenalty: 20 },
      astrology: { fullMoon: { pilgrimageBurdenPenaltyPct: 150 } },
    });
    expect(failurePenalty({ approach: 'oratores', lunar: 'full' }, custom).amount).toBe(30);
    expect(failurePenalty({ approach: 'laboratores', lunar: 'full' }, custom).amount).toBe(20);
  });

  describe('Purse Protection on Laboratores failures (Q2)', () => {
    const on = withOverrides(config, { failure: { purseProtection: { appliesToLabFailures: true } } });

    it('is ignored while the flag is off (default)', () => {
      expect(failurePenalty({ approach: 'laboratores', lunar: 'new', purseProtectionPct: 50 }, config).amount).toBe(15);
    });

    it('reduces Coin loss when on, flooring once with Weighted Coin', () => {
      expect(failurePenalty({ approach: 'laboratores', lunar: 'new', purseProtectionPct: 20 }, on))
        .toEqual({ resource: 'coin', amount: 12, sources: ['purse_protection'] });
      // 15 x 50% x 80% = 6 (floored once; flooring 7.5 first would give 5)
      expect(failurePenalty(
        { approach: 'laboratores', lunar: 'new', equipmentId: 'weighted_coin', purseProtectionPct: 20 }, on,
      ).amount).toBe(6);
      expect(failurePenalty({ approach: 'laboratores', lunar: 'new' }, on).amount).toBe(15);
    });

    it('does not touch Fatigue or Melancholy', () => {
      expect(failurePenalty({ approach: 'bellatores', lunar: 'new', purseProtectionPct: 50 }, on).amount).toBe(15);
    });

    it('rejects an out-of-range percent', () => {
      expect(() => failurePenalty({ approach: 'laboratores', lunar: 'new', purseProtectionPct: 101 }, on))
        .toThrow(RangeError);
    });
  });

  it('rejects unknown items and consumables with INVALID_ITEM', () => {
    for (const equipmentId of ['excalibur', 'theriac', 'toString']) {
      try {
        penalty('bellatores', 'new', equipmentId);
        expect.unreachable(`${equipmentId} should be rejected`);
      } catch (error) {
        expect(error).toBeInstanceOf(RuleError);
        expect((error as RuleError).code).toBe('INVALID_ITEM');
      }
    }
  });
});

describe("equipmentProbabilityBonus (Saint's Relic, Q10)", () => {
  it('adds +10 probability only against an Oratores threat', () => {
    expect(equipmentProbabilityBonus('saints_relic', 'oratores', config)).toBe(10);
    expect(equipmentProbabilityBonus('saints_relic', 'bellatores', config)).toBe(0);
    expect(equipmentProbabilityBonus('gambeson', 'oratores', config)).toBe(0);
    expect(equipmentProbabilityBonus(undefined, 'oratores', config)).toBe(0);
  });

  it('rejects unknown items', () => {
    expect(() => equipmentProbabilityBonus('nope', 'oratores', config)).toThrow(RuleError);
  });
});

describe('encounterOdds', () => {
  it('combines every term', () => {
    expect(encounterOdds({
      stat: 30, approach: 'laboratores', threat: 'oratores', lunar: 'full',
      segmentIndex: 2, isFinal: false, equipmentId: 'saints_relic',
    }, config)).toEqual({ matchup: 'advantage', multiplierPct: 200, roadBonus: 20, flatBonus: 10, probability: 90 });
  });

  it('applies the final gauntlet penalty at disadvantage', () => {
    expect(encounterOdds({
      stat: 50, approach: 'bellatores', threat: 'oratores', lunar: 'new', segmentIndex: 5, isFinal: true,
    }, config)).toEqual({ matchup: 'disadvantage', multiplierPct: 75, roadBonus: -20, flatBonus: 0, probability: 17 });
  });
});
