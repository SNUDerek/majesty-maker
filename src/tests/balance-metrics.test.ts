import { describe, expect, it } from 'vitest';
import type { CampaignState, Estate, GameEvent } from '../core/types.js';
import {
  balanceRecord, pairedDifference, summarizeBalance, wonBy, type BalanceMeta, type BalanceRecord,
} from '../simulation/balance-metrics.js';
import { createBuildPolicy } from '../simulation/build-policy.js';
import { deriveBatchSeed, runCampaign } from '../simulation/runner.js';
import { loadContentConfig } from './support/config.js';

const meta: BalanceMeta = { policy: 'hybrid-b', config: 'test', seed: 1, birthSign: 'aries', lead: 'bellatores' };
const final = (stats: Record<Estate, number>): CampaignState =>
  ({ stats, fatigue: 0, melancholy: 0, treasury: 0 } as unknown as CampaignState);
const stat = (week: number, estate: Estate, amount: number, source: 'tutor' | 'job' | 'tutor_opposing' = 'tutor'): GameEvent =>
  ({ type: 'stat_changed', week, estate, amount, source });
const coin = (week: number, account: 'treasury' | 'carried', amount: number, source: string): GameEvent =>
  ({ type: 'coin_changed', week, account, amount, source } as GameEvent);
const resolved = (week: number, threat: Estate, approach: Estate, success: boolean, isFinal = false): GameEvent =>
  ({ type: 'encounter_resolved', week, segmentIndex: isFinal ? 5 : 0, isFinal, encounterIndex: 0, threat, approach,
    success, probability: 50, roll: success ? 1 : 99 });
const drawn = (week: number, threat: Estate): GameEvent => ({ type: 'encounter_drawn', week, threat, encounterIndex: 0 });

// Starting stats B20 O15 L15; two Knight lessons (the second clamped elsewhere is not counted), a job gain.
const events: GameEvent[] = [
  coin(0, 'treasury', -20, 'tutor_fee'), stat(0, 'bellatores', 5), stat(0, 'laboratores', -1, 'tutor_opposing'),
  coin(1, 'treasury', -20, 'tutor_fee'), stat(1, 'bellatores', 5),
  stat(2, 'oratores', 2, 'job'),
  // First departure, week 3: carry 30.
  coin(3, 'treasury', -10, 'departure_fee'), coin(3, 'treasury', -30, 'carry_out'), coin(3, 'carried', 30, 'carry_out'),
  { type: 'pilgrimage_started', week: 3, segmentIndex: 0, isFinal: false },
  drawn(3, 'oratores'), resolved(3, 'oratores', 'laboratores', false), coin(3, 'carried', -15, 'laboratores_penalty'),
  drawn(3, 'bellatores'), resolved(3, 'bellatores', 'bellatores', true), coin(3, 'carried', 4, 'encounter_reward'),
  { type: 'encounter_skipped', week: 3, encounterIndex: 2, source: 'new_moon_bribe' },
  { type: 'waystation_reached', week: 3, waystation: 1 },
  // Continued segment, wiped out on the second card.
  { type: 'pilgrimage_started', week: 4, segmentIndex: 1, isFinal: false },
  drawn(4, 'laboratores'), resolved(4, 'laboratores', 'bellatores', true),
  drawn(4, 'oratores'), resolved(4, 'oratores', 'bellatores', false),
  { type: 'wipeout', week: 4, cause: 'fatigue' }, coin(4, 'carried', -19, 'wipeout_lost'),
  // Second departure into the finale, won on one card.
  coin(8, 'treasury', -10, 'departure_fee'), coin(8, 'treasury', -50, 'carry_out'), coin(8, 'carried', 50, 'carry_out'),
  { type: 'pilgrimage_started', week: 8, segmentIndex: 5, isFinal: true },
  drawn(8, 'laboratores'), resolved(8, 'laboratores', 'bellatores', true, true),
  { type: 'victory', week: 9 },
];

describe('B2 balance record', () => {
  const r = balanceRecord(events, final({ bellatores: 30, oratores: 17, laboratores: 14 }), meta);

  it('reconstructs first-departure stats, lessons and tutor spend', () => {
    expect(r.firstDepartureWeek).toBe(3);
    expect(r.firstDepartureStats).toEqual({ bellatores: 30, oratores: 17, laboratores: 14 });
    expect(r.lessons).toEqual({ bellatores: 2, oratores: 0, laboratores: 0 });
    expect(r.tutorSpend).toBe(40);
    expect(r).toMatchObject({ outcome: 'victory', victoryWeek: 9, minFinalStat: 14, statSpread: 16 });
  });

  it('counts visits, cards, departures, purse and failures', () => {
    expect(r).toMatchObject({
      regularVisits: 2, regularCards: 4, finalAttempts: 1, finalCards: 1, departures: 2,
      carriedAtDeparture: 80, peakCarried: 50, failuresSurvived: 1, skips: 1, wipeouts: 1, retreats: 0,
    });
  });

  it('records non-lead approaches by threat', () => {
    expect(r.cardsByThreat).toEqual({
      oratores: { cards: 2, nonLead: 1 }, bellatores: { cards: 1, nonLead: 0 }, laboratores: { cards: 2, nonLead: 0 },
    });
    const noLead = balanceRecord(events, final({ bellatores: 30, oratores: 17, laboratores: 14 }), { ...meta, lead: null });
    expect(noLead.cardsByThreat.oratores.nonLead).toBe(0);
  });

  it('counts a rerolled card once, by its last approach', () => {
    const reroll: GameEvent[] = [drawn(0, 'oratores'), resolved(0, 'oratores', 'bellatores', false),
      { type: 'reroll_used', week: 0, itemId: 'metheglin', roll: 1 }, resolved(0, 'oratores', 'laboratores', true)];
    const rr = balanceRecord(reroll, final({ bellatores: 20, oratores: 15, laboratores: 15 }), meta);
    expect(rr.cardsByThreat.oratores).toEqual({ cards: 1, nonLead: 1 });
    expect(rr.failuresSurvived).toBe(0);
    expect(rr.outcome).toBe('unfinished');
  });

  it('matches real campaigns: visits equal pilgrimage starts and lessons never exceed weeks spent on tutors', () => {
    const config = loadContentConfig('rules.experimental.json');
    for (const i of [0, 1, 2]) {
      const seed = deriveBatchSeed(3, 'virgo', i);
      const result = runCampaign({ seed, sign: 'virgo', policy: createBuildPolicy('hybrid-l', config), config });
      const rec = balanceRecord(result.events, result.finalState, { ...meta, seed, birthSign: 'virgo', lead: 'laboratores' });
      const starts = result.events.filter((e) => e.type === 'pilgrimage_started').length;
      const tutorWeeks = result.events.filter((e) => e.type === 'week_spent' && e.reason === 'tutor').length;
      expect(rec.regularVisits + rec.finalAttempts).toBe(starts);
      expect(rec.lessons.bellatores + rec.lessons.oratores + rec.lessons.laboratores).toBeLessThanOrEqual(tutorWeeks);
      expect(rec.tutorSpend).toBe(-result.events.reduce((sum, e) =>
        sum + (e.type === 'coin_changed' && e.source === 'tutor_fee' ? e.amount : 0), 0));
      expect(rec.tutorSpend).toBeGreaterThan(0);
    }
  });
});

const rec = (seed: number, victoryWeek: number | null, min = 10, extra: Partial<BalanceRecord> = {}): BalanceRecord => ({
  ...balanceRecord([], final({ bellatores: min, oratores: min + 10, laboratores: min + 20 }), { ...meta, seed }),
  victoryWeek, outcome: victoryWeek === null ? 'deadline' : 'victory', ...extra,
});

describe('B2 summaries and paired differences', () => {
  it('reports win-by-week over all campaigns, winner-only weeks and ending eligibility', () => {
    const s = summarizeBalance([rec(1, 45, 35), rec(2, 65, 25), rec(3, 90, 45), rec(4, null, 50)]);
    expect(s.runs).toBe(4);
    expect(s.victoryRate.estimate).toBe(0.75);
    expect(s.winByWeek).toEqual({ 50: 0.25, 60: 0.25, 70: 0.5, 80: 0.5, 96: 0.75 });
    expect(s.winWeekMedian).toBe(65);
    expect(s.endingEligibility[20]).toEqual({ ofAll: 0.75, ofVictories: 1 });
    expect(s.endingEligibility[30]).toEqual({ ofAll: 0.5, ofVictories: 2 / 3 });
    expect(s.endingEligibility[40]).toEqual({ ofAll: 0.25, ofVictories: 1 / 3 });
    expect(s.statSpreadAtVictory.median).toBe(20);
  });

  it('averages the per-run non-lead share, skipping runs with no cards', () => {
    const cards = (b: number, nl: number) => ({ bellatores: { cards: b, nonLead: nl },
      oratores: { cards: 0, nonLead: 0 }, laboratores: { cards: 0, nonLead: 0 } });
    const s = summarizeBalance([rec(1, 50, 10, { cardsByThreat: cards(4, 1) }), rec(2, 50, 10, { cardsByThreat: cards(1, 1) }),
      rec(3, 50)]);
    expect(s.nonLeadShare.all).toBeCloseTo(0.625);
    expect(s.nonLeadShare.bellatores).toBeCloseTo(0.625);
    expect(s.nonLeadShare.oratores).toBeNull();
    expect(summarizeBalance([rec(1, 50, 10, { lead: null })]).nonLeadShare.all).toBeNull();
  });

  it('pairs by sign and seed regardless of order, with a 95% interval', () => {
    const a = [rec(1, 50), rec(2, null), rec(3, 60), rec(4, null)];
    const b = [rec(4, 70), rec(3, 60), rec(2, 80), rec(1, null)];
    const d = pairedDifference(a, b, wonBy());
    expect(d.n).toBe(4);
    expect(d.mean).toBeCloseTo(0.25); // +1 +1 0 -1
    const sd = Math.sqrt(((0.75 ** 2) * 2 + 0.25 ** 2 + 1.25 ** 2) / 3);
    expect(d.high - d.mean).toBeCloseTo(1.959963984540054 * sd / 2);
    expect(d.significant).toBe(false);
    expect(pairedDifference(a, b, wonBy(60)).mean).toBeCloseTo(-0.25);
    const lost = a.map((r) => ({ ...r, victoryWeek: null, outcome: 'deadline' as const }));
    const won = a.map((r) => ({ ...r, victoryWeek: 1, outcome: 'victory' as const }));
    expect(pairedDifference(lost, won, wonBy())).toMatchObject({ mean: 1, low: 1, high: 1, significant: true });
    expect(() => pairedDifference(a, b.slice(1), wonBy())).toThrow();
    expect(() => pairedDifference(a, [...b.slice(1), rec(9, 1)], wonBy())).toThrow(/no pair/);
  });
});
