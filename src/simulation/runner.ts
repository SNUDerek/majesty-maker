/** E1: deterministic campaign execution and paired batch seeds. */
import { createHash } from 'node:crypto';
import {
  applyAction, createCampaign, getAvailableActions, getCalendar, getDerivedStats,
  type AvailableAction, type CalendarInfo, type CampaignState, type DerivedStats,
  type GameAction, type GameEvent, type RulesConfig, type ZodiacSign,
} from '../core/index.js';
import { collectModifiers } from '../core/astrology.js';
import { jobSuccessChance } from '../core/economy.js';
import { encounterOdds } from '../core/encounter.js';
import { assertInvariants } from '../tests/invariants.js';

export interface Policy {
  id: string;
  params: Readonly<Record<string, unknown>>;
  /** Use observable information only; never inspect RNG streams or predict unseen draws. */
  decide(
    state: CampaignState, available: readonly AvailableAction[],
    derived: DerivedStats, calendar: CalendarInfo,
  ): GameAction;
}

export interface Decision {
  /** Zero-based action index; several pilgrimage decisions can share a week. */
  step: number;
  week: number;
  action: GameAction;
  /** Pre-roll success percent; 100 for Stables, null when no check occurs. */
  probability: number | null;
  /** Half-open range into the returned events array. */
  eventStart: number;
  eventEnd: number;
  /** Included only with trace: true. */
  before?: CampaignState;
  after?: CampaignState;
}

export interface RunCampaignOptions {
  seed: number;
  sign: ZodiacSign;
  policy: Policy;
  config: RulesConfig;
  trace?: boolean;
  strict?: boolean;
  maxSteps?: number;
}

export interface CampaignResult {
  finalState: CampaignState;
  events: GameEvent[];
  decisions: Decision[];
}

/** SHA-256 of the JSON tuple, first four bytes as a big-endian uint32.
 * Policy is deliberately absent so comparisons use paired seeds.
 */
export function deriveBatchSeed(baseSeed: number, sign: ZodiacSign, runIndex: number): number {
  if (!Number.isSafeInteger(baseSeed)) throw new RangeError('baseSeed must be a safe integer');
  if (!Number.isSafeInteger(runIndex) || runIndex < 0) {
    throw new RangeError('runIndex must be a non-negative safe integer');
  }
  return createHash('sha256').update(JSON.stringify([baseSeed, sign, runIndex])).digest().readUInt32BE(0);
}

/** Compute diagnostics before applyAction, without consuming any RNG. */
function preRollProbability(state: CampaignState, action: GameAction, config: RulesConfig): number | null {
  if (action.type === 'WORK') {
    const derived = getDerivedStats(state, config);
    const modifiers = collectModifiers({
      activityId: action.job, kind: 'job', solar: derived.solarAspect, lunar: derived.lunarPhase,
      previousActivityId: state.lastWeeklyActivityId, waxingStreak: state.waxingStreak,
    }, config);
    return jobSuccessChance(state, action.job, modifiers, config) ?? 100;
  }
  const road = state.pilgrimage;
  const isReroll = action.type === 'USE_CONSUMABLE' && road?.stage === 'reroll_or_accept';
  if (road && (action.type === 'CHOOSE_APPROACH' || isReroll)) {
    const approach = action.type === 'CHOOSE_APPROACH' ? action.estate : road.currentApproach;
    if (approach !== undefined && road.currentThreat !== undefined) {
      return encounterOdds({
        stat: state.stats[approach], approach, threat: road.currentThreat,
        lunar: getCalendar({ ...state, elapsedWeeks: road.segmentEntryWeek }, config).lunarPhase,
        segmentIndex: road.segmentIndex, isFinal: road.isFinal, equipmentId: road.equipmentId,
      }, config).probability;
    }
  }
  return null;
}

/** Run to victory/deadline, throwing on policy errors, dead ends or the safety cap.
 * Policies receive copies so accidental mutations cannot change the campaign.
 * Events and compact decisions are always retained; trace adds state snapshots.
 */
export function runCampaign(options: RunCampaignOptions): CampaignResult {
  const { seed, sign, policy, config, strict = false, trace = false } = options;
  // Each segment spends a week; allow reveal/approach/reroll/consumable/continue
  // per encounter plus departure, recovery and waystation decisions.
  const maxSteps = options.maxSteps ?? config.calendar.totalWeeks
    * (5 * Math.max(config.route.encountersPerSegment, config.route.finalEncounters) + 12);
  if (!Number.isSafeInteger(maxSteps) || maxSteps <= 0) {
    throw new RangeError('maxSteps must be a positive safe integer');
  }
  const events: GameEvent[] = [];
  const decisions: Decision[] = [];
  let state = createCampaign({
    seed, birthSign: sign, playerName: { first: 'Simulation', last: 'Runner' }, scionName: 'Scion',
  }, config);
  try {
    if (strict) assertInvariants(state, config);
    while (state.phase !== 'victory' && state.phase !== 'defeat') {
      if (decisions.length >= maxSteps) throw new Error(`Safety cap of ${maxSteps} steps reached`);
      const available = getAvailableActions(state, config);
      if (available.length === 0) throw new Error('Nonterminal campaign has no available actions');
      const action = structuredClone(policy.decide(
        structuredClone(state), available, getDerivedStats(state, config), getCalendar(state, config),
      ));
      const probability = preRollProbability(state, action, config);
      const result = applyAction(state, action, config);
      if (strict) assertInvariants(result.state, config, state);
      const decision: Decision = {
        step: decisions.length, week: state.elapsedWeeks, action, probability,
        eventStart: events.length, eventEnd: events.length + result.events.length,
      };
      if (trace) {
        decision.before = structuredClone(state);
        decision.after = structuredClone(result.state);
      }
      decisions.push(decision);
      events.push(...result.events);
      state = result.state;
    }
  } catch (error) {
    throw new Error(
      `Campaign policy=${policy.id} seed=${seed} sign=${sign} step=${decisions.length} week=${state.elapsedWeeks}: `
      + (error instanceof Error ? error.message : String(error)),
      { cause: error },
    );
  }
  return { finalState: state, events, decisions };
}
