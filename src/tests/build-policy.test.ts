import { describe, expect, it } from 'vitest';
import {
  createCampaign, getAvailableActions, getCalendar, getDerivedStats, withOverrides,
  type CampaignState, type RulesConfig,
} from '../core/index.js';
import { jobSuccessChance } from '../core/economy.js';
import {
  BUILD_POLICIES, BUILD_PRESET_IDS, buildOrder, buildTargets, createBuildPolicy, type BuildParams,
} from '../simulation/build-policy.js';
import { modifiers, POLICY_IDS, createPolicy } from '../simulation/policies.js';
import { deriveBatchSeed, runCampaign } from '../simulation/runner.js';
import { runCli } from '../simulation/cli.js';
import { loadContentConfig } from './support/config.js';

const config = loadContentConfig('rules.experimental.json');
const FINAL = config.route.regularSegments;

function home(overrides: Partial<CampaignState> = {}): CampaignState {
  return { ...createCampaign({ seed: 7, birthSign: 'aries',
    playerName: { first: 'Test', last: 'Bot' }, scionName: 'Scion' }, config), ...overrides };
}
function decide(id: string, state: CampaignState, params: Partial<BuildParams> = {}, rules: RulesConfig = config) {
  return createBuildPolicy(id, rules, params).decide(state, getAvailableActions(state, rules),
    getDerivedStats(state, rules), getCalendar(state, rules));
}
const stats = (bellatores: number, oratores: number, laboratores: number) => ({ bellatores, oratores, laboratores });

describe('B1 build presets', () => {
  it('registers the §4 presets; secondary is the Estate the lead beats', () => {
    expect([...BUILD_PRESET_IDS].sort()).toEqual(['duo-b', 'duo-l', 'duo-o', 'even', 'hybrid-b', 'hybrid-l',
      'hybrid-o', 'spec-b', 'spec-l', 'spec-o', 'wealthy-l']);
    expect(Object.keys(BUILD_POLICIES)).toEqual([...BUILD_PRESET_IDS]);
    expect(buildOrder('bellatores', config)).toEqual(['bellatores', 'laboratores', 'oratores']);
    expect(buildOrder('oratores', config)).toEqual(['oratores', 'bellatores', 'laboratores']);
    expect(buildOrder('laboratores', config)).toEqual(['laboratores', 'oratores', 'bellatores']);
    const hybrid = createBuildPolicy('hybrid-b', config).params as BuildParams;
    expect(buildTargets(hybrid, config)).toEqual(stats(70, 30, 45));
    expect(buildTargets({ ...hybrid, endingFloor: 40 }, config)).toEqual(stats(70, 40, 45));
    expect(createBuildPolicy('wealthy-l', config).params).toMatchObject({ carryFailures: 10, useSkip: true });
  });

  it('validates parameters', () => {
    for (const bad of [{ mainTarget: -1 }, { carryFailures: 1.5 }, { survivalThreshold: 2 }, { tutorBudget: -5 },
      { lead: 'peasants' as never }]) {
      expect(() => createBuildPolicy('spec-b', config, bad)).toThrow(RangeError);
    }
  });
});

describe('B1 build policy decisions', () => {
  it('blocks the finale until targets are met, training the lowest current/target ratio', () => {
    // hybrid-b targets B70 L45 O30: Oratores is the only unmet target.
    const state = home({ furthestWaystation: FINAL, treasury: 300, stats: stats(100, 20, 45) });
    expect(decide('hybrid-b', state, { survivalThreshold: 0 })).toEqual({ type: 'TRAIN', tutor: 'hermit' });
    // Ratios: B 50/70, L 20/45 (lowest), O 25/30.
    expect(decide('hybrid-b', { ...state, stats: stats(50, 25, 20) }, { survivalThreshold: 0 }))
      .toEqual({ type: 'TRAIN', tutor: 'smuggler' });
    expect(decide('hybrid-b', { ...state, stats: stats(100, 30, 45) }, { survivalThreshold: 0 }).type)
      .toBe('BEGIN_PILGRIMAGE');
  });

  it('blocks the finale until every stat reaches endingFloor; ties go lead, secondary, third', () => {
    const state = home({ furthestWaystation: FINAL, treasury: 300, stats: stats(100, 20, 20) });
    expect(decide('spec-b', state, { survivalThreshold: 0 }).type).toBe('BEGIN_PILGRIMAGE');
    expect(decide('spec-b', state, { survivalThreshold: 0, endingFloor: 30 })).toEqual({ type: 'TRAIN', tutor: 'smuggler' });
    expect(decide('spec-b', { ...state, stats: stats(100, 30, 30) }, { survivalThreshold: 0, endingFloor: 30 }).type)
      .toBe('BEGIN_PILGRIMAGE');
  });

  it('keeps training past met targets lead-first, skipping target-0 stats, and departs when nothing is trainable', () => {
    const state = home({ furthestWaystation: FINAL, treasury: 300, stats: stats(80, 35, 50) });
    expect(decide('hybrid-b', state, { survivalThreshold: 1 })).toEqual({ type: 'TRAIN', tutor: 'hedge_knight' });
    expect(decide('hybrid-b', { ...state, stats: stats(100, 35, 50) }, { survivalThreshold: 1 }))
      .toEqual({ type: 'TRAIN', tutor: 'smuggler' });
    // spec-b never trains Oratores or Laboratores (targets 0).
    expect(decide('spec-b', { ...state, stats: stats(100, 0, 0) }, { survivalThreshold: 1 }).type).toBe('BEGIN_PILGRIMAGE');
    // A spent tutor budget also counts as nothing trainable.
    expect(decide('hybrid-b', state, { survivalThreshold: 1, tutorBudget: 0 }).type).toBe('BEGIN_PILGRIMAGE');
  });

  it('stops buying lessons once the tutor budget is spent', () => {
    const policy = createBuildPolicy('spec-b', config, { survivalThreshold: 1, tutorBudget: 20 });
    const state = home({ treasury: 300 });
    const act = () => policy.decide(state, getAvailableActions(state, config), getDerivedStats(state, config),
      getCalendar(state, config));
    expect(act()).toEqual({ type: 'TRAIN', tutor: 'hedge_knight' });
    expect(act().type).toBe('BEGIN_PILGRIMAGE'); // budget spent: nothing trainable, so she departs anyway
  });

  it('carries what she can when the wanted carry is unaffordable, and works when that is not enough', () => {
    // Fixed 50% odds, Laboratores only, no Purse Protection: each failure costs 15 carried Coin.
    const rules = withOverrides(config, { encounters: { successMin: 50, successMax: 50 } });
    const params = { lead: 'laboratores' as const, freeApproach: false, carryFailures: 5, survivalThreshold: 0.5 };
    const state = home({ elapsedWeeks: 1, stats: stats(20, 15, 0) });
    expect(decide('spec-l', { ...state, treasury: 85 }, params, rules)).toEqual({ type: 'BEGIN_PILGRIMAGE', carry: 75 });
    // 30 Coin covers two failures: P(at most 2 of 5) = 0.5.
    expect(decide('spec-l', { ...state, treasury: 40 }, params, rules)).toEqual({ type: 'BEGIN_PILGRIMAGE', carry: 30 });
    // 15 Coin covers one failure: 6/32 < 0.5, so she works rather than training.
    expect(decide('spec-l', { ...state, treasury: 25 }, params, rules).type).toBe('WORK');
  });

  it('chooses jobs by expected Coin, not success chance', () => {
    const state = home({ treasury: 0, stats: stats(60, 15, 15) });
    const derived = getDerivedStats(state, config);
    const value = (job: 'stables' | 'alehouse' | 'village_watch' | 'scriptorium') => {
      const def = config.jobs.definitions[job];
      const mod = modifiers(state, derived, job, 'job', config);
      const die = def.success.coinDie ? (def.success.coinDie + 1) / 2 : 0;
      return (jobSuccessChance(state, job, mod, config) ?? 100) * (def.success.coin + die) * mod.payoutPct;
    };
    const best = (['stables', 'alehouse', 'village_watch', 'scriptorium'] as const)
      .reduce((a, b) => (value(b) > value(a) ? b : a));
    expect(best).not.toBe('stables');
    expect(decide('spec-o', state)).toEqual({ type: 'WORK', job: best });
  });

  it('picks the best approach per card, and uses the New Moon skip below the threshold', () => {
    const newWeek = config.astrology.lunarPhaseByWeek.indexOf('new');
    const state = home({ phase: 'pilgrimage', elapsedWeeks: newWeek + 1, stats: stats(100, 0, 0), pilgrimage: {
      stage: 'choose_approach', segmentIndex: 3, encounterIndex: 0, carriedCoin: 40, departureCarriedCoin: 40,
      earnedCoin: 0, skipUsed: false, consumableUsed: false, isFinal: false, segmentEntryWeek: newWeek,
      currentThreat: 'oratores',
    } });
    expect(decide('spec-l', state)).toEqual({ type: 'CHOOSE_APPROACH', estate: 'bellatores' });
    expect(decide('spec-l', state, { freeApproach: false })).toEqual({ type: 'CHOOSE_APPROACH', estate: 'laboratores' });
    expect(decide('wealthy-l', state, { skipBelowPct: 100 })).toEqual({ type: 'SKIP_ENCOUNTER' });
    expect(decide('wealthy-l', state, { skipBelowPct: 0 })).toEqual({ type: 'CHOOSE_APPROACH', estate: 'bellatores' });
  });

  it('does not continue into the finale before targets are met', () => {
    const state = home({ phase: 'pilgrimage', elapsedWeeks: 10, stats: stats(100, 20, 20), pilgrimage: {
      stage: 'waystation_decision', segmentIndex: FINAL - 1, encounterIndex: 5, carriedCoin: 40,
      departureCarriedCoin: 40, earnedCoin: 0, skipUsed: false, consumableUsed: false, isFinal: false,
      segmentEntryWeek: 9,
    }, furthestWaystation: FINAL });
    expect(decide('spec-b', state, { survivalThreshold: 0 }).type).toBe('CONTINUE_SEGMENT');
    expect(decide('hybrid-b', state, { survivalThreshold: 0 }).type).toBe('RETURN_HOME');
  });

  it('every preset finishes strict campaigns, and every victory meets its targets and floor', () => {
    for (const id of BUILD_PRESET_IDS) {
      for (const endingFloor of [0, 30]) {
        const policy = createBuildPolicy(id, config, { endingFloor });
        const result = runCampaign({ seed: deriveBatchSeed(5, 'leo', 0), sign: 'leo', policy, config, strict: true });
        if (result.finalState.outcome !== 'victory') continue;
        const targets = buildTargets(policy.params as BuildParams, config);
        for (const estate of ['bellatores', 'oratores', 'laboratores'] as const) {
          expect(result.finalState.stats[estate], `${id} floor ${endingFloor}`).toBeGreaterThanOrEqual(targets[estate]);
        }
      }
    }
  });

  it('is selectable from the CLI by name but not part of --all-policies', () => {
    const out: string[] = [];
    const io = { stdout: (t: string) => out.push(t), stderr: (t: string) => out.push(t) };
    expect(runCli(['--policy', 'hybrid-o', '--birth-sign', 'leo'], io)).toBe(0);
    expect(out.join('\n')).toMatch(/^hybrid-o\s+leo\s+1\s/m);
    out.length = 0;
    expect(runCli(['--all-policies', '--birth-sign', 'leo'], io)).toBe(0);
    expect(out.join('\n')).not.toMatch(/hybrid-o/);
  });
});

describe('published policies are unchanged', () => {
  it('give identical campaign outcomes on fixed seeds (fixture generated on main before B1)', async () => {
    const rows = POLICY_IDS.flatMap((id) => (['aries', 'gemini'] as const).flatMap((sign) => [0, 1, 2].map((i) => {
      const seed = deriveBatchSeed(20261113, sign, i);
      const r = runCampaign({ seed, sign, policy: createPolicy(id, config), config });
      const s = r.finalState;
      return [id, sign, seed, s.outcome, s.elapsedWeeks, s.stats.bellatores, s.stats.oratores, s.stats.laboratores,
        s.treasury, r.decisions.length].join(',');
    })));
    await expect(rows.join('\n') + '\n').toMatchFileSnapshot('./fixtures/published-policies.csv');
  });
});
