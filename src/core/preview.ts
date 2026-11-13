/**
 * Pure, draw-free previews for the UI (docs/archive/ui-technical-plan.md §4.2).
 *
 * Previews never consume RNG and never reveal a roll: they report the
 * guaranteed outcome of tutors and rests, both branches of a job, and the
 * odds and failure cost of each encounter approach. Every number comes from
 * the same functions the reducer and pilgrimage state machine use.
 *
 * Not covered: deterministic pilgrimage exits (RETREAT, RETURN_HOME) draw no
 * RNG, so callers can preview them by dry-running `applyAction`.
 */

import { addBurden, collapseCause, purseProtectionPct, type CollapseCause } from './conditions.js';
import type { RulesConfig } from './config.js';
import {
  applyActivityDeltas,
  jobOutcomeDeltas,
  jobSuccessChance,
  resolveRest,
  resolveTutor,
  restCost,
  tutorCost,
  type ActivityDeltas,
} from './economy.js';
import { encounterOdds, failurePenalty, type EncounterOdds, type FailurePenalty } from './encounter.js';
import { segmentLunarPhase } from './pilgrimage.js';
import { homeModifiers, type HomeKind } from './reducer.js';
import {
  RuleError,
  type ActivityId,
  type CampaignState,
  type Estate,
  type GameAction,
  type ModifierSet,
} from './types.js';

export type { EncounterOdds, FailurePenalty } from './encounter.js';

export interface ActivityOutcome {
  /** Signed, clamped stat deltas. */
  stats: Record<Estate, number>;
  fatigue: number;
  melancholy: number;
  /** Treasury delta; `min === max` unless a coin die applies. */
  coin: { min: number; max: number };
  /** The collapse this outcome would cause, judged against the post-delta ceilings. */
  collapse: CollapseCause | null;
}

export interface HomePreview {
  activityId: ActivityId;
  kind: HomeKind;
  /** Modified fee (0 for jobs and convalescence). */
  cost: number;
  affordable: boolean;
  /** True when this REST is resolved as a forced convalescence week. */
  convalescence: boolean;
  /** `ModifierSet.sources`, e.g. ['solar:trine', 'lunar:waxing']. */
  modifiers: string[];
  /** Job success percent; null for automatic jobs (Stables), tutors and rests. */
  chance: number | null;
  /** The guaranteed outcome (tutor, rest, automatic job) or the job's success branch. */
  success: ActivityOutcome;
  /** Present only for jobs with a check. */
  failure?: ActivityOutcome;
}

export interface ApproachPreview {
  estate: Estate;
  odds: EncounterOdds;
  /** Carried Coin gained on success. */
  reward: { min: number; max: number };
  failure: FailurePenalty;
  /** Same test as the state machine: Coin cost above carried, or a burden reaching its ceiling. */
  failureWipesOut: boolean;
}

type HomeAction = Extract<GameAction, { type: 'TRAIN' | 'WORK' | 'REST' }>;

function outcome(state: CampaignState, deltas: ActivityDeltas, coinMax = deltas.treasury): ActivityOutcome {
  return {
    stats: { ...deltas.stats },
    fatigue: deltas.fatigue,
    melancholy: deltas.melancholy,
    coin: { min: deltas.treasury, max: coinMax },
    collapse: collapseCause(applyActivityDeltas(state, deltas)),
  };
}

function convalescencePreview(state: CampaignState, config: RulesConfig): HomePreview {
  const { recovery } = config.failure.homeCollapse;
  const deltas: ActivityDeltas = {
    stats: { bellatores: 0, oratores: 0, laboratores: 0 },
    fatigue: addBurden(state.fatigue, -recovery) - state.fatigue,
    melancholy: addBurden(state.melancholy, -recovery) - state.melancholy,
    treasury: 0,
  };
  return {
    activityId: 'rest_home', kind: 'rest', cost: 0, affordable: true, convalescence: true,
    modifiers: [], chance: null, success: outcome(state, deltas),
  };
}

/**
 * Preview of a TRAIN / WORK / REST action for this week. Unaffordable
 * activities are still previewed (with `affordable: false`) so the UI can
 * explain why they are disabled. Throws `RuleError` outside the home phase or
 * for unknown activity ids.
 */
export function previewHomeActivity(state: CampaignState, action: HomeAction, config: RulesConfig): HomePreview {
  if (state.phase !== 'home') {
    throw new RuleError('INVALID_PHASE', `previewHomeActivity: not at home (${state.phase})`);
  }
  if (state.pendingConvalescence !== undefined && action.type === 'REST' && action.rest === 'rest_home') {
    return convalescencePreview(state, config);
  }

  const base = { convalescence: false };
  switch (action.type) {
    case 'TRAIN': {
      const modifiers = homeModifiers(state, action.tutor, 'tutor', config);
      const cost = tutorCost(action.tutor, modifiers, config);
      const funded = { ...state, treasury: Math.max(state.treasury, cost) };
      const { deltas } = resolveTutor(funded, action.tutor, modifiers, state.rng, config);
      return {
        ...base, activityId: action.tutor, kind: 'tutor', cost, affordable: cost <= state.treasury,
        modifiers: [...modifiers.sources], chance: null, success: outcome(state, deltas),
      };
    }
    case 'REST': {
      const modifiers = homeModifiers(state, action.rest, 'rest', config);
      const cost = restCost(action.rest, modifiers, config);
      const funded = { ...state, treasury: Math.max(state.treasury, cost) };
      const { deltas } = resolveRest(funded, action.rest, modifiers, state.rng, config);
      return {
        ...base, activityId: action.rest, kind: 'rest', cost, affordable: cost <= state.treasury,
        modifiers: [...modifiers.sources], chance: null, success: outcome(state, deltas),
      };
    }
    case 'WORK':
      return jobPreview(state, action.job, homeModifiers(state, action.job, 'job', config), config);
    default:
      throw new RuleError('INVALID_ACTION', `previewHomeActivity: not a home activity`);
  }
}

function jobPreview(
  state: CampaignState, job: Extract<HomeAction, { type: 'WORK' }>['job'], modifiers: ModifierSet, config: RulesConfig,
): HomePreview {
  const chance = jobSuccessChance(state, job, modifiers, config);
  const die = config.jobs.definitions[job].success.coinDie;
  const low = jobOutcomeDeltas(state, job, true, die > 0 ? 1 : 0, modifiers, config);
  const high = jobOutcomeDeltas(state, job, true, die, modifiers, config);
  const preview: HomePreview = {
    activityId: job, kind: 'job', cost: 0, affordable: true, convalescence: false,
    modifiers: [...modifiers.sources], chance, success: outcome(state, low, high.treasury),
  };
  if (chance !== null) preview.failure = outcome(state, jobOutcomeDeltas(state, job, false, 0, modifiers, config));
  return preview;
}

/**
 * Odds and failure cost of each approach against the current threat. Valid at
 * `choose_approach`, or for the current approach at `reroll_or_accept`; throws
 * `RuleError` otherwise.
 */
export function previewApproaches(state: CampaignState, config: RulesConfig): ApproachPreview[] {
  const road = state.pilgrimage;
  if (state.phase !== 'pilgrimage' || road === undefined) {
    throw new RuleError('INVALID_PHASE', 'previewApproaches: not on a pilgrimage');
  }
  if (road.stage !== 'choose_approach' && road.stage !== 'reroll_or_accept') {
    throw new RuleError('INVALID_STAGE', `previewApproaches: no threat to face at stage ${road.stage}`);
  }
  const threat = road.currentThreat;
  if (threat === undefined) throw new Error('previewApproaches: no revealed threat');

  const lunar = segmentLunarPhase(state, config);
  const equipment = road.equipmentId === undefined ? {} : { equipmentId: road.equipmentId };
  let estates: readonly Estate[] = ['bellatores', 'oratores', 'laboratores'];
  if (road.stage === 'reroll_or_accept') {
    if (road.currentApproach === undefined) throw new Error('previewApproaches: no chosen approach');
    estates = [road.currentApproach];
  }
  return estates.map((estate) => {
    const odds = encounterOdds(
      { stat: state.stats[estate], approach: estate, threat, lunar, segmentIndex: road.segmentIndex,
        isFinal: road.isFinal, ...equipment },
      config,
    );
    const failure = failurePenalty(
      { approach: estate, lunar, ...equipment, purseProtectionPct: purseProtectionPct(state.stats) },
      config,
    );
    const failureWipesOut = failure.resource === 'coin'
      ? failure.amount > road.carriedCoin
      : failure.amount > 0
        && collapseCause({ ...state, [failure.resource]: state[failure.resource] + failure.amount }) !== null;
    return {
      estate, odds, reward: { min: 1, max: config.encounters.rewardCoinDie }, failure, failureWipesOut,
    };
  });
}
