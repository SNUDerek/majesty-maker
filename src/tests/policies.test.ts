import { describe, expect, it } from 'vitest';
import {
  applyAction, createCampaign, getAvailableActions, getCalendar, getDerivedStats, withOverrides,
  type CampaignState, type RulesConfig,
} from '../core/index.js';
import { encounterOdds } from '../core/encounter.js';
import {
  createPolicies, createPolicy, DEFAULT_POLICY_PARAMS, estimateSegmentSurvival, POLICIES, POLICY_IDS,
  type PolicyId, type PolicyParams,
} from '../simulation/policies.js';
import { runCli } from '../simulation/cli.js';
import { deriveBatchSeed, runCampaign } from '../simulation/runner.js';
import { loadContentConfig } from './support/config.js';

const config = loadContentConfig();
function home(overrides: Partial<CampaignState> = {}): CampaignState {
  return { ...createCampaign({ seed: 123, birthSign: 'aries',
    playerName: { first: 'Test', last: 'Bot' }, scionName: 'Scion' }, config), ...overrides };
}
function road(overrides: Partial<CampaignState> = {}): CampaignState {
  return home({ phase: 'pilgrimage', elapsedWeeks: 3, pilgrimage: {
    stage: 'choose_approach', segmentIndex: 0, encounterIndex: 0, carriedCoin: 45,
    departureCarriedCoin: 45, earnedCoin: 0, skipUsed: false, consumableUsed: false,
    isFinal: false, segmentEntryWeek: 0, currentThreat: 'oratores',
  }, ...overrides });
}
function decide(id: PolicyId, state: CampaignState, params: Partial<PolicyParams> = {}, rules = config) {
  return createPolicy(id, rules, params).decide(state, getAvailableActions(state, rules),
    getDerivedStats(state, rules), getCalendar(state, rules));
}

describe('E3 policy decisions', () => {
  it('registers seven policies with copied, frozen, validated threshold params', () => {
    expect(createPolicies(config).map((p) => p.id)).toEqual(POLICY_IDS);
    const overrides = { restMargin: 7 };
    const policy = createPolicy('balanced', config, overrides);
    overrides.restMargin = 99;
    expect(policy.params).toEqual({ ...DEFAULT_POLICY_PARAMS, restMargin: 7 });
    expect(Object.isFrozen(policy.params)).toBe(true);
    for (const params of [{ restMargin: -1 }, { carryFailures: 1.2 }, { survivalThreshold: 1.1 },
      { departureStat: NaN }, { trainingReserve: Infinity }]) {
      expect(() => createPolicy('balanced', config, params)).toThrow(RangeError);
    }
    expect(() => createPolicy('missing' as PolicyId, config)).toThrow(RangeError);
  });

  it('works Stables, rests exactly at either configured margin, and never departs', () => {
    const state = home();
    const d = getDerivedStats(state, config);
    expect(decide('stables-only', state)).toEqual({ type: 'WORK', job: 'stables' });
    for (const burden of ['fatigue', 'melancholy'] as const) {
      const ceiling = burden === 'fatigue' ? d.fatigueCeiling : d.melancholyCeiling;
      expect(decide('stables-only', { ...state, [burden]: ceiling - 7 }, { restMargin: 7 }))
        .toEqual({ type: 'REST', rest: 'rest_home' });
      expect(decide('stables-only', { ...state, [burden]: ceiling - 8 }, { restMargin: 7 }).type).toBe('WORK');
    }
  });

  it.each([
    ['specialist-b', 'bellatores', 'hedge_knight', 'village_watch'],
    ['specialist-o', 'oratores', 'hermit', 'scriptorium'],
    ['specialist-l', 'laboratores', 'smuggler', 'alehouse'],
  ] as const)('%s trains, works and approaches in its own Estate', (id, estate, tutor, job) => {
    expect(decide(id, home())).toEqual({ type: 'TRAIN', tutor });
    expect(decide(id, home({ treasury: 0 }))).toEqual({ type: 'WORK', job });
    expect(decide(id, road())).toEqual({ type: 'CHOOSE_APPROACH', estate });
    const prepared = home({ stats: { bellatores: 45, oratores: 45, laboratores: 45 }, treasury: 100 });
    expect(decide(id, prepared)).toEqual({ type: 'BEGIN_PILGRIMAGE', carry: 45 });
  });

  it('Balanced trains the weakest stat and picks the highest-odds available job', () => {
    expect(decide('balanced', home({ stats: { bellatores: 30, oratores: 10, laboratores: 20 } })))
      .toEqual({ type: 'TRAIN', tutor: 'hermit' });
    expect(decide('balanced', home({ treasury: 0 }))).toEqual({ type: 'WORK', job: 'stables' });
    const state = home({ treasury: 0, stats: { bellatores: 20, oratores: 50, laboratores: 10 } });
    const available = getAvailableActions(state, config).filter((a) => !(a.type === 'WORK' && a.job === 'stables'));
    expect(createPolicy('balanced', config).decide(state, available, getDerivedStats(state, config),
      getCalendar(state, config))).toEqual({ type: 'WORK', job: 'scriptorium' });
  });

  it('uses segment-locked lunar odds for the best approach, rather than the advanced calendar', () => {
    const state = road({ stats: { bellatores: 50, oratores: 30, laboratores: 10 } });
    state.pilgrimage!.segmentEntryWeek = 2; // Full, whereas elapsed week 3 is Waning.
    state.pilgrimage!.currentThreat = 'bellatores';
    const expected = (['bellatores', 'oratores', 'laboratores'] as const).map((estate) => ({
      estate, probability: encounterOdds({ stat: state.stats[estate], approach: estate,
        threat: 'bellatores', lunar: 'full', segmentIndex: 0, isFinal: false }, config).probability,
    })).sort((a, b) => b.probability - a.probability)[0]!;
    expect(expected.estate).toBe('oratores');
    expect(decide('balanced', state)).toEqual({ type: 'CHOOSE_APPROACH', estate: expected.estate });
    state.pilgrimage!.segmentEntryWeek = 3;
    expect(decide('balanced', state)).toEqual({ type: 'CHOOSE_APPROACH', estate: 'bellatores' });
  });

  it('Reckless departs immediately with minimal carry and retreats at an imminent fatal failure', () => {
    expect(decide('reckless', home())).toEqual({ type: 'BEGIN_PILGRIMAGE', carry: 0 });
    const state = road({ stats: { bellatores: 100, oratores: 0, laboratores: 0 } });
    state.pilgrimage!.stage = 'continue_or_retreat';
    expect(decide('reckless', state).type).toBe('CONTINUE_ENCOUNTER');
    state.fatigue = getDerivedStats(state, config).fatigueCeiling - config.encounters.failurePenalty;
    expect(decide('reckless', state).type).toBe('RETREAT');
    state.fatigue--;
    expect(decide('reckless', state).type).toBe('CONTINUE_ENCOUNTER');
  });

  it('Pragmatic uses Waning recovery and Trine jobs, with configurable carry and retreat thresholds', () => {
    expect(decide('pragmatic', home({ elapsedWeeks: 3, fatigue: 30 })))
      .toEqual({ type: 'REST', rest: 'bathhouse' });
    expect(decide('pragmatic', home({ elapsedWeeks: 16 }))).toEqual({ type: 'WORK', job: 'stables' });
    const prepared = home({ stats: { bellatores: 80, oratores: 80, laboratores: 80 }, treasury: 100 });
    expect(decide('pragmatic', prepared, { carryFailures: 4 }).type).toBe('BEGIN_PILGRIMAGE');
    expect(decide('pragmatic', prepared, { carryFailures: 4 })).toEqual({ type: 'BEGIN_PILGRIMAGE', carry: 60 });
    const state = road();
    state.pilgrimage!.stage = 'continue_or_retreat';
    expect(decide('pragmatic', state, { survivalThreshold: 0 }).type).toBe('CONTINUE_ENCOUNTER');
    expect(decide('pragmatic', state, { survivalThreshold: 1 }).type).toBe('RETREAT');
  });

  it('estimates survival from available failure budgets, treats Coin equality as safe, and supports final lengths', () => {
    const rules = withOverrides(config, { encounters: { successMin: 50, successMax: 50 },
      route: { finalEncounters: 1 } });
    const state = road({ stats: { bellatores: 0, oratores: 0, laboratores: 100 } });
    // Equal odds choose Bellatores: zero tolerated failures -> all five checks must succeed.
    state.fatigue = getDerivedStats(state, rules).fatigueCeiling - 15;
    expect(estimateSegmentSurvival(state, getDerivedStats(state, rules), rules)).toBeCloseTo(0.5 ** 5);
    state.pilgrimage!.isFinal = true;
    state.pilgrimage!.segmentIndex = rules.route.regularSegments;
    expect(estimateSegmentSurvival(state, getDerivedStats(state, rules), rules)).toBe(0.5);
    state.fatigue--;
    expect(estimateSegmentSurvival(state, getDerivedStats(state, rules), rules)).toBe(1);
    const coinRules = withOverrides(config, { encounters: { successMin: 0, successMax: 100 },
      route: { finalEncounters: 1, finalRoadBonus: 0 } });
    state.fatigue = 0;
    state.pilgrimage!.carriedCoin = 15;
    expect(estimateSegmentSurvival(state, getDerivedStats(state, coinRules), coinRules)).toBe(1);
    state.pilgrimage!.carriedCoin = 14;
    expect(estimateSegmentSurvival(state, getDerivedStats(state, coinRules), coinRules)).toBeLessThan(1);
  });


  it('uses threat weights and equipment effects in the survival budget', () => {
    const rules = withOverrides(config, { encounters: {
      distribution: { bellatores: 1, oratores: 0, laboratores: 0 },
    }, route: { finalEncounters: 1, finalRoadBonus: 0 } });
    const state = road({ stats: { bellatores: 100, oratores: 0, laboratores: 0 } });
    state.pilgrimage!.isFinal = true;
    state.pilgrimage!.segmentIndex = rules.route.regularSegments;
    state.fatigue = getDerivedStats(state, rules).fatigueCeiling - 15;
    expect(estimateSegmentSurvival(state, getDerivedStats(state, rules), rules)).toBeCloseTo(0.95);
    state.pilgrimage!.equipmentId = 'gambeson';
    expect(estimateSegmentSurvival(state, getDerivedStats(state, rules), rules)).toBe(1);
    state.pilgrimage!.segmentEntryWeek = 2;
    expect(estimateSegmentSurvival(state, getDerivedStats(state, rules), rules)).toBeCloseTo(0.95);
  });

  it('checks the next segment with its new moon phase at a waystation', () => {
    const state = road({ stats: { bellatores: 100, oratores: 0, laboratores: 0 }, elapsedWeeks: 2 });
    state.pilgrimage!.stage = 'waystation_decision';
    state.fatigue = getDerivedStats(state, config).fatigueCeiling - 20;
    // The old segment was New; the upcoming Full Moon doubles failure burdens.
    expect(decide('reckless', state).type).toBe('RETURN_HOME');
    state.elapsedWeeks = 3;
    expect(decide('reckless', state).type).toBe('CONTINUE_SEGMENT');
  });

  it('handles forced convalescence, Metheglin, recovery items, and waystation exits', () => {
    for (const id of POLICY_IDS) expect(decide(id, home({ pendingConvalescence: 'wipeout' })))
      .toEqual({ type: 'REST', rest: 'rest_home' });
    const state = road();
    state.pilgrimage!.stage = 'reroll_or_accept';
    state.pilgrimage!.consumableId = 'metheglin';
    expect(decide('balanced', state)).toEqual({ type: 'USE_CONSUMABLE', itemId: 'metheglin' });
    state.pilgrimage!.consumableUsed = true;
    expect(decide('balanced', state).type).toBe('ACCEPT_RESULT');
    state.pilgrimage!.stage = 'waystation_decision';
    state.pilgrimage!.consumableId = 'theriac';
    state.pilgrimage!.consumableUsed = false;
    state.fatigue = 30;
    expect(decide('balanced', state)).toEqual({ type: 'USE_CONSUMABLE', itemId: 'theriac' });
    state.pilgrimage!.consumableUsed = true;
    state.fatigue = getDerivedStats(state, config).fatigueCeiling - 20;
    expect(decide('balanced', state).type).toBe('RETURN_HOME');
  });

  it.each(POLICY_IDS)('%s reads no hidden state and mutates no inputs', (id) => {
    for (const state of [home(), home({ stats: { bellatores: 80, oratores: 80, laboratores: 80 }, treasury: 100 }), road(),
      { ...road(), pilgrimage: { ...road().pilgrimage!, stage: 'continue_or_retreat' as const } }]) {
      const before = structuredClone(state);
      const observed = structuredClone(state);
      for (const key of ['rng', 'seed'] as const) Object.defineProperty(observed, key, {
        get() { throw new Error(`Hidden ${key} accessed`); },
      });
      const available = getAvailableActions(state, config);
      const derived = getDerivedStats(state, config);
      const calendar = getCalendar(state, config);
      function freeze(value: object): void {
        for (const descriptor of Object.values(Object.getOwnPropertyDescriptors(value))) {
          if (descriptor.value && typeof descriptor.value === 'object') freeze(descriptor.value);
        }
        Object.freeze(value);
      }
      for (const value of [observed, available, derived, calendar]) freeze(value);
      expect(createPolicy(id, config).decide(observed, available, derived, calendar)).toEqual(decide(id, state));
      expect(state).toEqual(before);
    }
  });
});

describe('E3 seeded campaign smoke tests', () => {
  it.each(POLICY_IDS)('%s completes 20 paired seeds with valid replayable decision traces', (id) => {
    for (let index = 0; index < 20; index++) {
      const sign = (['aries', 'taurus', 'gemini', 'pisces'] as const)[index % 4]!;
      const seed = deriveBatchSeed(123, sign, index);
      const result = runCampaign({ seed, sign, policy: createPolicy(id, config), config, strict: true, trace: true });
      expect(['victory', 'deadline']).toContain(result.finalState.outcome);
      for (const decision of result.decisions) {
        const applied = applyAction(decision.before!, decision.action, config);
        expect(applied.state).toEqual(decision.after);
        expect(applied.events).toEqual(result.events.slice(decision.eventStart, decision.eventEnd));
      }
      if (index === 0) expect(runCampaign({ seed, sign, policy: createPolicy(id, config), config, trace: true }))
        .toEqual(result);
      if (id === 'stables-only') expect(result.events.some((e) => e.type === 'pilgrimage_started')).toBe(false);
    }
  }, 30_000);

  it('supports route and penalty variants, item slots and final-gauntlet victory', () => {
    const rules: RulesConfig = withOverrides(config, {
      encounters: { successMin: 100, successMax: 100, failurePenalty: 20 },
      route: { regularSegments: 1, roadBonus: [0], encountersPerSegment: 4, finalEncounters: 6 },
      startingState: { treasury: 500, baseStat: 80, startingInventory: { gambeson: 1, metheglin: 1 } },
    });
    for (const id of POLICY_IDS.filter((id) => id !== 'stables-only')) {
      const result = runCampaign({ seed: 4, sign: 'aries', policy: createPolicy(id, rules), config: rules, strict: true });
      expect(result.finalState.outcome).toBe('victory');
      expect(result.decisions[0]!.action).toMatchObject({
        type: 'BEGIN_PILGRIMAGE', equipmentId: 'gambeson', consumableId: 'metheglin',
        carry: id === 'reckless' ? 0 : 60,
      });
    }
  });
});

describe('CLI policy registry', () => {
  it('registers every policy id with a factory bound to the loaded config', () => {
    expect(Object.keys(POLICIES)).toEqual([...POLICY_IDS]);
    const variant = withOverrides(config, { encounters: { failurePenalty: 20 } });
    for (const id of POLICY_IDS) {
      const policy = POLICIES[id]!(variant);
      expect(policy.id).toBe(id);
      expect(policy.params).toEqual(DEFAULT_POLICY_PARAMS);
    }
  });

  it('runs the tech §14 trace command with the real registry', () => {
    const out: string[] = [];
    const err: string[] = [];
    const code = runCli(['--policy', 'pragmatic', '--birth-sign', 'aries', '--seed', '123', '--trace'],
      { stdout: (t) => out.push(t), stderr: (t) => err.push(t) });
    expect(err).toEqual([]);
    expect(code).toBe(0);
    expect(out.join('\n')).toContain('policy=pragmatic sign=aries');
  });
});
