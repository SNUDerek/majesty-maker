/**
 * B1 (docs/balance-testing.md §4): one parametrised "build" policy for balance testing.
 *
 * Three concerns are kept separate:
 *  1. Build targets: minimum stats for the lead, the Estate the lead beats
 *     (secondary) and the remaining Estate (third), plus `endingFloor` for
 *     every stat. Targets and the floor are hard requirements for the finale.
 *  2. Departure readiness: the survival estimate, burdens and Coin.
 *  3. Coin budget: carry enough Laboratores failures, plus the New Moon skip fee.
 *
 * Jobs are chosen by expected value: Coin, plus any stat gain the build wants,
 * priced at what a lesson charges per point.
 *
 * The seven published policies in policies.ts are unchanged; these presets
 * sit beside them so old reports stay reproducible.
 */
import type { RulesConfig } from '../core/index.js';
import { applyModifier } from '../core/astrology.js';
import { jobSuccessChance, tutorCost } from '../core/economy.js';
import { failurePenalty } from '../core/encounter.js';
import type {
  AvailableAction, CampaignState, DerivedStats, Estate, GameAction, PilgrimageState,
} from '../core/types.js';
import { bestApproach, estimateSegmentSurvival, modifiers } from './policies.js';
import type { Policy } from './runner.js';
import type { PolicyFactory } from './policies.js';

const ESTATES: readonly Estate[] = ['bellatores', 'oratores', 'laboratores'];
type Concrete = Exclude<AvailableAction, { type: 'BEGIN_PILGRIMAGE' }>;

export type BuildParams = {
  lead: Estate;
  /** Minimum stats; 0 means "never train this stat" (unless `endingFloor` requires it). */
  mainTarget: number;
  secondaryTarget: number;
  thirdTarget: number;
  /** S2: every stat must reach this before the finale; 0 = off. */
  endingFloor: number;
  /** Laboratores failures to carry Coin for. */
  carryFailures: number;
  /** Total tutor Coin she may spend in a campaign; null = unlimited (budget-matched builds). */
  tutorBudget: number | null;
  /** Pick the best approach per card; false restricts her to the lead. */
  freeApproach: boolean;
  /** Take the New Moon skip when the card's best odds are below `skipBelowPct`. */
  useSkip: boolean;
  skipBelowPct: number;
  survivalThreshold: number;
  departureBurden: number;
  restMargin: number;
};

export const DEFAULT_BUILD_PARAMS: Readonly<Omit<BuildParams, 'lead' | 'mainTarget' | 'secondaryTarget' | 'thirdTarget'>>
  = Object.freeze({
    endingFloor: 0, carryFailures: 3, tutorBudget: null, freeApproach: true, useSkip: false, skipBelowPct: 50,
    survivalThreshold: 0.65, departureBurden: 15, restMargin: 15,
  });

const LEADS = { b: 'bellatores', o: 'oratores', l: 'laboratores' } as const;
type Shape = [main: number, secondary: number, third: number];
const SHAPES: Record<string, Shape> = { spec: [100, 0, 0], duo: [80, 60, 0], hybrid: [70, 45, 30] };

/** §4 presets: spec/duo/hybrid per lead, `even` and `wealthy-l`. */
export const BUILD_PRESETS: Readonly<Record<string, Partial<BuildParams> & Pick<BuildParams,
  'lead' | 'mainTarget' | 'secondaryTarget' | 'thirdTarget'>>> = Object.freeze({
  ...Object.fromEntries(Object.entries(SHAPES).flatMap(([shape, [main, secondary, third]]) =>
    Object.entries(LEADS).map(([key, lead]) => [`${shape}-${key}`,
      { lead, mainTarget: main, secondaryTarget: secondary, thirdTarget: third }]))),
  even: { lead: 'bellatores', mainTarget: 60, secondaryTarget: 60, thirdTarget: 60 },
  'wealthy-l': { lead: 'laboratores', mainTarget: 100, secondaryTarget: 0, thirdTarget: 0, carryFailures: 10, useSkip: true },
});
export const BUILD_PRESET_IDS = Object.freeze(Object.keys(BUILD_PRESETS));

export function validateBuildParams(params: BuildParams): void {
  if (!ESTATES.includes(params.lead)) throw new RangeError(`Invalid lead: ${params.lead}`);
  for (const key of ['mainTarget', 'secondaryTarget', 'thirdTarget', 'endingFloor', 'carryFailures',
    'skipBelowPct', 'departureBurden', 'restMargin'] as const) {
    if (!Number.isSafeInteger(params[key]) || params[key] < 0) throw new RangeError(`Invalid ${key}: ${params[key]}`);
  }
  if (params.tutorBudget !== null && (!Number.isSafeInteger(params.tutorBudget) || params.tutorBudget < 0)) {
    throw new RangeError(`Invalid tutorBudget: ${params.tutorBudget}`);
  }
  if (!(params.survivalThreshold >= 0 && params.survivalThreshold <= 1)) {
    throw new RangeError(`Invalid survivalThreshold: ${params.survivalThreshold}`);
  }
}

/** Lead, the Estate she beats (secondary), then the remaining Estate. */
export function buildOrder(lead: Estate, config: RulesConfig): [Estate, Estate, Estate] {
  const secondary = config.encounters.beats[lead];
  return [lead, secondary, ESTATES.find((e) => e !== lead && e !== secondary)!];
}

/** Effective minimum per Estate: max(target, endingFloor). */
export function buildTargets(params: BuildParams, config: RulesConfig): Record<Estate, number> {
  const [main, secondary, third] = buildOrder(params.lead, config);
  const floor = params.endingFloor;
  return {
    [main]: Math.max(params.mainTarget, floor),
    [secondary]: Math.max(params.secondaryTarget, floor),
    [third]: Math.max(params.thirdTarget, floor),
  } as Record<Estate, number>;
}

/**
 * Creates a build policy. It keeps one piece of per-run state (tutor Coin spent,
 * for `tutorBudget`), so create one policy per campaign.
 */
export function createBuildPolicy(id: string, config: RulesConfig, overrides: Partial<BuildParams> = {}): Policy {
  const preset = BUILD_PRESETS[id];
  const params: BuildParams = Object.freeze({ ...DEFAULT_BUILD_PARAMS, ...preset, ...overrides } as BuildParams);
  validateBuildParams(params);
  const order = buildOrder(params.lead, config);
  const targets = buildTargets(params, config);
  const approachLimit = params.freeApproach ? undefined : params.lead;
  let tutorSpent = 0;

  const targetsMet = (state: CampaignState) => ESTATES.every((e) => state.stats[e] >= targets[e]);

  /** Lowest current/target ratio among unmet targets; when all are met, lead → secondary → third past them. */
  const trainingChoice = (state: CampaignState, derived: DerivedStats, actions: readonly Concrete[]):
    Concrete | undefined => {
    const tutors = new Map<Estate, Concrete>();
    for (const a of actions) {
      if (a.type !== 'TRAIN') continue;
      const estate = config.classes.tutors[a.tutor].target;
      const cost = tutorCost(a.tutor, modifiers(state, derived, a.tutor, 'tutor', config), config);
      if (state.stats[estate] >= config.startingState.statMax || cost > state.treasury) continue;
      if (params.tutorBudget !== null && tutorSpent + cost > params.tutorBudget) continue;
      tutors.set(estate, a);
    }
    const unmet = order.filter((e) => targets[e] > 0 && state.stats[e] < targets[e] && tutors.has(e));
    if (unmet.length) {
      const ratio = (e: Estate) => state.stats[e] / targets[e];
      return tutors.get([...unmet].sort((a, b) => ratio(a) - ratio(b))[0]!);
    }
    const past = order.find((e) => targets[e] > 0 && tutors.has(e));
    return past ? tutors.get(past) : undefined;
  };

  /** Anything left to train (ignoring Coin on hand): a stat below the cap with a positive target, within budget. */
  const canStillTrain = (state: CampaignState) => {
    if (params.tutorBudget !== null) {
      const cheapest = Math.min(...Object.values(config.classes.tutors).map((t) => t.cost));
      if (tutorSpent + cheapest > params.tutorBudget) return false;
    }
    return order.some((e) => targets[e] > 0 && state.stats[e] < config.startingState.statMax);
  };

  /** Coin she wants on the road: Laboratores failures (if she may use them) plus the skip fee. */
  const wantedCarry = (derived: DerivedStats): number => {
    let carry = 0;
    if (params.freeApproach || params.lead === 'laboratores') {
      carry += params.carryFailures * failurePenalty({
        approach: 'laboratores', lunar: derived.lunarPhase, purseProtectionPct: derived.purseProtectionPct,
      }, config).amount;
    }
    const fee = config.astrology.newMoon.skipFee;
    if (params.useSkip && derived.lunarPhase === 'new' && fee !== null) carry += fee;
    return carry;
  };

  const departureRoad = (state: CampaignState, isFinal: boolean, carry: number): PilgrimageState => ({
    stage: 'choose_approach', segmentIndex: state.furthestWaystation, encounterIndex: 0, isFinal,
    segmentEntryWeek: state.elapsedWeeks, carriedCoin: carry, departureCarriedCoin: carry, earnedCoin: 0,
    skipUsed: false, consumableUsed: false,
  });

  const survival = (state: CampaignState, derived: DerivedStats, road: PilgrimageState) =>
    estimateSegmentSurvival(state, derived, config, road, approachLimit);

  const expectedCoin = (state: CampaignState, derived: DerivedStats, job: Extract<Concrete, { type: 'WORK' }>) => {
    const def = config.jobs.definitions[job.job];
    const mod = modifiers(state, derived, job.job, 'job', config);
    const chance = jobSuccessChance(state, job.job, mod, config) ?? 100;
    const avgDie = def.success.coinDie > 0 ? (def.success.coinDie + 1) / 2 : 0;
    // A wanted stat point is worth what a lesson charges per point (20 Coin / 5 by default).
    const gained = def.success.gainStat;
    const tutor = Object.values(config.classes.tutors).find((t) => t.target === gained)!;
    const wanted = targets[gained] > 0 && state.stats[gained] < config.startingState.statMax;
    const statValue = wanted ? def.success.gain * mod.statGainPct / 100 * tutor.cost / tutor.gain : 0;
    return chance / 100 * ((def.success.coin + avgDie) * mod.payoutPct / 100 + statValue);
  };

  const policy: Policy = {
    id, params,
    decide(state, available, derived): GameAction {
      const actions = available.filter((a): a is Concrete => a.type !== 'BEGIN_PILGRIMAGE');
      const homeRest = actions.find((a) => a.type === 'REST' && a.rest === 'rest_home');
      if (state.pendingConvalescence && homeRest) return homeRest;

      if (state.phase === 'pilgrimage') {
        const road = state.pilgrimage!;
        if (actions.some((a) => a.type === 'CHOOSE_APPROACH')) {
          const best = bestApproach(state, road, road.currentThreat!, config, approachLimit);
          const skip = actions.find((a) => a.type === 'SKIP_ENCOUNTER');
          if (skip && params.useSkip && best.probability < params.skipBelowPct) return skip;
          return { type: 'CHOOSE_APPROACH', estate: best.estate };
        }
        const accept = actions.find((a) => a.type === 'ACCEPT_RESULT');
        if (accept) return accept;
        const continuation = actions.find((a) => a.type === 'CONTINUE_ENCOUNTER' || a.type === 'CONTINUE_SEGMENT');
        if (continuation) {
          const nextRoad = continuation.type === 'CONTINUE_SEGMENT' ? {
            ...road, segmentIndex: road.segmentIndex + 1, encounterIndex: 0,
            isFinal: road.segmentIndex + 1 === config.route.regularSegments, segmentEntryWeek: state.elapsedWeeks,
          } : road;
          const finaleBlocked = continuation.type === 'CONTINUE_SEGMENT' && nextRoad.isFinal
            && !targetsMet(state) && canStillTrain(state);
          if (!finaleBlocked && survival(state, derived, nextRoad) >= params.survivalThreshold) return continuation;
        }
        const exit = actions.find((a) => a.type === 'RETURN_HOME' || a.type === 'RETREAT');
        if (exit) return exit;
        throw new Error(`Build policy ${id} has no pilgrimage action at stage ${road.stage}`);
      }

      const nearCeiling = state.fatigue >= derived.fatigueCeiling - params.restMargin
        || state.melancholy >= derived.melancholyCeiling - params.restMargin;
      if (homeRest && nearCeiling) return homeRest;

      const departure = available.find((a): a is Extract<AvailableAction, { type: 'BEGIN_PILGRIMAGE' }> =>
        a.type === 'BEGIN_PILGRIMAGE');
      const isFinal = departure?.isFinal
        ?? state.furthestWaystation === config.route.regularSegments;
      const want = wantedCarry(derived);
      // Stat readiness assumes a rested scion with the full wanted purse, so neither burdens nor
      // lack of Coin read as lack of skill (otherwise she buys lessons while tired, adding burden).
      const restedState = { ...state, fatigue: 0, melancholy: 0 };
      const statReady = (survival(restedState, derived, departureRoad(state, isFinal, want)) >= params.survivalThreshold
        && (!isFinal || targetsMet(state))) || !canStillTrain(state);
      const rested = Math.max(state.fatigue, state.melancholy) <= params.departureBurden;
      const fee = config.route.departureFee;

      if (statReady && departure) {
        const carry = Math.min(want, departure.maxCarry);
        const coinReady = carry === want
          || survival(state, derived, departureRoad(state, isFinal, carry)) >= params.survivalThreshold;
        if (coinReady && rested) return { type: 'BEGIN_PILGRIMAGE', carry };
        if (coinReady && !rested) {
          // Best recovery she can buy without dropping below the departure need.
          const spare = state.treasury - fee - carry;
          const rests = actions.filter((a): a is Extract<Concrete, { type: 'REST' }> => a.type === 'REST'
            && applyModifier(config.rest[a.rest].cost, modifiers(state, derived, a.rest, 'rest', config), 'costPct') <= spare);
          const score = (a: Extract<Concrete, { type: 'REST' }>) => {
            const mod = modifiers(state, derived, a.rest, 'rest', config);
            return Math.min(state.fatigue, applyModifier(config.rest[a.rest].fatigue, mod, 'recoveryPct'))
              + Math.min(state.melancholy, applyModifier(config.rest[a.rest].melancholy, mod, 'recoveryPct'));
          };
          const best = rests.sort((a, b) => score(b) - score(a))[0] ?? homeRest;
          if (best) return best;
        }
      }

      const jobs = actions.filter((a): a is Extract<Concrete, { type: 'WORK' }> => a.type === 'WORK');
      const job = [...jobs].sort((a, b) => expectedCoin(state, derived, b) - expectedCoin(state, derived, a))[0];
      // Ready apart from Coin: work instead of buying lessons.
      if (!statReady) {
        const lesson = trainingChoice(state, derived, actions);
        if (lesson?.type === 'TRAIN') {
          tutorSpent += tutorCost(lesson.tutor,
            modifiers(state, derived, lesson.tutor, 'tutor', config), config);
          return lesson;
        }
      }
      if (job) return job;
      if (homeRest) return homeRest;
      throw new Error(`Build policy ${id} has no legal home action at week ${state.elapsedWeeks}`);
    },
  };
  return policy;
}

/** Registered build presets, keyed by `--policy` id. */
export const BUILD_POLICIES: Readonly<Record<string, PolicyFactory>> = Object.freeze(Object.fromEntries(
  BUILD_PRESET_IDS.map((id) => [id, (config: RulesConfig) => createBuildPolicy(id, config)]),
));
