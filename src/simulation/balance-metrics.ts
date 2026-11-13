/**
 * B2 (docs/balance-testing.md §4): balance metrics and paired-difference analysis.
 *
 * `balanceRecord` derives a compact per-run record from the event stream and
 * the final state, like `runRecord` in metrics.ts, without calling rules
 * internals. `summarizeBalance` aggregates one policy × config, and
 * `pairedDifference` compares two groups run on the same seeds.
 *
 * Conventions:
 *  - A segment visit is one `pilgrimage_started` (emitted at departure and on
 *    every continued segment). Cards are `encounter_drawn` events. A departure
 *    is one `departure_fee` charge (the fee is positive in every shipped config).
 *  - Lessons count positive `stat_changed` events with source `tutor`; a lesson
 *    at the stat cap gains nothing and is not counted. Tutor spend counts every fee.
 *  - A failure is survived unless the next event is the wipeout it caused.
 *    Metheglin rerolls replace the failure they reroll (items are off in balance runs).
 */
import type { CampaignState, Estate, GameEvent, ZodiacSign } from '../core/types.js';
import { quantile, wilsonInterval, type Interval } from './metrics.js';

const ESTATES: readonly Estate[] = ['bellatores', 'oratores', 'laboratores'];
export const WIN_BY_WEEKS = [50, 60, 70, 80, 96] as const;
export const ENDING_THRESHOLDS = [20, 30, 40] as const;

export interface BalanceMeta {
  policy: string;
  config: string;
  seed: number;
  birthSign: ZodiacSign;
  /** The policy's main Estate, when it has one (build presets); null otherwise. */
  lead: Estate | null;
}

export interface BalanceRecord extends BalanceMeta {
  outcome: 'victory' | 'deadline' | 'unfinished';
  victoryWeek: number | null;
  finalStats: Record<Estate, number>;
  minFinalStat: number;
  /** Highest minus lowest final stat. */
  statSpread: number;
  firstDepartureWeek: number | null;
  firstDepartureStats: Record<Estate, number> | null;
  lessons: Record<Estate, number>;
  tutorSpend: number;
  /** Cards resolved (final result) by threat, and how many used a non-lead approach. */
  cardsByThreat: Record<Estate, { cards: number; nonLead: number }>;
  regularVisits: number;
  regularCards: number;
  finalAttempts: number;
  finalCards: number;
  departures: number;
  carriedAtDeparture: number;
  peakCarried: number;
  failuresSurvived: number;
  skips: number;
  wipeouts: number;
  retreats: number;
}

const zero = (): Record<Estate, number> => ({ bellatores: 0, oratores: 0, laboratores: 0 });

export function balanceRecord(events: readonly GameEvent[], finalState: CampaignState, meta: BalanceMeta): BalanceRecord {
  const stats = { ...finalState.stats };
  for (const e of events) if (e.type === 'stat_changed') stats[e.estate] -= e.amount; // starting stats
  const lessons = zero();
  const cardsByThreat = Object.fromEntries(ESTATES.map((e) => [e, { cards: 0, nonLead: 0 }])) as
    BalanceRecord['cardsByThreat'];
  let tutorSpend = 0;
  let firstDepartureWeek: number | null = null;
  let firstDepartureStats: Record<Estate, number> | null = null;
  let victoryWeek: number | null = null;
  let deadline = false;
  let regularVisits = 0, regularCards = 0, finalAttempts = 0, finalCards = 0;
  let departures = 0, carriedAtDeparture = 0, carried = 0, peakCarried = 0;
  let failures = 0, wipeouts = 0, retreats = 0, skips = 0, rerolls = 0;
  let visit: 'regular' | 'final' | null = null;
  let lastApproach: { threat: Estate; nonLead: boolean } | null = null;
  const settleCard = () => {
    if (lastApproach) {
      cardsByThreat[lastApproach.threat].cards += 1;
      if (lastApproach.nonLead) cardsByThreat[lastApproach.threat].nonLead += 1;
    }
    lastApproach = null;
  };

  for (let i = 0; i < events.length; i++) {
    const e = events[i]!;
    if (e.type !== 'encounter_resolved' && e.type !== 'reroll_used') settleCard();
    switch (e.type) {
      case 'stat_changed':
        stats[e.estate] += e.amount;
        if (e.source === 'tutor' && e.amount > 0) lessons[e.estate] += 1;
        break;
      case 'coin_changed':
        if (e.source === 'tutor_fee') tutorSpend -= e.amount;
        if (e.source === 'departure_fee') {
          departures += 1;
          if (firstDepartureWeek === null) {
            firstDepartureWeek = e.week;
            firstDepartureStats = { ...stats };
          }
        }
        if (e.account === 'carried') {
          carried += e.amount;
          peakCarried = Math.max(peakCarried, carried);
          if (e.source === 'carry_out') carriedAtDeparture += e.amount;
        }
        break;
      case 'pilgrimage_started':
        visit = e.isFinal ? 'final' : 'regular';
        if (e.isFinal) finalAttempts += 1;
        else regularVisits += 1;
        break;
      case 'encounter_drawn':
        if (visit === 'final') finalCards += 1;
        else regularCards += 1;
        break;
      case 'encounter_resolved':
        lastApproach = { threat: e.threat, nonLead: meta.lead !== null && e.approach !== meta.lead };
        if (!e.success) failures += 1;
        break;
      case 'reroll_used':
        rerolls += 1;
        break;
      case 'encounter_skipped':
        skips += 1;
        break;
      case 'retreat':
        retreats += 1;
        break;
      case 'wipeout':
        wipeouts += 1;
        break;
      case 'victory':
        victoryWeek = e.week;
        break;
      case 'deadline':
        deadline = true;
        break;
      default:
        break;
    }
  }
  settleCard();
  const final = finalState.stats;
  const values = ESTATES.map((e) => final[e]);
  return {
    policy: meta.policy, config: meta.config, seed: meta.seed, birthSign: meta.birthSign, lead: meta.lead,
    outcome: victoryWeek !== null ? 'victory' : deadline ? 'deadline' : 'unfinished',
    victoryWeek,
    finalStats: { ...final },
    minFinalStat: Math.min(...values),
    statSpread: Math.max(...values) - Math.min(...values),
    firstDepartureWeek, firstDepartureStats, lessons, tutorSpend, cardsByThreat,
    regularVisits, regularCards, finalAttempts, finalCards, departures, carriedAtDeparture, peakCarried,
    failuresSurvived: failures - wipeouts - rerolls, skips, wipeouts, retreats,
  };
}

// ---------------------------------------------------------------------------
// Aggregation
// ---------------------------------------------------------------------------

export interface Spread {
  p10: number | null;
  median: number | null;
  p90: number | null;
}

function spread(values: readonly number[]): Spread {
  const sorted = [...values].sort((a, b) => a - b);
  return { p10: quantile(sorted, 0.1), median: quantile(sorted, 0.5), p90: quantile(sorted, 0.9) };
}

const mean = (values: readonly number[]): number | null =>
  values.length === 0 ? null : values.reduce((a, b) => a + b, 0) / values.length;
const ratio = (num: number, den: number): number | null => (den === 0 ? null : num / den);

export interface BalanceSummary {
  policy: string;
  config: string;
  runs: number;
  victoryRate: Interval;
  /** Fraction of all campaigns won by each week (victoryWeek ≤ w). */
  winByWeek: Record<number, number>;
  /** Among winners only; never read alone. */
  winWeekMedian: number | null;
  winWeekMean: number | null;
  /** Victories with every final stat ≥ threshold, as a share of all campaigns and of victories. */
  endingEligibility: Record<number, { ofAll: number; ofVictories: number | null }>;
  statSpreadAtVictory: Spread;
  profileAtVictory: Record<Estate, Spread>;
  profileAtFirstDeparture: Record<Estate, Spread>;
  weeksBeforeFirstDeparture: Spread;
  lessonsPerRun: Record<Estate, number>;
  tutorSpendPerRun: number;
  /** Mean per-run share of cards answered with a non-lead approach (runs with cards only); null without a lead. */
  nonLeadShare: { all: number | null } & Record<Estate, number | null>;
  cardsPerRegularVisit: number | null;
  cardsPerFinalAttempt: number | null;
  failuresSurvivedPerVisit: number | null;
  carriedPerDeparture: number | null;
  peakCarried: number | null;
  skipsPerRun: number;
  wipeoutsPerRun: number;
  retreatsPerRun: number;
}

export function summarizeBalance(records: readonly BalanceRecord[]): BalanceSummary {
  const runs = records.length;
  const winners = records.filter((r) => r.outcome === 'victory');
  const weeks = winners.map((r) => r.victoryWeek!);
  const departed = records.filter((r) => r.firstDepartureStats !== null);
  const sum = (f: (r: BalanceRecord) => number) => records.reduce((a, r) => a + f(r), 0);
  const visits = sum((r) => r.regularVisits + r.finalAttempts);
  const shareOf = (r: BalanceRecord, threats: readonly Estate[]) => {
    const cards = threats.reduce((a, t) => a + r.cardsByThreat[t].cards, 0);
    return cards === 0 ? null : threats.reduce((a, t) => a + r.cardsByThreat[t].nonLead, 0) / cards;
  };
  const nonLead = (threats: readonly Estate[]) => records.some((r) => r.lead === null) ? null
    : mean(records.map((r) => shareOf(r, threats)).filter((v): v is number => v !== null));
  return {
    policy: records[0]?.policy ?? '',
    config: records[0]?.config ?? '',
    runs,
    victoryRate: wilsonInterval(winners.length, runs),
    winByWeek: Object.fromEntries(WIN_BY_WEEKS.map((w) => [w, runs === 0 ? 0 : weeks.filter((v) => v <= w).length / runs])),
    winWeekMedian: spread(weeks).median,
    winWeekMean: mean(weeks),
    endingEligibility: Object.fromEntries(ENDING_THRESHOLDS.map((t) => {
      const eligible = winners.filter((r) => r.minFinalStat >= t).length;
      return [t, { ofAll: runs === 0 ? 0 : eligible / runs, ofVictories: ratio(eligible, winners.length) }];
    })),
    statSpreadAtVictory: spread(winners.map((r) => r.statSpread)),
    profileAtVictory: Object.fromEntries(ESTATES.map((e) => [e, spread(winners.map((r) => r.finalStats[e]))])) as
      Record<Estate, Spread>,
    profileAtFirstDeparture: Object.fromEntries(ESTATES.map((e) =>
      [e, spread(departed.map((r) => r.firstDepartureStats![e]))])) as Record<Estate, Spread>,
    weeksBeforeFirstDeparture: spread(departed.map((r) => r.firstDepartureWeek!)),
    lessonsPerRun: Object.fromEntries(ESTATES.map((e) => [e, runs === 0 ? 0 : sum((r) => r.lessons[e]) / runs])) as
      Record<Estate, number>,
    tutorSpendPerRun: runs === 0 ? 0 : sum((r) => r.tutorSpend) / runs,
    nonLeadShare: {
      all: nonLead(ESTATES),
      ...Object.fromEntries(ESTATES.map((t) => [t, nonLead([t])])) as Record<Estate, number | null>,
    },
    cardsPerRegularVisit: ratio(sum((r) => r.regularCards), sum((r) => r.regularVisits)),
    cardsPerFinalAttempt: ratio(sum((r) => r.finalCards), sum((r) => r.finalAttempts)),
    failuresSurvivedPerVisit: ratio(sum((r) => r.failuresSurvived), visits),
    carriedPerDeparture: ratio(sum((r) => r.carriedAtDeparture), sum((r) => r.departures)),
    peakCarried: mean(records.map((r) => r.peakCarried)),
    skipsPerRun: runs === 0 ? 0 : sum((r) => r.skips) / runs,
    wipeoutsPerRun: runs === 0 ? 0 : sum((r) => r.wipeouts) / runs,
    retreatsPerRun: runs === 0 ? 0 : sum((r) => r.retreats) / runs,
  };
}

// ---------------------------------------------------------------------------
// Paired differences
// ---------------------------------------------------------------------------

export interface PairedDifference {
  /** Mean of (b − a) over pairs. */
  mean: number;
  low: number;
  high: number;
  n: number;
  /** True when the 95% interval excludes zero. */
  significant: boolean;
}

/**
 * Pairs records by (birthSign, seed) and returns the mean of value(b) − value(a)
 * with a normal 95% interval. Batch seeds are policy- and config-independent,
 * so this pairs both config-vs-config and policy-vs-policy comparisons.
 * Throws if the two groups do not cover the same seeds.
 */
export function pairedDifference(a: readonly BalanceRecord[], b: readonly BalanceRecord[],
  value: (r: BalanceRecord) => number, z = 1.959963984540054): PairedDifference {
  const key = (r: BalanceRecord) => `${r.birthSign}:${r.seed}`;
  const byKey = new Map(a.map((r) => [key(r), r]));
  if (byKey.size !== a.length || a.length !== b.length) throw new Error('paired groups must have the same unique seeds');
  const diffs = b.map((r) => {
    const other = byKey.get(key(r));
    if (!other) throw new Error(`no pair for ${key(r)}`);
    return value(r) - value(other);
  });
  const n = diffs.length;
  if (n < 2) throw new Error('paired difference needs at least two pairs');
  const m = diffs.reduce((s, d) => s + d, 0) / n;
  const variance = diffs.reduce((s, d) => s + (d - m) ** 2, 0) / (n - 1);
  const half = z * Math.sqrt(variance / n);
  return { mean: m, low: m - half, high: m + half, n, significant: m - half > 0 || m + half < 0 };
}

/** 1 for a victory by `week` (default: any victory), else 0. */
export const wonBy = (week = Infinity) => (r: BalanceRecord): number =>
  (r.victoryWeek !== null && r.victoryWeek <= week ? 1 : 0);
