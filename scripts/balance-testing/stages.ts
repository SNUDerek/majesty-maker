/**
 * B3: experiment stages from docs/balance-testing.md §5 (stages 0 and 1).
 *
 * A task is one config × one policy, run for every sign on paired batch seeds.
 * Every config sits over the experimental baseline (content/rules.experimental.json).
 */
import { readFileSync } from 'node:fs';
import { hashConfig, loadConfig, type RulesConfig } from '../../src/core/config.js';
import type { Estate, ZodiacSign } from '../../src/core/types.js';
import { balanceRecord, type BalanceRecord } from '../../src/simulation/balance-metrics.js';
import { BUILD_PRESET_IDS, createBuildPolicy, type BuildParams } from '../../src/simulation/build-policy.js';
import { createPolicy, POLICY_IDS, type PolicyId } from '../../src/simulation/policies.js';
import { deriveBatchSeed, runCampaign } from '../../src/simulation/runner.js';

export const SEARCH_SEED = 20261113;
export const SIGNS: readonly ZodiacSign[] = ['aries', 'taurus', 'gemini', 'cancer', 'leo', 'virgo', 'libra', 'scorpio',
  'sagittarius', 'capricorn', 'aquarius', 'pisces'];
const CONTENT = new URL('../../content/', import.meta.url);
const json = (path: string): unknown => JSON.parse(readFileSync(new URL(path, CONTENT), 'utf8'));

export interface ConfigSpec { name: string; overlays: readonly string[] }
export interface PolicySpec {
  name: string;
  kind: 'published' | 'build';
  id: string;
  lead: Estate | null;
  overrides?: Partial<BuildParams>;
}

export const BASELINE: ConfigSpec = { name: 'baseline', overlays: ['rules.experimental.json'] };
const E = 'experiments/balance/';
/** Stage 1: opposing loss {1, 0} × disadvantage {75, 60, 50}. */
export const STAGE1_CONFIGS: readonly ConfigSpec[] = [
  BASELINE,
  ...[['opp1', []], ['opp0', [`${E}s3-opp0.json`]]].flatMap(([opp, s3]) =>
    [['75', []], ['60', [`${E}s4-dis60.json`]], ['50', [`${E}s4-dis50.json`]]].map(([dis, s4]) => ({
      name: `${opp}-dis${dis}`, overlays: ['rules.experimental.json', ...(s3 as string[]), ...(s4 as string[])],
    }))).filter((c) => c.name !== 'opp1-dis75'),
];

export function loadStageConfig(spec: ConfigSpec): RulesConfig {
  return loadConfig({ rules: json('rules.legacy.json'), items: json('items.json'), variants: spec.overlays.map(json) });
}

const LEAD_KEYS: Record<string, Estate> = { b: 'bellatores', o: 'oratores', l: 'laboratores' };
const presetLead = (id: string): Estate => (id === 'even' ? 'bellatores' : LEAD_KEYS[id.slice(-1)]!);

export const PRESET_SPECS: readonly PolicySpec[] = BUILD_PRESET_IDS.map((id) =>
  ({ name: id, kind: 'build', id, lead: presetLead(id) }));

export const PUBLISHED_SPECS: readonly PolicySpec[] = POLICY_IDS.map((id) => ({
  name: id, kind: 'published', id,
  lead: ({ 'specialist-b': 'bellatores', 'specialist-o': 'oratores', 'specialist-l': 'laboratores' } as
    Partial<Record<PolicyId, Estate>>)[id] ?? null,
}));

export const ENDING_FLOORS = [20, 30, 40] as const;
/** S2 deliberate price: spec/duo/hybrid with endingFloor X (compare against the same preset at floor 0). */
export const FLOOR_SPECS: readonly PolicySpec[] = PRESET_SPECS
  .filter((p) => /^(spec|duo|hybrid)-/.test(p.id))
  .flatMap((p) => ENDING_FLOORS.map((floor) => ({ ...p, name: `${p.id}@floor${floor}`, overrides: { endingFloor: floor } })));

/**
 * Budget-matched builds (§4): the same tutor Coin cap, shaped all-in-main or split.
 * Lessons are 20 Coin and +5 under the flat tutor rule, so a target is 15 + 5 × lessons.
 * 500 Coin is not used: an all-in-main build saturates at about 16 lessons (stat 100).
 */
export const BUDGETS = [200, 300] as const;
export const BUDGET_SHAPES: Readonly<Record<string, Record<(typeof BUDGETS)[number], [number, number, number]>>> = {
  pure: { 200: [10, 0, 0], 300: [15, 0, 0] },
  split: { 200: [7, 3, 0], 300: [10, 5, 0] },
  tri: { 200: [6, 2, 2], 300: [9, 3, 3] },
};
export const BUDGET_SPECS: readonly PolicySpec[] = Object.entries(LEAD_KEYS).flatMap(([key, lead]) =>
  BUDGETS.flatMap((budget) => Object.entries(BUDGET_SHAPES).map(([shape, lessons]) => {
    const [main, secondary, third] = lessons[budget].map((k) => (k === 0 ? 0 : 15 + 5 * k));
    return {
      name: `budget-${key}-${budget}-${shape}`, kind: 'build' as const, id: `spec-${key}`, lead,
      overrides: { mainTarget: main!, secondaryTarget: secondary!, thirdTarget: third!, tutorBudget: budget },
    };
  })));

export interface Task { config: ConfigSpec; policy: PolicySpec }

export function stagePlan(stage: 0 | 1): Task[] {
  if (stage === 0) {
    return [...PUBLISHED_SPECS, ...PRESET_SPECS, ...FLOOR_SPECS, ...BUDGET_SPECS].map((policy) => ({ config: BASELINE, policy }));
  }
  return STAGE1_CONFIGS.filter((c) => c !== BASELINE)
    .flatMap((config) => [...PRESET_SPECS, ...BUDGET_SPECS].map((policy) => ({ config, policy })));
}

export function findTask(stage: 0 | 1, configName: string, policyName: string): Task {
  const task = stagePlan(stage).find((t) => t.config.name === configName && t.policy.name === policyName);
  if (!task) throw new Error(`no stage ${stage} task ${configName}/${policyName}`);
  return task;
}

export function runTask(task: Task, options: { runs: number; seed: number; strict: boolean; signs?: readonly ZodiacSign[] },
  config = loadStageConfig(task.config)): BalanceRecord[] {
  const { policy: spec } = task;
  const records: BalanceRecord[] = [];
  for (const sign of options.signs ?? SIGNS) {
    for (let i = 0; i < options.runs; i++) {
      const seed = deriveBatchSeed(options.seed, sign, i);
      const policy = spec.kind === 'published' ? createPolicy(spec.id as PolicyId, config)
        : createBuildPolicy(spec.id, config, spec.overrides);
      const result = runCampaign({ seed, sign, policy, config, strict: options.strict });
      records.push(balanceRecord(result.events, result.finalState,
        { policy: spec.name, config: task.config.name, seed, birthSign: sign, lead: spec.lead }));
    }
  }
  return records;
}

export function configIds(stage: 0 | 1): Record<string, string> {
  const configs = stage === 0 ? [BASELINE] : STAGE1_CONFIGS;
  return Object.fromEntries(configs.map((c) => [c.name, hashConfig(loadStageConfig(c))]));
}
