/**
 * Home activity resolution: tutors, jobs and rest (tech §5; implementation task A4).
 *
 * Each resolver is pure. It takes the current state, the chosen activity, the
 * astrology `ModifierSet` for this week (from `collectModifiers`), the RNG
 * streams and the rules config, and returns the clamped deltas, trace events
 * and next RNG streams. Resolvers do not advance the week, record the last
 * activity, or handle collapse; the reducer (C1) does that after applying the
 * deltas.
 *
 * Order (tech §5):
 *  1. Affordability is checked first, so an unaffordable activity throws
 *     `INSUFFICIENT_FUNDS` before any RNG draw.
 *  2. Jobs roll d100 against `clamp(stat + baseSuccessBonus + successBonusPts,
 *     successMin, successMax)` on the `jobs` stream; a job without a check stat
 *     (Stables) succeeds automatically without drawing.
 *  3. Decision (A4): a job's extra Coin die (Alehouse d10) is drawn only on
 *     success, after the d100, on the `jobs` stream. Failure pays nothing, so
 *     drawing the die would only shift later job rolls.
 *  4. Every modified quantity uses `applyModifier`, which multiplies all of its
 *     integer-percentage factors and floors once. Decrements (fees, opposing
 *     stat loss, rest recovery) are computed as non-negative magnitudes, floored,
 *     then subtracted.
 *  5. Results are clamped against the current state: stats to
 *     [statMin, statMax], burdens at 0, treasury to [0, treasuryMax]. Deltas and
 *     event amounts are the changes actually applied.
 *
 * The tutor's opposing-stat loss is not modified by astrology: §6 only modifies
 * tutor stat gain and tutor-generated Melancholy.
 */

import { applyModifier } from './astrology.js';
import { addBurden, clampStat, clampTreasury } from './conditions.js';
import type { RulesConfig } from './config.js';
import { d100, drawFrom, rollInt, type RngStreams } from './rng.js';
import {
  RuleError,
  type BurdenSource,
  type CampaignState,
  type CoinSource,
  type Estate,
  type GameEvent,
  type JobId,
  type ModifierSet,
  type RestId,
  type StatSource,
  type TutorId,
} from './types.js';

/** Signed, already-clamped changes to apply to the state. */
export interface ActivityDeltas {
  stats: Record<Estate, number>;
  fatigue: number;
  melancholy: number;
  treasury: number;
}

export interface ActivityResolution {
  deltas: ActivityDeltas;
  events: GameEvent[];
  rng: RngStreams;
}

type EconomyState = Pick<CampaignState, 'elapsedWeeks' | 'stats' | 'fatigue' | 'melancholy' | 'treasury'>;

/** Accumulates clamped changes against a working copy of the state, emitting one event per non-zero change. */
class Ledger {
  private readonly stats: Record<Estate, number>;
  private fatigue: number;
  private melancholy: number;
  private treasury: number;
  readonly events: GameEvent[] = [];

  constructor(private readonly state: EconomyState, private readonly config: RulesConfig) {
    this.stats = { ...state.stats };
    this.fatigue = state.fatigue;
    this.melancholy = state.melancholy;
    this.treasury = state.treasury;
  }

  get week(): number {
    return this.state.elapsedWeeks;
  }

  coin(amount: number, source: CoinSource): void {
    const next = clampTreasury(this.treasury + amount, this.config);
    this.emitCoin(next - this.treasury, source);
    this.treasury = next;
  }

  stat(estate: Estate, amount: number, source: StatSource): void {
    const next = clampStat(this.stats[estate] + amount, this.config);
    const applied = next - this.stats[estate];
    this.stats[estate] = next;
    if (applied !== 0) this.events.push({ type: 'stat_changed', week: this.week, estate, amount: applied, source });
  }

  burden(burden: 'fatigue' | 'melancholy', amount: number, source: BurdenSource): void {
    const next = addBurden(this[burden], amount);
    const applied = next - this[burden];
    this[burden] = next;
    if (applied !== 0) this.events.push({ type: 'burden_changed', week: this.week, burden, amount: applied, source });
  }

  deltas(): ActivityDeltas {
    const { state } = this;
    return {
      stats: {
        bellatores: this.stats.bellatores - state.stats.bellatores,
        oratores: this.stats.oratores - state.stats.oratores,
        laboratores: this.stats.laboratores - state.stats.laboratores,
      },
      fatigue: this.fatigue - state.fatigue,
      melancholy: this.melancholy - state.melancholy,
      treasury: this.treasury - state.treasury,
    };
  }

  private emitCoin(amount: number, source: CoinSource): void {
    if (amount !== 0) this.events.push({ type: 'coin_changed', week: this.week, account: 'treasury', amount, source });
  }
}

/** Throws INSUFFICIENT_FUNDS (before any RNG draw) unless the treasury covers `cost`. */
function requireFunds(state: EconomyState, cost: number, what: string): void {
  if (state.treasury < cost) {
    throw new RuleError('INSUFFICIENT_FUNDS', `${what} costs ${cost} Coin but the treasury holds ${state.treasury}`);
  }
}

function lookup<T>(table: Readonly<Record<string, T>>, id: string, what: string): T {
  if (!Object.hasOwn(table, id)) throw new RuleError('INVALID_ACTION', `unknown ${what}: ${JSON.stringify(id)}`);
  return table[id] as T;
}

/** Modified tutor fee (after the costPct factors). */
export function tutorCost(tutor: TutorId, modifiers: ModifierSet, config: RulesConfig): number {
  return applyModifier(lookup(config.classes.tutors, tutor, 'tutor').cost, modifiers, 'costPct');
}

/** Modified rest fee (after the costPct factors, e.g. Banquet in the Solar Return month). */
export function restCost(rest: RestId, modifiers: ModifierSet, config: RulesConfig): number {
  return applyModifier(lookup(config.rest, rest, 'rest').cost, modifiers, 'costPct');
}

/** Final job success chance in percent, or null for an automatic job (no check stat). */
export function jobSuccessChance(
  state: Pick<CampaignState, 'stats'>,
  job: JobId,
  modifiers: ModifierSet,
  config: RulesConfig,
): number | null {
  const { checkStat } = lookup(config.jobs.definitions, job, 'job');
  if (checkStat === null) return null;
  const { baseSuccessBonus, successMin, successMax } = config.jobs;
  const raw = state.stats[checkStat] + baseSuccessBonus + modifiers.successBonusPts;
  return Math.min(successMax, Math.max(successMin, raw));
}

export function resolveTutor(
  state: EconomyState,
  tutor: TutorId,
  modifiers: ModifierSet,
  rng: RngStreams,
  config: RulesConfig,
): ActivityResolution {
  const definition = lookup(config.classes.tutors, tutor, 'tutor');
  const cost = tutorCost(tutor, modifiers, config);
  requireFunds(state, cost, tutor);

  const ledger = new Ledger(state, config);
  ledger.coin(-cost, 'tutor_fee');
  ledger.stat(definition.target, applyModifier(definition.gain, modifiers, 'statGainPct'), 'tutor');
  ledger.stat(definition.opposing, -definition.opposingLoss, 'tutor_opposing');
  const burden = config.classes.tutorBurden[tutor];
  ledger.burden('fatigue', applyModifier(burden.fatigue, modifiers, 'fatiguePct'), 'tutor');
  ledger.burden('melancholy', applyModifier(burden.melancholy, modifiers, 'melancholyPct'), 'tutor');
  return { deltas: ledger.deltas(), events: ledger.events, rng };
}

export function resolveJob(
  state: EconomyState,
  job: JobId,
  modifiers: ModifierSet,
  rng: RngStreams,
  config: RulesConfig,
): ActivityResolution {
  const definition = lookup(config.jobs.definitions, job, 'job');
  const ledger = new Ledger(state, config);
  const chance = jobSuccessChance(state, job, modifiers, config);

  let streams = rng;
  let success = true;
  let roll: number | undefined;
  if (chance !== null) {
    const drawn = drawFrom(streams, 'jobs', d100);
    streams = drawn.streams;
    roll = drawn.value;
    success = roll <= chance;
  }
  ledger.events.push({
    type: 'job_resolved', week: ledger.week, job, success,
    probability: chance ?? 100,
    ...(roll === undefined ? {} : { roll }),
    automatic: chance === null,
  });

  let dieValue = 0;
  if (success && definition.success.coinDie > 0) {
    const die = drawFrom(streams, 'jobs', (s) => rollInt(s, 1, definition.success.coinDie));
    streams = die.streams;
    dieValue = die.value;
  }
  settleJob(ledger, definition, success, dieValue, modifiers);
  return { deltas: ledger.deltas(), events: ledger.events, rng: streams };
}

/** Applies a job branch once the d100 and (on success) the coin die are known. */
function settleJob(
  ledger: Ledger,
  definition: RulesConfig['jobs']['definitions'][JobId],
  success: boolean,
  dieValue: number,
  modifiers: ModifierSet,
): void {
  if (success) {
    const outcome = definition.success;
    ledger.coin(applyModifier(outcome.coin + dieValue, modifiers, 'payoutPct'), 'job_payout');
    ledger.stat(outcome.gainStat, applyModifier(outcome.gain, modifiers, 'statGainPct'), 'job');
    ledger.burden('fatigue', applyModifier(outcome.fatigue, modifiers, 'fatiguePct'), 'job');
    ledger.burden('melancholy', applyModifier(outcome.melancholy, modifiers, 'melancholyPct'), 'job');
  } else {
    const outcome = definition.failure;
    ledger.coin(applyModifier(outcome.coin, modifiers, 'payoutPct'), 'job_payout');
    ledger.burden('fatigue', applyModifier(outcome.fatigue, modifiers, 'fatiguePct'), 'job');
    ledger.burden('melancholy', applyModifier(outcome.melancholy, modifiers, 'melancholyPct'), 'job');
  }
}

/**
 * Deltas of one job branch without drawing (UI previews). `dieValue` is the
 * success coin die result (ignored on failure; pass 0 for jobs without a die).
 */
export function jobOutcomeDeltas(
  state: EconomyState,
  job: JobId,
  success: boolean,
  dieValue: number,
  modifiers: ModifierSet,
  config: RulesConfig,
): ActivityDeltas {
  const ledger = new Ledger(state, config);
  settleJob(ledger, lookup(config.jobs.definitions, job, 'job'), success, success ? dieValue : 0, modifiers);
  return ledger.deltas();
}

export function resolveRest(
  state: EconomyState,
  rest: RestId,
  modifiers: ModifierSet,
  rng: RngStreams,
  config: RulesConfig,
): ActivityResolution {
  const definition = lookup(config.rest, rest, 'rest');
  const cost = restCost(rest, modifiers, config);
  requireFunds(state, cost, rest);

  const ledger = new Ledger(state, config);
  ledger.coin(-cost, 'rest_fee');
  ledger.burden('fatigue', -applyModifier(definition.fatigue, modifiers, 'recoveryPct'), 'rest');
  ledger.burden('melancholy', -applyModifier(definition.melancholy, modifiers, 'recoveryPct'), 'rest');
  return { deltas: ledger.deltas(), events: ledger.events, rng };
}

/** Applies resolver deltas to a state (no clamping needed: deltas are already clamped). */
export function applyActivityDeltas<S extends EconomyState>(state: S, deltas: ActivityDeltas): S {
  return {
    ...state,
    stats: {
      bellatores: state.stats.bellatores + deltas.stats.bellatores,
      oratores: state.stats.oratores + deltas.stats.oratores,
      laboratores: state.stats.laboratores + deltas.stats.laboratores,
    },
    fatigue: state.fatigue + deltas.fatigue,
    melancholy: state.melancholy + deltas.melancholy,
    treasury: state.treasury + deltas.treasury,
  };
}
