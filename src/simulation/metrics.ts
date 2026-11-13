/**
 * E2 metrics (tech §12): per-run records and policy × sign aggregates.
 *
 * `runRecord` derives everything from the event stream plus the observable
 * final state. It never calls rules internals; the few rule constants it needs
 * (calendar length, medical-fee cap, the matchup cycle, final ceilings and
 * age) arrive in `RunMeta`, which `runMetaFromConfig` builds through the
 * public core API.
 *
 * Event conventions this module relies on (see the D-series note in
 * docs/implementation-tasks.md):
 *  - A Metheglin reroll emits a second `encounter_resolved` for the same
 *    encounter. Each d100 counts as a roll, but an encounter's outcome is the
 *    last resolution (rerolls replace the first failure).
 *  - Consumed or wipeout-lost items emit `item_changed` with amount 0.
 *  - Coin and burden deltas are already clamped, so summing them backwards
 *    from the final state recovers the starting balances exactly.
 *  - Event `week` is the elapsed-week count when the event happened, so the
 *    per-week series value at index w is the balance after every event
 *    stamped with week ≤ w (terminal events settle the last spent week).
 */
import { getCalendar, getDerivedStats, hashConfig } from '../core/index.js';
import type { RulesConfig } from '../core/config.js';
import type {
  CampaignState,
  CoinSource,
  Estate,
  GameEvent,
  JobId,
  WeekReason,
  ZodiacSign,
} from '../core/types.js';

export const ESTATES: readonly Estate[] = ['bellatores', 'oratores', 'laboratores'];

export type Matchup = 'advantage' | 'neutral' | 'disadvantage';
export type WipeoutCause = 'fatigue' | 'melancholy' | 'both' | 'coin';
export type Outcome = 'victory' | 'deadline' | 'unfinished';
/**
 * Why a run failed. `deadline` means the scion ran out of time while still
 * functional; `resource_loop` means the closing window was dominated by
 * wipeouts, collapses or an empty purse (see `RecordOptions`).
 */
export type FailureAttribution = 'none' | 'deadline' | 'resource_loop';

/** How each Coin source is tallied in the earned/spent/lost/transfer split. */
export type CoinCategory = 'earned' | 'spent' | 'lost' | 'transfer';

export const COIN_CATEGORY: Readonly<Record<CoinSource, CoinCategory>> = {
  job_payout: 'earned',
  encounter_reward: 'earned',
  tutor_fee: 'spent',
  rest_fee: 'spent',
  departure_fee: 'spent',
  skip_fee: 'spent',
  retreat_toll: 'spent',
  medical_fee: 'spent',
  physician_fee: 'spent',
  laboratores_penalty: 'lost',
  retreat_loot_forfeit: 'lost',
  wipeout_lost: 'lost',
  carry_out: 'transfer',
  bank_carried: 'transfer',
  wipeout_retained: 'transfer',
};

const WIPEOUT_COIN_SOURCES: ReadonlySet<CoinSource> = new Set(['wipeout_lost', 'wipeout_retained', 'medical_fee']);

const WEEK_KINDS =['tutor', 'job', 'rest', 'segment_entry', 'convalescence'] as const satisfies readonly WeekReason[];

// ---------------------------------------------------------------------------
// Run metadata
// ---------------------------------------------------------------------------

export interface RunMeta {
  seed: number;
  birthSign: ZodiacSign;
  policy: string;
  /** Rules config identifier (normally `hashConfig`, or a variant name). */
  configId: string;
  totalWeeks: number;
  medicalFeeMax: number;
  /** `encounters.beats`: each Estate beats the one it maps to. */
  beats: Readonly<Record<Estate, Estate>>;
  /** Derived ceilings for the final state. */
  finalCeilings: { fatigue: number; melancholy: number };
  /** Age at the final state's elapsed week. */
  finalAge: number;
  /** Departures the policy wanted but could not afford (reported by the runner; default 0). */
  failedDepartureAttempts?: number;
}

export interface RunMetaInput {
  seed?: number;
  policy: string;
  configId?: string;
  failedDepartureAttempts?: number;
}

/** Builds `RunMeta` through the public core API. Pass `configId` to skip rehashing per run. */
export function runMetaFromConfig(finalState: CampaignState, config: RulesConfig, input: RunMetaInput): RunMeta {
  const derived = getDerivedStats(finalState, config);
  return {
    seed: input.seed ?? finalState.seed,
    birthSign: finalState.birthSign,
    policy: input.policy,
    configId: input.configId ?? hashConfig(config),
    totalWeeks: config.calendar.totalWeeks,
    medicalFeeMax: config.failure.wipeoutMedicalFeeMax,
    beats: { ...config.encounters.beats },
    finalCeilings: { fatigue: derived.fatigueCeiling, melancholy: derived.melancholyCeiling },
    finalAge: getCalendar(finalState, config).age,
    ...(input.failedDepartureAttempts === undefined ? {} : { failedDepartureAttempts: input.failedDepartureAttempts }),
  };
}

export function matchupOf(approach: Estate, threat: Estate, beats: Readonly<Record<Estate, Estate>>): Matchup {
  if (approach === threat) return 'neutral';
  if (beats[approach] === threat) return 'advantage';
  if (beats[threat] === approach) return 'disadvantage';
  throw new RangeError(`beats does not relate ${approach} and ${threat}`);
}

// ---------------------------------------------------------------------------
// Run record
// ---------------------------------------------------------------------------

export interface Tally {
  attempts: number;
  successes: number;
}

export interface EncounterTally extends Tally {
  /** Sum of pre-roll probabilities over the deciding rolls (mean = sum / attempts). */
  probabilitySum: number;
}

export interface ItemTally {
  acquired: number;
  sentOut: number;
  returned: number;
  used: number;
  lost: number;
}

export interface RunRecord {
  seed: number;
  birthSign: ZodiacSign;
  policy: string;
  configId: string;
  outcome: Outcome;
  /** Victory week, or null for any other outcome. */
  victoryWeek: number | null;
  finalWeek: number;
  finalAge: number;
  finalStats: Record<Estate, number>;
  finalFatigue: number;
  finalMelancholy: number;
  finalCeilings: { fatigue: number; melancholy: number };
  finalTreasury: number;
  /** Furthest waystation reached (checkpoint). */
  furthestWaystation: number;
  /** Week each waystation was first reached, keyed by waystation number. */
  firstReachWeek: Record<number, number>;
  /** Cards completed (including survivable failures and skips) in the best single final-gauntlet attempt. */
  finalEncountersCompleted: number;
  finalAttempts: number;

  /** Weeks by reason; `unused` is calendar left at the end (victory frees weeks). */
  weeks: Record<(typeof WEEK_KINDS)[number] | 'unused', number>;
  segmentStarts: number;
  retreats: number;
  wipeouts: number;
  wipeoutCauses: Record<WipeoutCause, number>;
  homeCollapses: number;
  /** Wipeouts whose medical fee could not be paid in full. */
  medicalFeeShortfalls: number;
  /** Home collapses whose physician fee (Q13) could not be paid in full, from the collapse event's nominal/paid. */
  physicianFeeShortfalls: number;
  failedDepartureAttempts: number;

  jobs: Partial<Record<JobId, Tally>>;
  /** Encounter outcomes keyed `${threat}:${approach}`; rerolls replace the first result. */
  encounters: Record<string, EncounterTally>;
  encountersByMatchup: Record<Matchup, EncounterTally>;
  /** Every d100 rolled on the road, rerolls included. */
  encounterRolls: number;
  encountersSkipped: number;
  rerolls: number;

  /** Net Coin per source summed over both accounts (transfers net to ≈0). */
  coinBySource: Partial<Record<CoinSource, number>>;
  /** Magnitudes by category; transfers excluded. */
  coinEarned: number;
  coinSpent: number;
  coinLost: number;

  items: Record<string, ItemTally>;

  /** Weeks (indices < finalWeek) ending with treasury + carried at 0. */
  zeroPurseWeeks: number;
  /** Weeks ending with an empty treasury, even when Coin is carried. */
  zeroTreasuryWeeks: number;
  /** End-of-week balances, length `totalWeeks`, forward-filled after the final week. */
  fatigueByWeek: number[];
  melancholyByWeek: number[];
  treasuryByWeek: number[];

  failureAttribution: FailureAttribution;
}

export interface RecordOptions {
  /**
   * A deadline failure is attributed to a resource loop when, within this
   * many weeks before the deadline, the run wiped out, collapsed at home, or
   * ended a week with an empty purse. Default 24 (six months).
   */
  resourceLoopWindowWeeks?: number;
}

const emptyEncounterTally = (): EncounterTally => ({ attempts: 0, successes: 0, probabilitySum: 0 });
const emptyItemTally = (): ItemTally => ({ acquired: 0, sentOut: 0, returned: 0, used: 0, lost: 0 });

function sumWhere<T>(items: readonly T[], value: (item: T) => number): number {
  let total = 0;
  for (const item of items) total += value(item);
  return total;
}

export function runRecord(
  events: readonly GameEvent[],
  finalState: CampaignState,
  meta: RunMeta,
  options: RecordOptions = {},
): RunRecord {
  const totalWeeks = meta.totalWeeks;
  const finalWeek = finalState.elapsedWeeks;
  const window = options.resourceLoopWindowWeeks ?? 24;

  // Starting balances: final minus every (clamped) delta.
  const startFatigue = finalState.fatigue - sumWhere(events, (e) =>
    e.type === 'burden_changed' && e.burden === 'fatigue' ? e.amount : 0);
  const startMelancholy = finalState.melancholy - sumWhere(events, (e) =>
    e.type === 'burden_changed' && e.burden === 'melancholy' ? e.amount : 0);
  const startTreasury = finalState.treasury - sumWhere(events, (e) =>
    e.type === 'coin_changed' && e.account === 'treasury' ? e.amount : 0);
  const finalCarried = finalState.pilgrimage?.carriedCoin ?? 0;
  const startCarried = finalCarried - sumWhere(events, (e) =>
    e.type === 'coin_changed' && e.account === 'carried' ? e.amount : 0);

  const weeks: RunRecord['weeks'] = { tutor: 0, job: 0, rest: 0, segment_entry: 0, convalescence: 0, unused: 0 };
  const wipeoutCauses: Record<WipeoutCause, number> = { fatigue: 0, melancholy: 0, both: 0, coin: 0 };
  const jobs: RunRecord['jobs'] = {};
  const encounters: Record<string, EncounterTally> = {};
  const encountersByMatchup: Record<Matchup, EncounterTally> = {
    advantage: emptyEncounterTally(), neutral: emptyEncounterTally(), disadvantage: emptyEncounterTally(),
  };
  const coinBySource: Partial<Record<CoinSource, number>> = {};
  const items: Record<string, ItemTally> = {};
  const item = (id: string): ItemTally => (items[id] ??= emptyItemTally());
  const firstReachWeek: Record<number, number> = {};

  let segmentStarts = 0;
  let retreats = 0;
  let wipeouts = 0;
  let homeCollapses = 0;
  let medicalFeeShortfalls = 0;
  let physicianFeeShortfalls = 0;
  let encounterRolls = 0;
  let encountersSkipped = 0;
  let rerolls = 0;
  let victoryWeek: number | null = null;
  let deadline = false;
  let finalAttempts = 0;
  let finalEncountersCompleted = 0;
  const distressWeeks: number[] = []; // weeks of wipeouts and home collapses

  // Per-attempt road state.
  let onFinal = false;
  let finalCleared = 0;
  const finishFinal = (): void => {
    if (onFinal) finalEncountersCompleted = Math.max(finalEncountersCompleted, finalCleared);
    onFinal = false;
  };
  let lastResolved: { key: string; segmentIndex: number; encounterIndex: number; matchup: Matchup; success: boolean;
    probability: number } | undefined;
  // A wipeout's medical fee is settled by the end of the same action; track the open wipeout.
  let openWipeout: { paid: number } | undefined;
  const closeWipeout = (): void => {
    if (openWipeout !== undefined && openWipeout.paid < meta.medicalFeeMax) medicalFeeShortfalls += 1;
    openWipeout = undefined;
  };

  // Per-week series.
  const fatigueByWeek = new Array<number>(totalWeeks);
  const melancholyByWeek = new Array<number>(totalWeeks);
  const treasuryByWeek = new Array<number>(totalWeeks);
  const purseByWeek = new Array<number>(totalWeeks);
  let fatigue = startFatigue;
  let melancholy = startMelancholy;
  let treasury = startTreasury;
  let carried = startCarried;
  let cursor = 0; // next week index to fill
  const fillThrough = (week: number): void => {
    for (; cursor <= Math.min(week, totalWeeks - 1); cursor++) {
      fatigueByWeek[cursor] = fatigue;
      melancholyByWeek[cursor] = melancholy;
      treasuryByWeek[cursor] = treasury;
      purseByWeek[cursor] = treasury + carried;
    }
  };

  const unrecord = (tally: EncounterTally, success: boolean, probability: number): void => {
    tally.attempts -= 1;
    tally.probabilitySum -= probability;
    if (success) tally.successes -= 1;
  };
  const record = (tally: EncounterTally, success: boolean, probability: number): void => {
    tally.attempts += 1;
    tally.probabilitySum += probability;
    if (success) tally.successes += 1;
  };

  for (const event of events) {
    // Every event stamped with a later week closes the earlier weeks' snapshots.
    // Settlements at the final elapsed week belong to the last spent week,
    // including early victory and a final segment played at the deadline.
    fillThrough(Math.min(event.week, Math.max(0, finalWeek - 1), totalWeeks - 1) - 1);
    // The wipeout's own Coin events (loss, retention, fee) belong to it; anything else closes it.
    if (event.type !== 'coin_changed' || !WIPEOUT_COIN_SOURCES.has(event.source)) closeWipeout();

    switch (event.type) {
      case 'week_spent':
        weeks[event.reason] += 1;
        break;
      case 'burden_changed':
        if (event.burden === 'fatigue') fatigue += event.amount;
        else melancholy += event.amount;
        break;
      case 'coin_changed': {
        if (event.account === 'treasury') treasury += event.amount;
        else carried += event.amount;
        coinBySource[event.source] = (coinBySource[event.source] ?? 0) + event.amount;
        if (event.source === 'medical_fee' && openWipeout !== undefined) openWipeout.paid += -event.amount;
        break;
      }
      case 'item_changed': {
        const tally = item(event.itemId);
        switch (event.source) {
          case 'starting_inventory':
          case 'reward':
            if (event.amount > 0) tally.acquired += event.amount;
            break;
          case 'pilgrimage_slot_out':
            tally.sentOut += -event.amount;
            break;
          case 'pilgrimage_slot_returned':
            tally.returned += event.amount;
            break;
          case 'consumed':
            break; // counted once via consumable_used
          case 'wipeout_lost':
            tally.lost += 1;
            break;
        }
        break;
      }
      case 'consumable_used':
        item(event.itemId).used += 1;
        break;
      case 'job_resolved': {
        const tally = (jobs[event.job] ??= { attempts: 0, successes: 0 });
        tally.attempts += 1;
        if (event.success) tally.successes += 1;
        break;
      }
      case 'collapse':
        homeCollapses += 1;
        if (event.fee !== undefined && event.fee.paid < event.fee.nominal) physicianFeeShortfalls += 1;
        distressWeeks.push(event.week);
        break;
      case 'pilgrimage_started':
        finishFinal();
        segmentStarts += 1;
        lastResolved = undefined;
        onFinal = event.isFinal;
        if (onFinal) {
          finalAttempts += 1;
          finalCleared = 0;
        }
        break;
      case 'encounter_resolved': {
        encounterRolls += 1;
        const key = `${event.threat}:${event.approach}`;
        const tally = (encounters[key] ??= emptyEncounterTally());
        const m = matchupOf(event.approach, event.threat, meta.beats);
        const isReroll = lastResolved !== undefined
          && lastResolved.segmentIndex === event.segmentIndex
          && lastResolved.encounterIndex === event.encounterIndex;
        if (isReroll) {
          unrecord(encounters[lastResolved!.key]!, lastResolved!.success, lastResolved!.probability);
          unrecord(encountersByMatchup[lastResolved!.matchup], lastResolved!.success, lastResolved!.probability);
        }
        record(tally, event.success, event.probability);
        record(encountersByMatchup[m], event.success, event.probability);
        if (onFinal && !isReroll) finalCleared += 1;
        lastResolved = {
          key, segmentIndex: event.segmentIndex, encounterIndex: event.encounterIndex, matchup: m,
          success: event.success, probability: event.probability,
        };
        break;
      }
      case 'encounter_skipped':
        encountersSkipped += 1;
        if (onFinal) {
          finalCleared += 1;
        }
        break;
      case 'reroll_used':
        rerolls += 1;
        break;
      case 'waystation_reached':
        if (!(event.waystation in firstReachWeek)) firstReachWeek[event.waystation] = event.week;
        break;
      case 'retreat':
        finishFinal();
        retreats += 1;
        break;
      case 'wipeout':
        // The fatal check was attempted but never advanced the encounter.
        if (onFinal) finalCleared -= 1;
        finishFinal();
        wipeouts += 1;
        wipeoutCauses[event.cause] += 1;
        distressWeeks.push(event.week);
        openWipeout = { paid: 0 };
        break;
      case 'victory':
        finishFinal();
        victoryWeek = event.week;
        break;
      case 'deadline':
        deadline = true;
        break;
      case 'convalescence':
      case 'encounter_drawn':
        break;
    }
  }
  closeWipeout();
  // An unfinished Metheglin decision has not yet applied the failure.
  if (onFinal && finalState.pilgrimage?.pendingFailure) finalCleared -= 1;
  finishFinal();

  fillThrough(totalWeeks - 1);
  // Calendar left over (victory frees weeks); every run's buckets sum to totalWeeks.
  weeks.unused = Math.max(0, totalWeeks - sumWhere(WEEK_KINDS, (kind) => weeks[kind]));

  let zeroPurseWeeks = 0;
  let zeroTreasuryWeeks = 0;
  for (let w = 0; w < Math.min(finalWeek, totalWeeks); w++) if (treasuryByWeek[w] === 0) zeroTreasuryWeeks += 1;
  for (let w = 0; w < Math.min(finalWeek, totalWeeks); w++) if (purseByWeek[w] === 0) zeroPurseWeeks += 1;

  let coinEarned = 0;
  let coinSpent = 0;
  let coinLost = 0;
  for (const [source, net] of Object.entries(coinBySource) as [CoinSource, number][]) {
    const category = COIN_CATEGORY[source];
    if (category === 'earned') coinEarned += net;
    else if (category === 'spent') coinSpent += -net;
    else if (category === 'lost') coinLost += -net;
  }

  const outcome: Outcome = victoryWeek !== null ? 'victory' : deadline ? 'deadline' : 'unfinished';
  let failureAttribution: FailureAttribution = 'none';
  if (outcome === 'deadline') {
    const from = totalWeeks - window;
    const distressed = distressWeeks.some((w) => w >= from)
      || purseByWeek.some((value, w) => w >= from && w < finalWeek && value === 0);
    failureAttribution = distressed ? 'resource_loop' : 'deadline';
  }

  return {
    seed: meta.seed,
    birthSign: meta.birthSign,
    policy: meta.policy,
    configId: meta.configId,
    outcome,
    victoryWeek,
    finalWeek,
    finalAge: meta.finalAge,
    finalStats: { ...finalState.stats },
    finalFatigue: finalState.fatigue,
    finalMelancholy: finalState.melancholy,
    finalCeilings: { ...meta.finalCeilings },
    finalTreasury: finalState.treasury,
    furthestWaystation: finalState.furthestWaystation,
    firstReachWeek,
    finalEncountersCompleted,
    finalAttempts,
    weeks,
    segmentStarts,
    retreats,
    wipeouts,
    wipeoutCauses,
    homeCollapses,
    medicalFeeShortfalls,
    physicianFeeShortfalls,
    failedDepartureAttempts: meta.failedDepartureAttempts ?? 0,
    jobs,
    encounters,
    encountersByMatchup,
    encounterRolls,
    encountersSkipped,
    rerolls,
    coinBySource,
    coinEarned,
    coinSpent,
    coinLost,
    items,
    zeroPurseWeeks,
    zeroTreasuryWeeks,
    fatigueByWeek,
    melancholyByWeek,
    treasuryByWeek,
    failureAttribution,
  };
}

// ---------------------------------------------------------------------------
// Aggregation
// ---------------------------------------------------------------------------

export interface Interval {
  estimate: number;
  low: number;
  high: number;
}

/** Wilson score interval for a binomial proportion (z = 1.96 for 95%). */
export function wilsonInterval(successes: number, trials: number, z = 1.959963984540054): Interval {
  if (trials === 0) return { estimate: 0, low: 0, high: 1 };
  const p = successes / trials;
  const z2 = z * z;
  const denominator = 1 + z2 / trials;
  const centre = (p + z2 / (2 * trials)) / denominator;
  const half = (z * Math.sqrt((p * (1 - p)) / trials + z2 / (4 * trials * trials))) / denominator;
  return { estimate: p, low: Math.max(0, centre - half), high: Math.min(1, centre + half) };
}

/** Linear-interpolated quantile of an ascending-sorted array (type 7, as in R/NumPy). */
export function quantile(sorted: readonly number[], q: number): number | null {
  if (sorted.length === 0) return null;
  const position = (sorted.length - 1) * q;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  return sorted[lower]! + (sorted[upper]! - sorted[lower]!) * (position - lower);
}

export interface Distribution {
  n: number;
  mean: number | null;
  min: number | null;
  p10: number | null;
  median: number | null;
  p90: number | null;
  max: number | null;
}

export function distribution(values: readonly number[]): Distribution {
  const sorted = [...values].sort((a, b) => a - b);
  return {
    n: sorted.length,
    mean: sorted.length === 0 ? null : sumWhere(sorted, (v) => v) / sorted.length,
    min: sorted[0] ?? null,
    p10: quantile(sorted, 0.1),
    median: quantile(sorted, 0.5),
    p90: quantile(sorted, 0.9),
    max: sorted.at(-1) ?? null,
  };
}

export interface RateSummary extends Tally {
  rate: number | null;
}

export interface EncounterSummary extends RateSummary {
  meanProbability: number | null;
}

export interface Aggregate {
  policy: string;
  birthSign: ZodiacSign | 'all';
  runs: number;
  victories: number;
  victoryRate: Interval;
  /** Among winners. */
  victoryWeek: Distribution;
  outcomes: Record<Outcome, number>;
  /** Runs per furthest waystation reached. */
  checkpoints: Record<number, number>;
  /** Per waystation: how many runs reached it and the distribution of first-reach weeks. */
  firstReach: Record<number, { reached: number; week: Distribution }>;
  finalEncountersCompleted: Distribution;
  /** Fraction of runs with at least one week ending at an empty purse. */
  zeroPurseRunRate: number;
  zeroTreasuryRunRate: number;
  zeroTreasuryWeeks: Distribution;
  zeroPurseWeeks: Distribution;
  failedDepartureAttempts: Distribution;
  /** Fraction of wipeouts whose medical fee was not paid in full. */
  medicalFeeShortfallRate: number | null;
  /** Fraction of home collapses whose physician fee was not paid in full. */
  physicianFeeShortfallRate: number | null;
  /** New Moon skips per run; skips are not encounter rolls. */
  encountersSkippedPerRun: Distribution;
  wipeoutCauses: Record<WipeoutCause, number>;
  wipeoutsPerRun: Distribution;
  retreatsPerRun: Distribution;
  segmentStartsPerRun: Distribution;
  homeCollapsesPerRun: Distribution;
  convalescenceWeeks: Distribution;
  /** Mean end-of-week burdens and treasury by week index. */
  conditionByWeek: { fatigue: number[]; melancholy: number[]; treasury: number[] };
  finalStats: Record<Estate, Distribution>;
  /** Mean fraction of the calendar spent on each use. */
  calendarUtilization: Record<keyof RunRecord['weeks'], number>;
  jobs: Partial<Record<JobId, RateSummary>>;
  /** Keyed `${threat}:${approach}`. */
  encounters: Record<string, EncounterSummary>;
  encountersByMatchup: Record<Matchup, EncounterSummary>;
  /** Share of encounters fought at each matchup (approach selection quality). */
  matchupShare: Record<Matchup, number | null>;
  /** Mean Coin per run by source (net over both accounts). */
  coinBySource: Partial<Record<CoinSource, number>>;
  coinPerRun: { earned: number; spent: number; lost: number };
  items: Record<string, ItemTally>;
  failureAttribution: Record<FailureAttribution, number>;
}

export interface AggregateOptions {
  /** Also emit one `birthSign: 'all'` row per policy. Default true. */
  includeAllSigns?: boolean;
}

function rateOf(t: Tally): RateSummary {
  return { ...t, rate: t.attempts === 0 ? null : t.successes / t.attempts };
}

function encounterSummary(t: EncounterTally): EncounterSummary {
  return { ...rateOf(t), meanProbability: t.attempts === 0 ? null : t.probabilitySum / t.attempts };
}

function addEncounter(into: EncounterTally, from: EncounterTally): void {
  into.attempts += from.attempts;
  into.successes += from.successes;
  into.probabilitySum += from.probabilitySum;
}

function meanSeries(series: readonly (readonly number[])[]): number[] {
  const length = Math.max(0, ...series.map((s) => s.length));
  const out = new Array<number>(length).fill(0);
  for (const s of series) for (let w = 0; w < s.length; w++) out[w]! += s[w]!;
  return out.map((v) => v / series.length);
}

/** Aggregates one group of records (normally a single policy × sign). */
export function aggregateGroup(records: readonly RunRecord[], policy: string, birthSign: ZodiacSign | 'all'): Aggregate {
  const runs = records.length;
  const perRun = (value: number): number => (runs === 0 ? 0 : value / runs);
  const winners = records.filter((r) => r.outcome === 'victory');

  const outcomes: Record<Outcome, number> = { victory: 0, deadline: 0, unfinished: 0 };
  const checkpoints: Record<number, number> = {};
  const reachWeeks: Record<number, number[]> = {};
  const wipeoutCauses: Record<WipeoutCause, number> = { fatigue: 0, melancholy: 0, both: 0, coin: 0 };
  const failureAttribution: Record<FailureAttribution, number> = { none: 0, deadline: 0, resource_loop: 0 };
  const weekTotals: Record<keyof RunRecord['weeks'], number> = {
    tutor: 0, job: 0, rest: 0, segment_entry: 0, convalescence: 0, unused: 0,
  };
  const jobs: Partial<Record<JobId, Tally>> = {};
  const encounters: Record<string, EncounterTally> = {};
  const byMatchup: Record<Matchup, EncounterTally> = {
    advantage: emptyEncounterTally(), neutral: emptyEncounterTally(), disadvantage: emptyEncounterTally(),
  };
  const coinBySource: Partial<Record<CoinSource, number>> = {};
  const coin = { earned: 0, spent: 0, lost: 0 };
  const items: Record<string, ItemTally> = {};
  let wipeouts = 0;
  let shortfalls = 0;
  let collapses = 0;
  let physicianShortfalls = 0;
  let calendarWeeks = 0;

  for (const r of records) {
    outcomes[r.outcome] += 1;
    checkpoints[r.furthestWaystation] = (checkpoints[r.furthestWaystation] ?? 0) + 1;
    for (const [waystation, week] of Object.entries(r.firstReachWeek)) (reachWeeks[Number(waystation)] ??= []).push(week);
    for (const cause of Object.keys(wipeoutCauses) as WipeoutCause[]) wipeoutCauses[cause] += r.wipeoutCauses[cause];
    failureAttribution[r.failureAttribution] += 1;
    const total = sumWhere(Object.values(r.weeks), (v) => v);
    calendarWeeks += total;
    for (const kind of Object.keys(weekTotals) as (keyof RunRecord['weeks'])[]) weekTotals[kind] += r.weeks[kind];
    for (const [job, tally] of Object.entries(r.jobs) as [JobId, Tally][]) {
      const into = (jobs[job] ??= { attempts: 0, successes: 0 });
      into.attempts += tally.attempts;
      into.successes += tally.successes;
    }
    for (const [key, tally] of Object.entries(r.encounters)) addEncounter((encounters[key] ??= emptyEncounterTally()), tally);
    for (const m of Object.keys(byMatchup) as Matchup[]) addEncounter(byMatchup[m], r.encountersByMatchup[m]);
    for (const [source, net] of Object.entries(r.coinBySource) as [CoinSource, number][]) {
      coinBySource[source] = (coinBySource[source] ?? 0) + net;
    }
    coin.earned += r.coinEarned;
    coin.spent += r.coinSpent;
    coin.lost += r.coinLost;
    for (const [id, tally] of Object.entries(r.items)) {
      const into = (items[id] ??= emptyItemTally());
      for (const k of Object.keys(into) as (keyof ItemTally)[]) into[k] += tally[k];
    }
    wipeouts += r.wipeouts;
    shortfalls += r.medicalFeeShortfalls;
    collapses += r.homeCollapses;
    physicianShortfalls += r.physicianFeeShortfalls;
  }

  const encounterTotal = byMatchup.advantage.attempts + byMatchup.neutral.attempts + byMatchup.disadvantage.attempts;
  const firstReach: Aggregate['firstReach'] = {};
  for (const [waystation, weeks] of Object.entries(reachWeeks)) {
    firstReach[Number(waystation)] = { reached: weeks.length, week: distribution(weeks) };
  }

  return {
    policy,
    birthSign,
    runs,
    victories: winners.length,
    victoryRate: wilsonInterval(winners.length, runs),
    victoryWeek: distribution(winners.map((r) => r.victoryWeek!)),
    outcomes,
    checkpoints,
    firstReach,
    finalEncountersCompleted: distribution(records.map((r) => r.finalEncountersCompleted)),
    zeroPurseRunRate: perRun(records.filter((r) => r.zeroPurseWeeks > 0).length),
    zeroTreasuryRunRate: perRun(records.filter((r) => r.zeroTreasuryWeeks > 0).length),
    zeroTreasuryWeeks: distribution(records.map((r) => r.zeroTreasuryWeeks)),
    zeroPurseWeeks: distribution(records.map((r) => r.zeroPurseWeeks)),
    failedDepartureAttempts: distribution(records.map((r) => r.failedDepartureAttempts)),
    medicalFeeShortfallRate: wipeouts === 0 ? null : shortfalls / wipeouts,
    physicianFeeShortfallRate: collapses === 0 ? null : physicianShortfalls / collapses,
    encountersSkippedPerRun: distribution(records.map((r) => r.encountersSkipped)),
    wipeoutCauses,
    wipeoutsPerRun: distribution(records.map((r) => r.wipeouts)),
    retreatsPerRun: distribution(records.map((r) => r.retreats)),
    segmentStartsPerRun: distribution(records.map((r) => r.segmentStarts)),
    homeCollapsesPerRun: distribution(records.map((r) => r.homeCollapses)),
    convalescenceWeeks: distribution(records.map((r) => r.weeks.convalescence)),
    conditionByWeek: {
      fatigue: meanSeries(records.map((r) => r.fatigueByWeek)),
      melancholy: meanSeries(records.map((r) => r.melancholyByWeek)),
      treasury: meanSeries(records.map((r) => r.treasuryByWeek)),
    },
    finalStats: Object.fromEntries(
      ESTATES.map((estate) => [estate, distribution(records.map((r) => r.finalStats[estate]))]),
    ) as Record<Estate, Distribution>,
    calendarUtilization: Object.fromEntries(
      Object.entries(weekTotals).map(([kind, total]) => [kind, calendarWeeks === 0 ? 0 : total / calendarWeeks]),
    ) as Aggregate['calendarUtilization'],
    jobs: Object.fromEntries(Object.entries(jobs).map(([job, t]) => [job, rateOf(t)])),
    encounters: Object.fromEntries(Object.entries(encounters).map(([key, t]) => [key, encounterSummary(t)])),
    encountersByMatchup: {
      advantage: encounterSummary(byMatchup.advantage),
      neutral: encounterSummary(byMatchup.neutral),
      disadvantage: encounterSummary(byMatchup.disadvantage),
    },
    matchupShare: {
      advantage: encounterTotal === 0 ? null : byMatchup.advantage.attempts / encounterTotal,
      neutral: encounterTotal === 0 ? null : byMatchup.neutral.attempts / encounterTotal,
      disadvantage: encounterTotal === 0 ? null : byMatchup.disadvantage.attempts / encounterTotal,
    },
    coinBySource: Object.fromEntries(Object.entries(coinBySource).map(([s, v]) => [s, perRun(v)])),
    coinPerRun: { earned: perRun(coin.earned), spent: perRun(coin.spent), lost: perRun(coin.lost) },
    items,
    failureAttribution,
  };
}

/**
 * Aggregates records by policy × sign, sorted by policy then sign, with an
 * optional `'all'` row per policy after its signs.
 */
export function aggregate(records: readonly RunRecord[], options: AggregateOptions = {}): Aggregate[] {
  const includeAll = options.includeAllSigns ?? true;
  const byPolicy = new Map<string, Map<ZodiacSign, RunRecord[]>>();
  for (const r of records) {
    const signs = byPolicy.get(r.policy) ?? new Map<ZodiacSign, RunRecord[]>();
    byPolicy.set(r.policy, signs);
    const group = signs.get(r.birthSign) ?? [];
    signs.set(r.birthSign, group);
    group.push(r);
  }
  const out: Aggregate[] = [];
  for (const policy of [...byPolicy.keys()].sort()) {
    const signs = byPolicy.get(policy)!;
    for (const sign of [...signs.keys()].sort()) out.push(aggregateGroup(signs.get(sign)!, policy, sign));
    if (includeAll) out.push(aggregateGroup([...signs.values()].flat(), policy, 'all'));
  }
  return out;
}
