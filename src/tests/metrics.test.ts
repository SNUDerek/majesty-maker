/** E2: run records and aggregates, tested on synthetic event streams plus a real-campaign consistency check. */
import { describe, expect, it } from 'vitest';
import { applyAction, createCampaign, getAvailableActions } from '../core/index.js';
import type { CampaignState, Estate, GameEvent, ZodiacSign } from '../core/types.js';
import {
  aggregate,
  aggregateGroup,
  distribution,
  matchupOf,
  quantile,
  runMetaFromConfig,
  runRecord,
  wilsonInterval,
  type RunMeta,
  type RunRecord,
} from '../simulation/metrics.js';
import { selectAction } from './fuzz/walker.js';
import { loadContentConfig } from './support/config.js';

const BEATS: Record<Estate, Estate> = { bellatores: 'laboratores', laboratores: 'oratores', oratores: 'bellatores' };
const TOTAL = 8;

function meta(overrides: Partial<RunMeta> = {}): RunMeta {
  return {
    seed: 1, birthSign: 'aries', policy: 'test', configId: 'cfg', totalWeeks: TOTAL, medicalFeeMax: 50,
    beats: BEATS, finalCeilings: { fatigue: 100, melancholy: 100 }, finalAge: 16, ...overrides,
  };
}

function finalState(overrides: Partial<CampaignState> = {}): CampaignState {
  return {
    version: 1, seed: 1, rng: { jobs: 1, encounters: 2, rewards: 3 }, playerName: { first: 'A', last: 'B' },
    scionName: 'C', birthSign: 'aries', elapsedWeeks: TOTAL,
    stats: { bellatores: 20, oratores: 15, laboratores: 15 },
    fatigue: 0, melancholy: 0, treasury: 0, inventory: {}, furthestWaystation: 0, phase: 'defeat',
    waxingStreak: 0, outcome: 'deadline', ...overrides,
  };
}

const week = (w: number, reason: Extract<GameEvent, { type: 'week_spent' }>['reason']): GameEvent =>
  ({ type: 'week_spent', week: w, reason });
const coin = (w: number, account: 'treasury' | 'carried', amount: number,
  source: Extract<GameEvent, { type: 'coin_changed' }>['source']): GameEvent =>
  ({ type: 'coin_changed', week: w, account, amount, source });
const resolved = (w: number, segmentIndex: number, encounterIndex: number, threat: Estate, approach: Estate,
  success: boolean, probability: number, isFinal = false): GameEvent =>
  ({ type: 'encounter_resolved', week: w, segmentIndex, isFinal, encounterIndex, threat, approach, success,
    probability, roll: success ? 1 : 99 });

describe('matchupOf', () => {
  it('classifies with the configured beats cycle', () => {
    expect(matchupOf('bellatores', 'laboratores', BEATS)).toBe('advantage');
    expect(matchupOf('laboratores', 'bellatores', BEATS)).toBe('disadvantage');
    expect(matchupOf('oratores', 'oratores', BEATS)).toBe('neutral');
  });
});

describe('runRecord: home weeks, Coin and series', () => {
  // Start: treasury 50, fatigue 0. Weeks 0–7 alternate job (+10, +5 fatigue) and tutor (−10).
  const events: GameEvent[] = [];
  for (let w = 0; w < TOTAL; w++) {
    if (w % 2 === 0) {
      events.push({ type: 'job_resolved', week: w, job: 'alehouse', success: w !== 4, probability: 70, roll: 10,
        automatic: false });
      if (w !== 4) events.push(coin(w, 'treasury', 10, 'job_payout'));
      events.push({ type: 'burden_changed', week: w, burden: 'fatigue', amount: 5, source: 'job' });
      events.push(week(w, 'job'));
    } else {
      events.push(coin(w, 'treasury', -10, 'tutor_fee'));
      events.push(week(w, 'tutor'));
    }
  }
  events.push({ type: 'deadline', week: TOTAL });
  const record = runRecord(events, finalState({ treasury: 50 - 10, fatigue: 20 }), meta());

  it('counts weeks, jobs and outcome', () => {
    expect(record.weeks).toEqual({ tutor: 4, job: 4, rest: 0, segment_entry: 0, convalescence: 0, unused: 0 });
    expect(record.jobs.alehouse).toEqual({ attempts: 4, successes: 3 });
    expect(record.outcome).toBe('deadline');
    expect(record.victoryWeek).toBeNull();
  });

  it('splits Coin into earned and spent', () => {
    expect(record.coinEarned).toBe(30);
    expect(record.coinSpent).toBe(40);
    expect(record.coinLost).toBe(0);
    expect(record.coinBySource).toEqual({ job_payout: 30, tutor_fee: -40 });
  });

  it('reconstructs end-of-week balances from the final state', () => {
    expect(record.treasuryByWeek).toEqual([60, 50, 60, 50, 50, 40, 50, 40]);
    expect(record.fatigueByWeek).toEqual([5, 5, 10, 10, 15, 15, 20, 20]);
    expect(record.zeroPurseWeeks).toBe(0);
    expect(record.failureAttribution).toBe('deadline');
  });

  it('attributes a deadline to a resource loop after a late empty purse', () => {
    const broke: GameEvent[] = [coin(0, 'treasury', -50, 'tutor_fee'), week(0, 'tutor')];
    for (let w = 1; w < TOTAL; w++) broke.push(week(w, 'job'));
    broke.push({ type: 'deadline', week: TOTAL });
    const r = runRecord(broke, finalState({ treasury: 0 }), meta());
    expect(r.zeroPurseWeeks).toBe(TOTAL);
    expect(r.failureAttribution).toBe('resource_loop');
    expect(runRecord(broke, finalState({ treasury: 0 }), meta(), { resourceLoopWindowWeeks: 0 }).failureAttribution)
      .toBe('deadline');
  });
});

describe('runRecord: pilgrimage', () => {
  it('counts a Metheglin reroll as two rolls but one encounter outcome', () => {
    const events: GameEvent[] = [
      coin(0, 'treasury', -5, 'departure_fee'),
      coin(0, 'treasury', -20, 'carry_out'),
      coin(0, 'carried', 20, 'carry_out'),
      { type: 'item_changed', week: 0, itemId: 'metheglin', amount: -1, source: 'pilgrimage_slot_out' },
      week(0, 'segment_entry'),
      { type: 'pilgrimage_started', week: 0, segmentIndex: 0, isFinal: false },
      { type: 'encounter_drawn', week: 0, threat: 'laboratores', encounterIndex: 0 },
      resolved(1, 0, 0, 'laboratores', 'bellatores', false, 60),
      { type: 'item_changed', week: 1, itemId: 'metheglin', amount: 0, source: 'consumed' },
      { type: 'consumable_used', week: 1, itemId: 'metheglin' },
      resolved(1, 0, 0, 'laboratores', 'bellatores', true, 60),
      { type: 'reroll_used', week: 1, itemId: 'metheglin', roll: 1 },
      coin(1, 'carried', 3, 'encounter_reward'),
      { type: 'encounter_drawn', week: 1, threat: 'bellatores', encounterIndex: 1 },
      resolved(1, 0, 1, 'bellatores', 'bellatores', false, 40),
      coin(1, 'carried', -3, 'laboratores_penalty'),
      { type: 'retreat', week: 1, segmentIndex: 0 },
      coin(1, 'carried', -20, 'bank_carried'),
      coin(1, 'treasury', 20, 'bank_carried'),
    ];
    for (let w = 1; w < TOTAL; w++) events.push(week(w, 'rest'));
    events.push({ type: 'deadline', week: TOTAL });
    const r = runRecord(events, finalState({ treasury: 45 }), meta());

    expect(r.encounterRolls).toBe(3);
    expect(r.rerolls).toBe(1);
    expect(r.encounters['laboratores:bellatores']).toEqual({ attempts: 1, successes: 1, probabilitySum: 60 });
    expect(r.encounters['bellatores:bellatores']).toEqual({ attempts: 1, successes: 0, probabilitySum: 40 });
    expect(r.encountersByMatchup.advantage.attempts).toBe(1);
    expect(r.encountersByMatchup.neutral.attempts).toBe(1);
    expect(r.encountersByMatchup.disadvantage.attempts).toBe(0);
    expect(r.items.metheglin).toEqual({ acquired: 0, sentOut: 1, returned: 0, used: 1, lost: 0 });
    expect(r.segmentStarts).toBe(1);
    expect(r.retreats).toBe(1);
    expect(r.weeks.segment_entry).toBe(1);
    // Transfers net to zero; only fees, rewards and losses count.
    expect(r.coinBySource.carry_out).toBe(0);
    expect(r.coinBySource.bank_carried).toBe(0);
    expect([r.coinEarned, r.coinSpent, r.coinLost]).toEqual([3, 5, 3]);
    expect(r.treasuryByWeek[0]).toBe(25); // 50 − fee − carry
  });

  it('records wipeout causes and medical-fee shortfalls', () => {
    const wipe = (w: number, cause: 'coin' | 'fatigue', fee: number): GameEvent[] => [
      week(w, 'segment_entry'),
      { type: 'pilgrimage_started', week: w, segmentIndex: 0, isFinal: false },
      { type: 'wipeout', week: w + 1, cause },
      coin(w + 1, 'carried', -4, 'wipeout_lost'),
      coin(w + 1, 'carried', -1, 'wipeout_retained'),
      coin(w + 1, 'treasury', 1, 'wipeout_retained'),
      ...(fee === 0 ? [] : [coin(w + 1, 'treasury', -fee, 'medical_fee')]),
      { type: 'convalescence', week: w + 1, cause: 'wipeout' },
      week(w + 1, 'convalescence'),
    ];
    const events = [...wipe(0, 'coin', 50), ...wipe(2, 'fatigue', 20), ...wipe(4, 'coin', 0),
      week(6, 'job'), week(7, 'job'), { type: 'deadline', week: TOTAL } as GameEvent];
    const r = runRecord(events, finalState({ treasury: 0 }), meta());
    expect(r.wipeouts).toBe(3);
    expect(r.wipeoutCauses).toEqual({ fatigue: 1, melancholy: 0, both: 0, coin: 2 });
    expect(r.medicalFeeShortfalls).toBe(2);
    expect(r.weeks.convalescence).toBe(3);
    expect(r.coinLost).toBe(12);
    expect(r.coinSpent).toBe(70);
    expect(r.failureAttribution).toBe('resource_loop');
  });

  it('tracks the best final-gauntlet attempt, skips included, and frees unused weeks on victory', () => {
    const events: GameEvent[] = [
      week(0, 'segment_entry'),
      { type: 'pilgrimage_started', week: 0, segmentIndex: 3, isFinal: true },
      resolved(1, 3, 0, 'oratores', 'bellatores', true, 70, true),
      resolved(1, 3, 1, 'oratores', 'bellatores', false, 70, true),
      { type: 'retreat', week: 1, segmentIndex: 3 },
      week(1, 'segment_entry'),
      { type: 'pilgrimage_started', week: 1, segmentIndex: 3, isFinal: true },
      resolved(2, 3, 0, 'oratores', 'bellatores', true, 70, true),
      { type: 'encounter_skipped', week: 2, encounterIndex: 1, source: 'new_moon_bribe' },
      resolved(2, 3, 2, 'oratores', 'bellatores', true, 70, true),
      { type: 'victory', week: 2 },
    ];
    const r = runRecord(events, finalState({ elapsedWeeks: 2, phase: 'victory', outcome: 'victory', furthestWaystation: 3 }),
      meta());
    expect(r.outcome).toBe('victory');
    expect(r.victoryWeek).toBe(2);
    expect(r.finalAttempts).toBe(2);
    expect(r.finalEncountersCompleted).toBe(3);
    expect(r.encountersSkipped).toBe(1);
    expect(r.weeks.unused).toBe(6);
    expect(r.failureAttribution).toBe('none');
    expect(r.fatigueByWeek).toHaveLength(TOTAL);
  });

  it('counts survived failed final checks, excluding fatal and pending checks', () => {
    const start: GameEvent[] = [
      week(0, 'segment_entry'),
      { type: 'pilgrimage_started', week: 0, segmentIndex: 3, isFinal: true },
      resolved(1, 3, 0, 'oratores', 'bellatores', false, 10, true),
      { type: 'burden_changed', week: 1, burden: 'fatigue', amount: 15, source: 'encounter_penalty' },
      { type: 'encounter_drawn', week: 1, threat: 'oratores', encounterIndex: 1 },
      resolved(1, 3, 1, 'oratores', 'bellatores', false, 10, true),
    ];
    const won = runRecord([...start, { type: 'victory', week: 1 }],
      finalState({ elapsedWeeks: 1, fatigue: 30, phase: 'victory', outcome: 'victory' }), meta());
    expect(won.finalEncountersCompleted).toBe(2);
    expect(won.encountersByMatchup.disadvantage.successes).toBe(0);

    const wiped = runRecord([...start, { type: 'wipeout', week: 1, cause: 'fatigue' }],
      finalState({ elapsedWeeks: 1 }), meta());
    expect(wiped.finalEncountersCompleted).toBe(1);

    const state = createCampaign({ seed: 1, birthSign: 'aries', playerName: { first: 'A', last: 'B' },
      scionName: 'C' }, loadContentConfig());
    const road = applyAction(state, { type: 'BEGIN_PILGRIMAGE', carry: 0 }, loadContentConfig()).state.pilgrimage!;
    const pending = runRecord(start, finalState({ elapsedWeeks: 1, phase: 'pilgrimage',
      pilgrimage: { ...road, isFinal: true, encounterIndex: 1, pendingFailure: true } }), meta());
    expect(pending.finalEncountersCompleted).toBe(1);
  });

  it.each([2, TOTAL])('settles final-week balances at elapsed week %i', (endWeek) => {
    const events: GameEvent[] = [
      coin(endWeek - 1, 'treasury', -20, 'carry_out'),
      coin(endWeek - 1, 'carried', 20, 'carry_out'),
      week(endWeek - 1, 'segment_entry'),
      { type: 'pilgrimage_started', week: endWeek - 1, segmentIndex: 3, isFinal: true },
      resolved(endWeek, 3, 0, 'oratores', 'bellatores', false, 10, true),
      { type: 'burden_changed', week: endWeek, burden: 'fatigue', amount: 15, source: 'encounter_penalty' },
      coin(endWeek, 'carried', -20, 'bank_carried'),
      coin(endWeek, 'treasury', 20, 'bank_carried'),
      { type: 'victory', week: endWeek },
    ];
    const r = runRecord(events, finalState({ elapsedWeeks: endWeek, phase: 'victory', outcome: 'victory', treasury: 20, fatigue: 15 }), meta());
    expect(r.treasuryByWeek[endWeek - 1]).toBe(20);
    expect(r.treasuryByWeek.at(-1)).toBe(20);
    expect(r.fatigueByWeek.at(-1)).toBe(15);
  });

  it('reports empty treasury separately from an empty total purse', () => {
    const events: GameEvent[] = [
      coin(0, 'treasury', -20, 'carry_out'), coin(0, 'carried', 20, 'carry_out'),
      week(0, 'segment_entry'),
    ];
    const state = createCampaign({ seed: 1, birthSign: 'aries', playerName: { first: 'A', last: 'B' },
      scionName: 'C' }, loadContentConfig());
    const road = applyAction(state, { type: 'BEGIN_PILGRIMAGE', carry: 20 }, loadContentConfig()).state.pilgrimage!;
    const r = runRecord(events, finalState({ elapsedWeeks: 1, phase: 'pilgrimage', treasury: 0,
      pilgrimage: { ...road, carriedCoin: 20 } }), meta());
    expect(r.zeroTreasuryWeeks).toBe(1);
    expect(r.zeroPurseWeeks).toBe(0);
    expect(aggregateGroup([r], 'test', 'aries')).toMatchObject({
      zeroTreasuryRunRate: 1, zeroTreasuryWeeks: { mean: 1 }, zeroPurseRunRate: 0,
    });
  });

  it('keeps the first week each waystation was reached', () => {
    const events: GameEvent[] = [
      { type: 'waystation_reached', week: 3, waystation: 1 },
      { type: 'waystation_reached', week: 5, waystation: 1 },
      { type: 'waystation_reached', week: 6, waystation: 2 },
      { type: 'deadline', week: TOTAL },
    ];
    expect(runRecord(events, finalState({ furthestWaystation: 2 }), meta()).firstReachWeek).toEqual({ 1: 3, 2: 6 });
  });
});

describe('statistics helpers', () => {
  it('computes Wilson 95% intervals', () => {
    const half = wilsonInterval(5, 10);
    expect(half.estimate).toBe(0.5);
    expect(half.low).toBeCloseTo(0.2366, 4);
    expect(half.high).toBeCloseTo(0.7634, 4);
    expect(wilsonInterval(0, 10).low).toBe(0);
    expect(wilsonInterval(0, 10).high).toBeCloseTo(0.2775, 4);
    expect(wilsonInterval(0, 0)).toEqual({ estimate: 0, low: 0, high: 1 });
  });

  it('interpolates quantiles and summarizes distributions', () => {
    expect(quantile([1, 2, 3, 4], 0.5)).toBe(2.5);
    expect(quantile([], 0.5)).toBeNull();
    expect(distribution([3, 1, 2])).toMatchObject({ n: 3, mean: 2, min: 1, median: 2, max: 3 });
  });
});

describe('aggregate', () => {
  const make = (policy: string, birthSign: ZodiacSign, victoryWeek: number | null): RunRecord => {
    const events: GameEvent[] = victoryWeek === null
      ? [week(0, 'job'), { type: 'deadline', week: TOTAL }]
      : [week(0, 'job'), { type: 'waystation_reached', week: 0, waystation: 1 }, { type: 'victory', week: victoryWeek }];
    const state = victoryWeek === null
      ? finalState({ birthSign, treasury: 5 })
      : finalState({ birthSign, elapsedWeeks: victoryWeek, phase: 'victory', outcome: 'victory', furthestWaystation: 1,
        treasury: 5 });
    return runRecord(events, state, meta({ policy, birthSign }));
  };

  const records = [
    make('b', 'leo', null), make('a', 'aries', 4), make('a', 'aries', 6), make('a', 'aries', null),
    make('a', 'leo', 2),
  ];

  it('groups by policy then sign, with an all-signs row', () => {
    const rows = aggregate(records);
    expect(rows.map((r) => `${r.policy}/${r.birthSign}`)).toEqual(['a/aries', 'a/leo', 'a/all', 'b/leo', 'b/all']);
    expect(aggregate(records, { includeAllSigns: false })).toHaveLength(3);
  });

  it('summarizes victory, checkpoints and calendar use', () => {
    const g = aggregateGroup(records.filter((r) => r.policy === 'a' && r.birthSign === 'aries'), 'a', 'aries');
    expect(g.runs).toBe(3);
    expect(g.victories).toBe(2);
    expect(g.victoryRate.estimate).toBeCloseTo(2 / 3);
    expect(g.victoryWeek.median).toBe(5);
    expect(g.outcomes).toEqual({ victory: 2, deadline: 1, unfinished: 0 });
    expect(g.checkpoints).toEqual({ 0: 1, 1: 2 });
    expect(g.firstReach[1]).toMatchObject({ reached: 2 });
    expect(g.failureAttribution).toEqual({ none: 2, deadline: 1, resource_loop: 0 });
    const used = Object.values(g.calendarUtilization).reduce((a, b) => a + b, 0);
    expect(used).toBeCloseTo(1);
    expect(g.calendarUtilization.job).toBeCloseTo(3 / 24);
    expect(g.conditionByWeek.treasury).toHaveLength(TOTAL);
    expect(g.medicalFeeShortfallRate).toBeNull();
  });
});

describe('runRecord on real campaigns', () => {
  const config = loadContentConfig();

  it('is consistent with the final state for random legal walks', () => {
    for (let seed = 1; seed <= 20; seed++) {
      let state = createCampaign({ seed, birthSign: 'leo', playerName: { first: 'A', last: 'B' }, scionName: 'C' }, config);
      const start = { treasury: state.treasury, fatigue: state.fatigue, melancholy: state.melancholy };
      const events: GameEvent[] = [];
      let policyRandom = seed * 7919;
      for (let step = 0; step < 20_000 && state.phase !== 'victory' && state.phase !== 'defeat'; step++) {
        const choice = selectAction(getAvailableActions(state, config), policyRandom);
        policyRandom = choice.state;
        const result = applyAction(state, choice.value, config);
        events.push(...result.events);
        state = result.state;
      }
      const r = runRecord(events, state, runMetaFromConfig(state, config, { policy: 'random', configId: 'default' }));

      const { weeks } = r;
      expect(weeks.tutor + weeks.job + weeks.rest + weeks.segment_entry + weeks.convalescence + weeks.unused)
        .toBe(config.calendar.totalWeeks);
      expect(r.outcome).toBe(state.outcome);
      // Reconstruction back to week 0 agrees with createCampaign.
      const firstWeekEvents = events.filter((e) => e.week === 0);
      const delta = (pred: (e: GameEvent) => number) => firstWeekEvents.reduce((s, e) => s + pred(e), 0);
      expect(r.treasuryByWeek[0]).toBe(start.treasury
        + delta((e) => (e.type === 'coin_changed' && e.account === 'treasury' ? e.amount : 0)));
      expect(r.fatigueByWeek[0]).toBe(start.fatigue
        + delta((e) => (e.type === 'burden_changed' && e.burden === 'fatigue' ? e.amount : 0)));
      expect(r.treasuryByWeek.at(-1)).toBe(state.treasury);
      expect(r.coinBySource.carry_out ?? 0).toBe(0);
      const decided = Object.values(r.encounters).reduce((s, t) => s + t.attempts, 0);
      expect(decided).toBe(r.encounterRolls - r.rerolls);
      expect(r.finalCeilings.fatigue).toBeGreaterThan(0);
    }
  });
});
