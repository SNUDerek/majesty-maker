/** E3: deterministic policies using observable state and production rule math. */
import { type RulesConfig } from '../core/index.js';
import { applyModifier, collectModifiers } from '../core/astrology.js';
import { jobSuccessChance } from '../core/economy.js';
import { encounterOdds, failurePenalty } from '../core/encounter.js';
import type {
  ActivityId, AvailableAction, CampaignState, DerivedStats, Estate, GameAction,
  LunarPhase, ModifierContext, PilgrimageState,
} from '../core/types.js';
import type { Policy } from './runner.js';

export const POLICY_IDS = [
  'stables-only', 'specialist-b', 'specialist-o', 'specialist-l', 'balanced', 'reckless', 'pragmatic',
] as const;
export type PolicyId = typeof POLICY_IDS[number];
export interface PolicyParams {
  restMargin: number;
  departureStat: number;
  departureBurden: number;
  retreatMargin: number;
  trainingReserve: number;
  carryFailures: number;
  survivalThreshold: number;
  waningRestMinimum: number;
}
export const DEFAULT_POLICY_PARAMS: Readonly<PolicyParams> = Object.freeze({
  restMargin: 15, departureStat: 40, departureBurden: 15, retreatMargin: 20,
  trainingReserve: 40, carryFailures: 3, survivalThreshold: 0.65, waningRestMinimum: 10,
});
const ESTATES: readonly Estate[] = ['bellatores', 'oratores', 'laboratores'];
type Concrete = Exclude<AvailableAction, { type: 'BEGIN_PILGRIMAGE' }>;

function modifiers(state: CampaignState, derived: DerivedStats, activityId: ActivityId,
  kind: ModifierContext['kind'], config: RulesConfig) {
  return collectModifiers({
    activityId, kind, solar: derived.solarAspect, lunar: derived.lunarPhase,
    previousActivityId: state.lastWeeklyActivityId, waxingStreak: state.waxingStreak,
  }, config);
}

function lunar(road: PilgrimageState, config: RulesConfig): LunarPhase {
  return config.astrology.lunarPhaseByWeek[road.segmentEntryWeek % config.calendar.weeksPerMonth]!;
}

function bestApproach(state: CampaignState, road: PilgrimageState, threat: Estate,
  config: RulesConfig, specialist?: Estate): { estate: Estate; probability: number } {
  return (specialist ? [specialist] : ESTATES).map((estate) => ({
    estate, probability: encounterOdds({
      stat: state.stats[estate], approach: estate, threat, lunar: lunar(road, config),
      segmentIndex: road.segmentIndex, isFinal: road.isFinal, equipmentId: road.equipmentId,
    }, config).probability,
  })).sort((a, b) => b.probability - a.probability)[0]!;
}

function failureCapacity(state: CampaignState, derived: DerivedStats, road: PilgrimageState,
  estate: Estate, config: RulesConfig): number {
  const penalty = failurePenalty({
    approach: estate, lunar: lunar(road, config), equipmentId: road.equipmentId,
    purseProtectionPct: derived.purseProtectionPct,
  }, config);
  if (penalty.amount === 0) return Infinity;
  // Burden equality wipes out; spending exactly the remaining Coin is legal.
  const reserve = penalty.resource === 'coin' ? road.carriedCoin
    : penalty.resource === 'fatigue' ? derived.fatigueCeiling - state.fatigue - 1
      : derived.melancholyCeiling - state.melancholy - 1;
  return Math.max(0, Math.floor(reserve / penalty.amount));
}

/** Conservative binomial heuristic for the current segment, not hidden-deck lookahead.
 * Use weighted mean best odds and the smallest resource failure budget used by
 * those approaches. Ignore future rewards/items and treat every failure as
 * spending that bottleneck resource. Independent threat/check approximation.
 */
export function estimateSegmentSurvival(state: CampaignState, derived: DerivedStats,
  config: RulesConfig, road = state.pilgrimage): number {
  if (!road) throw new Error('Survival estimation requires a pilgrimage');
  const count = (road.isFinal ? config.route.finalEncounters : config.route.encountersPerSegment)
    - road.encounterIndex;
  if (count <= 0) return 1;
  let probability = 0;
  let weight = 0;
  let capacity = count;
  for (const threat of ESTATES) {
    const w = config.encounters.distribution[threat];
    if (w === 0) continue;
    const best = bestApproach(state, road, threat, config);
    probability += w * best.probability / 100;
    weight += w;
    capacity = Math.min(capacity, failureCapacity(state, derived, road, best.estate, config));
  }
  probability /= weight;
  // Distribution of failure counts, truncated at the conservative budget.
  let probabilities = [1];
  for (let i = 0; i < count; i++) {
    const next = Array<number>(Math.min(i + 1, capacity) + 1).fill(0);
    for (let j = 0; j < probabilities.length; j++) {
      next[j]! += probabilities[j]! * probability;
      if (j < capacity) next[j + 1]! += probabilities[j]! * (1 - probability);
    }
    probabilities = next;
  }
  return Math.min(1, probabilities.reduce((sum, p) => sum + p, 0));
}

/** Config is captured for rule math; params are copied, validated and recorded. */
export function createPolicy(id: PolicyId, config: RulesConfig,
  overrides: Partial<PolicyParams> = {}): Policy {
  if (!POLICY_IDS.includes(id)) throw new RangeError(`Unknown policy: ${id}`);
  const params = Object.freeze({ ...DEFAULT_POLICY_PARAMS, ...overrides });
  for (const [key, value] of Object.entries(params)) {
    if (!(key in DEFAULT_POLICY_PARAMS) || !Number.isFinite(value) || value < 0
      || (key === 'survivalThreshold' ? value > 1 : !Number.isSafeInteger(value))) {
      throw new RangeError(`Invalid policy parameter ${key}: ${value}`);
    }
  }
  const specialist = ({ 'specialist-b': 'bellatores', 'specialist-o': 'oratores',
    'specialist-l': 'laboratores' } as Partial<Record<PolicyId, Estate>>)[id];
  return {
    id, params,
    decide(state, available, derived, calendar) {
      const actions = available.filter((a): a is Concrete => a.type !== 'BEGIN_PILGRIMAGE');
      const rest = actions.find((a) => a.type === 'REST' && a.rest === 'rest_home');
      if (state.pendingConvalescence && rest) return rest;
      if (state.phase === 'pilgrimage') {
        const road = state.pilgrimage!;
        const consumable = actions.find((a) => a.type === 'USE_CONSUMABLE');
        if (consumable?.type === 'USE_CONSUMABLE') {
          const effect = config.items.catalog[consumable.itemId]!.effect;
          if (road.stage === 'reroll_or_accept'
            || (effect === 'reduce_fatigue' && state.fatigue >= params.restMargin)
            || (effect === 'reduce_melancholy' && state.melancholy >= params.restMargin)) return consumable;
        }
        const approach = actions.filter((a) => a.type === 'CHOOSE_APPROACH');
        if (approach.length) {
          const best = bestApproach(state, road, road.currentThreat!, config, specialist);
          return approach.find((a) => a.estate === best.estate)!;
        }
        const accept = actions.find((a) => a.type === 'ACCEPT_RESULT');
        if (accept) return accept;
        const continuation = actions.find((a) => a.type === 'CONTINUE_ENCOUNTER'
          || a.type === 'CONTINUE_SEGMENT');
        if (continuation) {
          const nextRoad = continuation.type === 'CONTINUE_SEGMENT' ? {
            ...road, segmentIndex: road.segmentIndex + 1, encounterIndex: 0,
            isFinal: road.segmentIndex + 1 === config.route.regularSegments,
            segmentEntryWeek: state.elapsedWeeks,
          } : road;
          const imminent = ESTATES.some((threat) => config.encounters.distribution[threat] > 0
            && failureCapacity(state, derived, nextRoad,
              bestApproach(state, nextRoad, threat, config, specialist).estate, config) === 0);
          const retreat = id === 'reckless' ? imminent : id === 'pragmatic'
            ? estimateSegmentSurvival(state, derived, config, nextRoad) < params.survivalThreshold
            : state.fatigue >= derived.fatigueCeiling - params.retreatMargin
              || state.melancholy >= derived.melancholyCeiling - params.retreatMargin;
          if (!retreat) return continuation;
        }
        const exit = actions.find((a) => a.type === 'RETURN_HOME' || a.type === 'RETREAT');
        if (exit) return exit;
      }
      const nearCeiling = state.fatigue >= derived.fatigueCeiling - params.restMargin
        || state.melancholy >= derived.melancholyCeiling - params.restMargin;
      if (rest && nearCeiling) return rest;
      if (id === 'stables-only') return actions.find((a) => a.type === 'WORK' && a.job === 'stables')!;
      // Prefer paid recovery during Waning, only when there is a useful burden to recover.
      if (id === 'pragmatic' && derived.lunarPhase === 'waning'
        && Math.max(state.fatigue, state.melancholy) >= params.waningRestMinimum) {
        const rests = actions.filter((a) => a.type === 'REST');
        rests.sort((a, b) => {
          const score = (a: typeof rests[number]) => {
            const def = config.rest[a.rest];
            const mod = modifiers(state, derived, a.rest, 'rest', config);
            return Math.min(state.fatigue, applyModifier(def.fatigue, mod, 'recoveryPct'))
              + Math.min(state.melancholy, applyModifier(def.melancholy, mod, 'recoveryPct'));
          };
          return score(b) - score(a);
        });
        if (rests[0]) return rests[0];
      }
      const departure = available.find((a) => a.type === 'BEGIN_PILGRIMAGE');
      if (departure?.type === 'BEGIN_PILGRIMAGE') {
        const target = id === 'reckless' ? departure.minCarry
          : Math.max(departure.minCarry, params.carryFailures * config.encounters.failurePenalty);
        const prepared = id === 'reckless' || (
          (specialist ? state.stats[specialist] : Math.min(...Object.values(state.stats))) >= params.departureStat
          && Math.max(state.fatigue, state.melancholy) <= params.departureBurden);
        if (prepared && departure.maxCarry >= target) {
          const equipmentId = departure.equipmentIds.find((item) => config.items.catalog[item]!.estate === specialist)
            ?? departure.equipmentIds[0];
          const consumableId = departure.consumableIds.find((item) =>
            config.items.catalog[item]!.effect === 'reroll_failed_check') ?? departure.consumableIds[0];
          const departureRoad: PilgrimageState = {
            stage: 'choose_approach', segmentIndex: state.furthestWaystation, encounterIndex: 0,
            isFinal: departure.isFinal, segmentEntryWeek: state.elapsedWeeks, carriedCoin: target,
            departureCarriedCoin: target, earnedCoin: 0, skipUsed: false, consumableUsed: false, equipmentId,
          };
          if (id !== 'pragmatic' || estimateSegmentSurvival(state, derived, config, departureRoad) >= params.survivalThreshold) {
            return { type: 'BEGIN_PILGRIMAGE', carry: target,
              ...(equipmentId ? { equipmentId } : {}), ...(consumableId ? { consumableId } : {}) };
          }
        }
      }
      const jobs = actions.filter((a) => a.type === 'WORK');
      const job = specialist ? jobs.find((a) => config.jobs.definitions[a.job].checkStat === specialist)!
        : [...jobs].sort((a, b) => {
          // Automatic Stables has 100% odds, and wins ties by action order.
          const chance = (a: typeof jobs[number]) => jobSuccessChance(state, a.job,
            modifiers(state, derived, a.job, 'job', config), config) ?? 100;
          return chance(b) - chance(a);
        })[0]!;
      if (id === 'reckless' || (id === 'pragmatic' && derived.solarAspect === 'trine')
        || state.treasury < params.trainingReserve) return job;
      const targetEstate = specialist ?? [...ESTATES].sort((a, b) => state.stats[a] - state.stats[b])[0]!;
      const tutor = actions.find((a) => a.type === 'TRAIN' && config.classes.tutors[a.tutor].target === targetEstate);
      if (tutor && state.stats[targetEstate] < config.startingState.statMax) return tutor;
      if (job) return job;
      if (rest) return rest;
      throw new Error(`Policy ${id} has no legal action at week ${calendar.weeksRemaining}`);
    },
  };
}

export function createPolicies(config: RulesConfig, params: Partial<PolicyParams> = {}): Policy[] {
  return POLICY_IDS.map((id) => createPolicy(id, config, params));
}

/** Builds a fresh policy for the loaded rules config; per-run state (if any) must live in the returned object. */
export type PolicyFactory = (config: RulesConfig) => Policy;

/** Registered policies, keyed by the id used with `--policy`. */
export const POLICIES: Readonly<Record<string, PolicyFactory>> = Object.freeze(Object.fromEntries(
  POLICY_IDS.map((id) => [id, (config: RulesConfig) => createPolicy(id, config)]),
));
