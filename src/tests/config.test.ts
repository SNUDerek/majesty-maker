import { readFileSync } from 'node:fs';
import { describe, expect, expectTypeOf, it } from 'vitest';
import {
  ConfigError,
  canonicalJson,
  fnv1a64,
  getUnresolved,
  hashConfig,
  loadConfig,
  validateConfig,
  withOverrides,
  type RulesConfig,
} from '../core/config.js';
import type { ApplyAction, Estate, RulesConfigContract } from '../core/types.js';
import { loadContentConfig, readContentJson } from './support/config.js';

/** Deep copy of the parsed default rules, safe to mutate in a test. */
function defaultRules(): Record<string, any> {
  return structuredClone(readContentJson('rules.default.json')) as Record<string, any>;
}

function loadWith(mutate: (rules: Record<string, any>) => void): RulesConfig {
  const rules = defaultRules();
  mutate(rules);
  return loadConfig({ rules, items: readContentJson('items.json') });
}

/** Recursively rebuilds objects with their keys in reverse order. */
function reverseKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(reverseKeys);
  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(
      Object.entries(value)
        .reverse()
        .map(([key, entry]) => [key, reverseKeys(entry)]),
    );
  }
  return value;
}

function expectConfigError(load: () => unknown, fragment: string): void {
  let caught: unknown;
  try {
    load();
  } catch (error) {
    caught = error;
  }
  expect(caught).toBeInstanceOf(ConfigError);
  expect((caught as ConfigError).errors.join('\n')).toContain(fragment);
}

describe('default config', () => {
  const config = loadContentConfig();

  it('loads and validates', () => {
    expect(validateConfig(config)).toEqual([]);
    expect(config.id).toBe('default');
    expect(Object.keys(config.items.catalog)).toHaveLength(6);
  });

  it('carries the confirmed values from the tech doc', () => {
    expect(config.calendar).toMatchObject({ totalWeeks: 96, weeksPerMonth: 4, startYear: 1450, startAge: 14 });
    expect(config.startingState).toMatchObject({ baseStat: 15, zodiacBonus: 5, treasury: 50, treasuryMax: 9999 });
    expect(config.route.departureFee).toBe(10);
    expect(config.route.roadBonus).toEqual([40, 30, 20, 10, 0]);
    expect(config.encounters.failurePenalty).toBe(15);
    expect(config.failure.wipeoutMedicalFeeMax).toBe(50);
    expect(config.jobs.definitions.stables.checkStat).toBeNull();
  });

  it('maps every zodiac group to its Estate', () => {
    const byEstate = (estate: Estate) =>
      Object.entries(config.startingState.zodiacEstate)
        .filter(([, value]) => value === estate)
        .map(([sign]) => sign)
        .sort();
    expect(byEstate('bellatores')).toEqual(['aries', 'cancer', 'capricorn', 'libra']);
    expect(byEstate('oratores')).toEqual(['aquarius', 'leo', 'scorpio', 'taurus']);
    expect(byEstate('laboratores')).toEqual(['gemini', 'pisces', 'sagittarius', 'virgo']);
  });

  it('is deeply frozen', () => {
    expect(Object.isFrozen(config)).toBe(true);
    expect(Object.isFrozen(config.route.roadBonus)).toBe(true);
    expect(Object.isFrozen(config.items.catalog)).toBe(true);
  });

  it('satisfies the T0.2 contract types', () => {
    expectTypeOf<RulesConfig>().toMatchTypeOf<RulesConfigContract>();
    expectTypeOf<ApplyAction<RulesConfig>>().toBeFunction();
    expectTypeOf(config.route.regularSegments).toBeNumber();
    expectTypeOf(config.astrology.waxing.mode).toEqualTypeOf<'single' | 'compounding'>();
    expectTypeOf(config.jobs.definitions.alehouse.checkStat).toEqualTypeOf<Estate | null>();
  });

  it('loads the experimental overlay', () => {
    const experimental = loadContentConfig('rules.experimental.json');
    expect(experimental.id).toBe('experimental');
    expect(hashConfig(experimental)).not.toBe(hashConfig(config));
  });
});

describe('unresolved-parameter register', () => {
  const unresolved = getUnresolved(loadContentConfig());

  it('lists exactly the non-confirmed default parameters, with their legacy-control values', () => {
    const table: Record<string, { status: string; value: unknown }> = {
      'route.regularSegments': { status: 'experimental', value: 5 },
      'route.encountersPerSegment': { status: 'experimental', value: 5 },
      'route.finalEncounters': { status: 'experimental', value: 8 },
      'route.finalRoadBonus': { status: 'experimental', value: -20 },
      'classes.tutorBurden': {
        status: 'experimental',
        value: {
          hedge_knight: { fatigue: 5, melancholy: 0 },
          hermit: { fatigue: 0, melancholy: 5 },
          smuggler: { fatigue: 5, melancholy: 5 },
        },
      },
      'astrology.solar.squareTutorFatiguePct': { status: 'experimental', value: 100 },
      'astrology.newMoon.activityBonus': { status: 'experimental', value: 0 },
      'astrology.fullMoon.surge': { status: 'experimental', value: 0 },
      'astrology.newMoon.skipFee': { status: 'experimental', value: null },
      'astrology.waxing.bonusPct': { status: 'experimental', value: 110 },
      'failure.retreatLootRetentionPct': { status: 'experimental', value: 50 },
      'failure.retreatToll': { status: 'experimental', value: 5 },
      'failure.wipeoutBurdenReset': { status: 'experimental', value: 'zero' },
      'failure.homeCollapse': { status: 'experimental', value: { forcedWeek: true, recovery: 15, fee: 0 } },
      'failure.purseProtection.appliesToLabFailures': { status: 'experimental', value: false },
      'items.testRewardTable': {
        status: 'experimental',
        value: { theriac: 1, st_johns_wort: 1, metheglin: 1, gambeson: 1, saints_relic: 1, weighted_coin: 1 },
      },
    };

    expect(unresolved.map(({ path, status, value }) => [path, { status, value }])).toEqual(
      Object.entries(table).sort(([a], [b]) => (a < b ? -1 : 1)),
    );
    expect(unresolved.every(({ note }) => note.length > 0)).toBe(true);
  });

  it('reports the current value after an override', () => {
    const config = withOverrides(loadContentConfig(), { route: { finalRoadBonus: -30 } });
    expect(getUnresolved(config).find(({ path }) => path === 'route.finalRoadBonus')?.value).toBe(-30);
  });

  it('is documented in docs/unresolved-parameters.md', () => {
    const doc = readFileSync(new URL('../../docs/unresolved-parameters.md', import.meta.url), 'utf8');
    for (const { path } of unresolved) {
      expect(doc, path).toContain(`\`${path}\``);
    }
  });
});

describe('validateConfig', () => {
  it.each([0, 2 ** 32 + 1, Number.MAX_SAFE_INTEGER])('rejects unsupported threat totals: %s', (total) => {
    expectConfigError(() => loadWith((r) => {
      r.encounters.distribution = { bellatores: total, oratores: 0, laboratores: 0 };
    }), 'encounters.distribution');
    expectConfigError(() => withOverrides(loadContentConfig(), {
      encounters: { distribution: { bellatores: total, oratores: 0, laboratores: 0 } },
    }), 'encounters.distribution');
  });

  it('accepts full-range threats and dice, and disabled extra job dice', () => {
    const config = loadWith((r) => {
      r.encounters.distribution = { bellatores: 2 ** 32, oratores: 0, laboratores: 0 };
      r.encounters.rewardCoinDie = 2 ** 32;
      r.jobs.definitions.alehouse.success.coinDie = 2 ** 32;
    });
    expect(validateConfig(config)).toEqual([]);
    expect(validateConfig(withOverrides(config, {
      jobs: { definitions: { alehouse: { success: { coinDie: 0 } } } },
    }))).toEqual([]);
  });

  it('rejects unsupported dice through loading and overrides', () => {
    expectConfigError(() => loadWith((r) => {
      r.jobs.definitions.alehouse.success.coinDie = 2 ** 32 + 1;
    }), 'jobs.definitions.alehouse.success.coinDie');
    expectConfigError(() => withOverrides(loadContentConfig(), {
      jobs: { definitions: { alehouse: { success: { coinDie: 2 ** 32 + 1 } } } },
    }), 'jobs.definitions.alehouse.success.coinDie');
    for (const sides of [0, 2 ** 32 + 1]) {
      expectConfigError(() => loadWith((r) => { r.encounters.rewardCoinDie = sides; }), 'encounters.rewardCoinDie');
      expectConfigError(() => withOverrides(loadContentConfig(), {
        encounters: { rewardCoinDie: sides },
      }), 'encounters.rewardCoinDie');
    }
  });

  it.each([10, 13])('rejects unsupported %s-month years', (monthsPerYear) => {
    expectConfigError(() => loadWith((r) => { r.calendar.monthsPerYear = monthsPerYear; }), 'calendar.monthsPerYear');
    expectConfigError(() => withOverrides(loadContentConfig(), {
      calendar: { monthsPerYear },
    }), 'calendar.monthsPerYear');
  });

  it('rejects a road-bonus array that does not match the segment count', () => {
    expectConfigError(() => loadWith((r) => (r.route.regularSegments = 4)), 'route.roadBonus: has 5 entries');
  });

  it('rejects negative percentages and non-integers', () => {
    expectConfigError(() => loadWith((r) => (r.astrology.solar.squareTutorGainPct = -10)), 'squareTutorGainPct');
    expectConfigError(() => loadWith((r) => (r.route.departureFee = 10.5)), 'route.departureFee: expected an integer');
  });

  it('rejects missing and unknown keys', () => {
    expectConfigError(() => loadWith((r) => delete r.rest.banquet), 'rest.banquet: missing');
    expectConfigError(() => loadWith((r) => (r.route.extra = 1)), 'route.extra: unknown key');
  });

  it('rejects invalid enum values', () => {
    expectConfigError(() => loadWith((r) => (r.astrology.waxing.mode = 'stacking')), 'astrology.waxing.mode');
  });

  it('accepts legacy and bounded wipeout recovery forms, and rejects anything else (Q13)', () => {
    for (const mode of ['zero', 'unchanged', { recovery: 0 }, { recovery: 35 }]) {
      expect(loadWith((r) => (r.failure.wipeoutBurdenReset = mode)).failure.wipeoutBurdenReset).toEqual(mode);
    }
    for (const bad of ['partial', { recovery: -1 }, { recovery: 2.5 }, { recovery: 35, extra: 1 }, {}, null]) {
      expectConfigError(() => loadWith((r) => (r.failure.wipeoutBurdenReset = bad)), 'failure.wipeoutBurdenReset');
    }
  });

  it('defaults new T2/T3 fields to legacy behavior and validates them', () => {
    const config = loadContentConfig();
    expect(config.astrology.solar.squareTutorFatiguePct).toBe(100);
    expect(config.failure.homeCollapse.fee).toBe(0);
    // A snapshot overlay written before these fields existed still loads through the defaults.
    const snapshot = structuredClone(readContentJson('rules.default.json')) as Record<string, any>;
    delete snapshot.astrology.solar.squareTutorFatiguePct;
    delete snapshot.failure.homeCollapse.fee;
    expect(hashConfig(withOverrides(config, snapshot))).toBe(hashConfig(config));
    expectConfigError(() => loadWith((r) => (r.failure.homeCollapse.fee = -1)), 'failure.homeCollapse.fee');
    expectConfigError(() => loadWith((r) => (r.astrology.solar.squareTutorFatiguePct = 1.5)), 'squareTutorFatiguePct');
  });

  it('rejects a broken matchup cycle', () => {
    expectConfigError(
      () => loadWith((r) => (r.encounters.beats.oratores = 'oratores')),
      'encounters.beats: an Estate cannot beat itself',
    );
  });

  it('rejects provenance for a path that does not exist', () => {
    expectConfigError(
      () => loadWith((r) => (r.provenance['route.typo'] = { status: 'tbd', note: 'x' })),
      'provenance.route.typo: does not name a config value',
    );
  });

  it('rejects inconsistent items', () => {
    expectConfigError(
      () => withOverrides(loadContentConfig(), { items: { catalog: { theriac: { kind: 'equipment' } } } }),
      'items.catalog.theriac: effect reduce_fatigue requires kind consumable',
    );
    expectConfigError(
      () => withOverrides(loadContentConfig(), { startingState: { startingInventory: { mystery: 1 } } }),
      'startingInventory.mystery: unknown item',
    );
  });

  it('rejects overlapping solar aspect distances', () => {
    expectConfigError(
      () => loadWith((r) => (r.astrology.solar.distances.trine = [3, 8])),
      'astrology.solar.distances.square: 3 is already used by trine',
    );
  });

  it('rejects non-object sources', () => {
    expectConfigError(() => loadConfig({ rules: [], items: {} }), 'rules: expected a JSON object');
  });
});

describe('variants', () => {
  it('deep-merges objects and replaces arrays', () => {
    const config = withOverrides(loadContentConfig(), {
      id: 'route-4',
      route: { regularSegments: 4, roadBonus: [40, 27, 13, 0] },
    });
    expect(config.id).toBe('route-4');
    expect(config.route).toMatchObject({ regularSegments: 4, roadBonus: [40, 27, 13, 0], finalEncounters: 8 });
  });

  it('applies variants in order', () => {
    const config = loadConfig({
      rules: readContentJson('rules.default.json'),
      items: readContentJson('items.json'),
      variants: [{ route: { finalRoadBonus: -10 } }, { route: { finalRoadBonus: -30 } }],
    });
    expect(config.route.finalRoadBonus).toBe(-30);
  });

  it('does not mutate the base config or the overlay', () => {
    const base = loadContentConfig();
    const overlay = { failure: { retreatToll: 7 } };
    withOverrides(base, overlay);
    expect(base.failure.retreatToll).toBe(5);
    expect(overlay).toEqual({ failure: { retreatToll: 7 } });
  });

  it('cannot pollute prototypes through a __proto__ key', () => {
    expectConfigError(
      () => withOverrides(loadContentConfig(), JSON.parse('{"__proto__": {"polluted": true}}')),
      '__proto__: unknown key',
    );
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
});

describe('hashConfig', () => {
  it('implements FNV-1a 64 (reference vectors)', () => {
    expect(fnv1a64('')).toBe('cbf29ce484222325');
    expect(fnv1a64('a')).toBe('af63dc4c8601ec8c');
    expect(fnv1a64('foobar')).toBe('85944171f73967e8');
  });

  it('is stable across loads and key orderings', () => {
    const reordered = loadConfig({
      rules: reverseKeys(readContentJson('rules.default.json')),
      items: reverseKeys(readContentJson('items.json')),
    });
    expect(hashConfig(loadContentConfig())).toBe(hashConfig(loadContentConfig()));
    expect(hashConfig(reordered)).toBe(hashConfig(loadContentConfig()));
    expect(hashConfig(reordered)).toMatch(/^[0-9a-f]{16}$/u);
  });

  it('changes when any value changes', () => {
    const base = loadContentConfig();
    expect(hashConfig(withOverrides(base, { failure: { retreatToll: 6 } }))).not.toBe(hashConfig(base));
    expect(hashConfig(withOverrides(base, { route: { roadBonus: [40, 30, 20, 0, 10] } }))).not.toBe(
      hashConfig(base),
    );
  });

  it('canonicalises key order but keeps array order', () => {
    expect(canonicalJson({ b: 1, a: [2, { d: null, c: 'x' }] })).toBe('{"a":[2,{"c":"x","d":null}],"b":1}');
  });
});
