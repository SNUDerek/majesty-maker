import { describe, expect, it } from 'vitest';
import { collectModifiers } from '../core/astrology.js';
import type { RulesConfig } from '../core/config.js';
import {
  applyActivityDeltas, jobSuccessChance, resolveJob, resolveRest, resolveTutor, type ActivityResolution,
} from '../core/economy.js';
import { d100, rollInt, type RngStreams } from '../core/rng.js';
import {
  RuleError, type ActivityId, type CampaignState, type JobId, type LunarPhase, type ModifierContext,
  type ModifierSet, type RestId, type SolarAspect, type TutorId,
} from '../core/types.js';
import { loadContentConfig } from './support/config.js';

const config = loadContentConfig();

const state: CampaignState = {
  version: 1, seed: 0, rng: { jobs: 0, encounters: 0, rewards: 0 },
  playerName: { first: 'Test', last: 'Player' }, scionName: 'Scion', birthSign: 'capricorn',
  elapsedWeeks: 7, stats: { bellatores: 20, oratores: 15, laboratores: 15 },
  fatigue: 30, melancholy: 30, treasury: 50, inventory: {},
  furthestWaystation: 0, phase: 'home', waxingStreak: 0,
};

function kindOf(id: ActivityId): ModifierContext['kind'] {
  if (Object.hasOwn(config.classes.tutors, id)) return 'tutor';
  return Object.hasOwn(config.jobs.definitions, id) ? 'job' : 'rest';
}

/** Modifiers for one activity; Waxing applies when `repeated` is set. */
function mods(activityId: ActivityId, solar: SolarAspect = 'none', lunar: LunarPhase = 'new', repeated = false): ModifierSet {
  return collectModifiers({
    activityId, kind: kindOf(activityId), solar, lunar,
    ...(repeated ? { previousActivityId: activityId } : {}),
  }, config);
}

/** Streams whose next jobs-stream d100 satisfies `accept`. */
function streamsWhere(accept: (roll: number) => boolean): RngStreams {
  for (let seed = 1; ; seed++) {
    if (accept(d100(seed).value)) return { jobs: seed, encounters: 11, rewards: 22 };
  }
}

/** Stats/burdens/treasury after applying the resolution, for compact assertions. */
function after(result: ActivityResolution, from: CampaignState = state) {
  const next = applyActivityDeltas(from, result.deltas);
  return { stats: next.stats, fatigue: next.fatigue, melancholy: next.melancholy, treasury: next.treasury };
}

const rng: RngStreams = { jobs: 5, encounters: 6, rewards: 7 };

describe('resolveTutor', () => {
  const opposingOf = { hedge_knight: 'laboratores', hermit: 'bellatores', smuggler: 'oratores' } as const;
  const targetOf = { hedge_knight: 'bellatores', hermit: 'oratores', smuggler: 'laboratores' } as const;
  const burdens: Record<TutorId, [number, number]> = { hedge_knight: [5, 0], hermit: [0, 5], smuggler: [5, 5] };
  const cases: [SolarAspect, LunarPhase, boolean, number, number][] = [
    // solar, lunar, repeated, expected gain, melancholy multiplier
    ['none', 'new', false, 5, 1],
    ['return', 'new', false, 6, 1], // floor(5 * 1.2)
    ['square', 'new', false, 6, 2], // floor(5 * 1.3), melancholy x2
    ['none', 'waxing', true, 5, 1], // floor(5 * 1.1)
    ['square', 'waxing', true, 7, 2], // floor(5 * 1.3 * 1.1) = floor(7.15)
    ['return', 'waxing', true, 6, 1], // floor(5 * 1.32)
    ['opposition', 'full', false, 5, 1], // job-only and inactive effects do nothing
  ];
  for (const tutor of ['hedge_knight', 'hermit', 'smuggler'] as const) {
    for (const [solar, lunar, repeated, gain, melancholyX] of cases) {
      it(`${tutor} under ${solar}/${lunar}${repeated ? ' (repeat)' : ''}`, () => {
        const result = resolveTutor(state, tutor, mods(tutor, solar, lunar, repeated), rng, config);
        const [fatigue, melancholy] = burdens[tutor];
        const stats = { ...state.stats };
        stats[targetOf[tutor]] += gain;
        stats[opposingOf[tutor]] -= 1;
        expect(after(result)).toEqual({
          stats, fatigue: 30 + fatigue, melancholy: 30 + melancholy * melancholyX, treasury: 30,
        });
        expect(result.rng).toBe(rng);
      });
    }
  }

  it('emits fee, stat and burden events for the current week', () => {
    expect(resolveTutor(state, 'smuggler', mods('smuggler', 'square'), rng, config).events).toEqual([
      { type: 'coin_changed', week: 7, account: 'treasury', amount: -20, source: 'tutor_fee' },
      { type: 'stat_changed', week: 7, estate: 'laboratores', amount: 6, source: 'tutor' },
      { type: 'stat_changed', week: 7, estate: 'oratores', amount: -1, source: 'tutor_opposing' },
      { type: 'burden_changed', week: 7, burden: 'fatigue', amount: 5, source: 'tutor' },
      { type: 'burden_changed', week: 7, burden: 'melancholy', amount: 10, source: 'tutor' },
    ]);
  });

  it('rejects an unaffordable tutor at 19 Coin without touching state or RNG', () => {
    const poor = { ...state, treasury: 19 };
    const snapshot = structuredClone(poor);
    let error: unknown;
    try {
      resolveTutor(poor, 'hermit', mods('hermit'), rng, config);
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(RuleError);
    expect((error as RuleError).code).toBe('INSUFFICIENT_FUNDS');
    expect(poor).toEqual(snapshot);
    expect(rng).toEqual({ jobs: 5, encounters: 6, rewards: 7 });
    expect(resolveTutor({ ...state, treasury: 20 }, 'hermit', mods('hermit'), rng, config).deltas.treasury).toBe(-20);
  });

  it('clamps the opposing stat at 0 and the target at statMax', () => {
    const edge = { ...state, stats: { bellatores: 98, oratores: 15, laboratores: 0 } };
    const result = resolveTutor(edge, 'hedge_knight', mods('hedge_knight'), rng, config);
    expect(result.deltas.stats).toEqual({ bellatores: 2, oratores: 0, laboratores: 0 });
    expect(result.events.filter((e) => e.type === 'stat_changed')).toEqual([
      { type: 'stat_changed', week: 7, estate: 'bellatores', amount: 2, source: 'tutor' },
    ]);
  });
});

describe('resolveJob', () => {
  const checked: [JobId, 'bellatores' | 'oratores' | 'laboratores'][] = [
    ['alehouse', 'laboratores'], ['village_watch', 'bellatores'], ['scriptorium', 'oratores'],
  ];

  it('computes clamped success chances with flat bonuses', () => {
    expect(jobSuccessChance(state, 'village_watch', mods('village_watch'), config)).toBe(55);
    expect(jobSuccessChance(state, 'village_watch', mods('village_watch', 'trine'), config)).toBe(70);
    const strong = { stats: { bellatores: 50, oratores: 0, laboratores: 15 } };
    expect(jobSuccessChance(strong, 'village_watch', mods('village_watch', 'trine'), config)).toBe(95);
    const harsh: RulesConfig = { ...config, jobs: { ...config.jobs, baseSuccessBonus: -100 } };
    expect(jobSuccessChance(strong, 'scriptorium', mods('scriptorium'), harsh)).toBe(5);
    expect(jobSuccessChance(state, 'stables', mods('stables', 'trine'), config)).toBeNull();
  });

  it('Stables always succeeds without an RNG draw', () => {
    for (const [solar, fatigue] of [['none', 2], ['opposition', 3]] as const) {
      const result = resolveJob(state, 'stables', mods('stables', solar), rng, config);
      expect(result.rng).toBe(rng);
      expect(result.events[0]).toEqual({
        type: 'job_resolved', week: 7, job: 'stables', success: true, probability: 100, automatic: true,
      });
      expect(after(result)).toEqual({
        stats: { ...state.stats, laboratores: 16 }, fatigue: 30 + fatigue, melancholy: 30 + fatigue, treasury: 56,
      });
    }
    // Waxing repeat: floor(6 * 1.1) = 6 Coin, floor(1 * 1.1) = 1 stat.
    expect(after(resolveJob(state, 'stables', mods('stables', 'none', 'waxing', true), rng, config)).treasury).toBe(56);
  });

  for (const [job, stat] of checked) {
    const chance = state.stats[stat] + 35;
    const success = config.jobs.definitions[job].success;
    const failure = config.jobs.definitions[job].failure;

    it(`${job} succeeds on roll <= ${chance} and records the draw`, () => {
      const streams = streamsWhere((roll) => roll === chance);
      const result = resolveJob(state, job, mods(job), streams, config);
      expect(result.events[0]).toEqual({
        type: 'job_resolved', week: 7, job, success: true, probability: chance, roll: chance, automatic: false,
      });
      const next = after(result);
      expect(next.stats[stat]).toBe(state.stats[stat] + 2);
      expect(next.fatigue).toBe(30 + success.fatigue);
      expect(next.melancholy).toBe(30 + success.melancholy);
      if (job !== 'alehouse') expect(next.treasury).toBe(65);
      expect(result.rng.encounters).toBe(11);
      expect(result.rng.rewards).toBe(22);
    });

    it(`${job} fails on roll ${chance + 1}: no Coin, no growth, failure burdens`, () => {
      const streams = streamsWhere((roll) => roll === chance + 1);
      const result = resolveJob(state, job, mods(job), streams, config);
      expect(result.events[0]).toMatchObject({ success: false, roll: chance + 1 });
      expect(after(result)).toEqual({
        stats: state.stats, fatigue: 30 + failure.fatigue, melancholy: 30 + failure.melancholy, treasury: 50,
      });
      expect(result.rng.jobs).toBe(d100(streams.jobs).state);
    });

    it(`${job} under Opposition multiplies success and failure burdens by 1.5`, () => {
      const win = after(resolveJob(state, job, mods(job, 'opposition'), streamsWhere((r) => r === 1), config));
      expect(win.fatigue - 30).toBe(Math.floor(success.fatigue * 1.5));
      expect(win.melancholy - 30).toBe(Math.floor(success.melancholy * 1.5));
      const loss = after(resolveJob(state, job, mods(job, 'opposition'), streamsWhere((r) => r === 100), config));
      expect(loss.fatigue - 30).toBe(Math.floor(failure.fatigue * 1.5));
      expect(loss.melancholy - 30).toBe(Math.floor(failure.melancholy * 1.5));
    });

    it(`${job} under Trine succeeds on a roll 15 points higher`, () => {
      const streams = streamsWhere((roll) => roll === chance + 15);
      const result = resolveJob(state, job, mods(job, 'trine'), streams, config);
      expect(result.events[0]).toMatchObject({ success: true, probability: chance + 15 });
      expect(resolveJob(state, job, mods(job), streams, config).events[0]).toMatchObject({ success: false });
    });
  }

  it('applies Waxing to payout and gain, flooring each once (Opposition + Waxing job)', () => {
    const streams = streamsWhere((r) => r === 1);
    const result = resolveJob(state, 'village_watch', mods('village_watch', 'opposition', 'waxing', true), streams, config);
    expect(after(result)).toEqual({
      // floor(15 * 1.1) = 16 Coin, floor(2 * 1.1) = 2 stat, floor(5 * 1.5) = 7 Fatigue.
      stats: { ...state.stats, bellatores: 22 }, fatigue: 37, melancholy: 30, treasury: 66,
    });
    const notRepeated = resolveJob(state, 'village_watch', mods('village_watch', 'none', 'waxing'), streams, config);
    expect(after(notRepeated).treasury).toBe(65);
  });

  it('pays Alehouse 11-20 Coin, drawing the d10 only on success', () => {
    const seen = new Set<number>();
    for (let seed = 1; seen.size < 10 && seed < 10_000; seed++) {
      const streams = { jobs: seed, encounters: 0, rewards: 0 };
      const roll = d100(seed);
      const result = resolveJob(state, 'alehouse', mods('alehouse'), streams, config);
      if (roll.value <= 50) {
        const die = rollInt(roll.state, 1, 10);
        expect(result.deltas.treasury).toBe(10 + die.value);
        expect(result.rng.jobs).toBe(die.state);
        seen.add(result.deltas.treasury);
      } else {
        expect(result.deltas.treasury).toBe(0);
        expect(result.rng.jobs).toBe(roll.state);
      }
    }
    expect([...seen].sort((a, b) => a - b)).toEqual([11, 12, 13, 14, 15, 16, 17, 18, 19, 20]);
  });

  it('clamps payouts at treasuryMax', () => {
    const rich = { ...state, treasury: config.startingState.treasuryMax - 3 };
    const result = resolveJob(rich, 'stables', mods('stables'), rng, config);
    expect(result.deltas.treasury).toBe(3);
    expect(result.events).toContainEqual({ type: 'coin_changed', week: 7, account: 'treasury', amount: 3, source: 'job_payout' });
  });

  it('is deterministic and does not mutate its inputs', () => {
    const streams = streamsWhere((r) => r <= 50);
    const snapshot = structuredClone({ state, streams });
    const first = resolveJob(state, 'alehouse', mods('alehouse'), streams, config);
    expect(resolveJob(state, 'alehouse', mods('alehouse'), streams, config)).toEqual(first);
    expect({ state, streams }).toEqual(snapshot);
  });
});

describe('resolveRest', () => {
  const table: Record<RestId, [number, number, number]> = {
    rest_home: [0, 15, 15], bathhouse: [15, 40, 10], shrine: [15, 10, 40], banquet: [30, 35, 35],
  };
  const tired = { ...state, fatigue: 70, melancholy: 70, treasury: 100 };

  for (const [rest, [cost, fatigue, melancholy]] of Object.entries(table) as [RestId, [number, number, number]][]) {
    it(`${rest} costs ${cost} and recovers ${fatigue}/${melancholy}`, () => {
      const result = resolveRest(tired, rest, mods(rest), rng, config);
      expect(after(result, tired)).toEqual({
        stats: state.stats, fatigue: 70 - fatigue, melancholy: 70 - melancholy, treasury: 100 - cost,
      });
      expect(result.rng).toBe(rng);
    });

    it(`${rest} in a Waning week`, () => {
      const paid = rest !== 'rest_home';
      const result = resolveRest(tired, rest, mods(rest, 'none', 'waning'), rng, config);
      expect(after(result, tired)).toMatchObject({
        fatigue: 70 - (paid ? Math.floor(fatigue * 1.5) : fatigue),
        melancholy: 70 - (paid ? Math.floor(melancholy * 1.5) : melancholy),
      });
    });
  }

  it('makes Waning Rest at Home recovery opt-in', () => {
    const variant: RulesConfig = { ...config, astrology: { ...config.astrology,
      waning: { ...config.astrology.waning, appliesToRestAtHome: true } } };
    const modifiers = collectModifiers({ activityId: 'rest_home', kind: 'rest', solar: 'none', lunar: 'waning' }, variant);
    expect(resolveRest(tired, 'rest_home', modifiers, rng, variant).deltas).toMatchObject({ fatigue: -22, melancholy: -22 });
  });

  it('halves the Banquet in the Solar Return month, including a Waning week', () => {
    const result = resolveRest({ ...tired, treasury: 15 }, 'banquet', mods('banquet', 'return', 'waning'), rng, config);
    // floor(35 * 1.5) = 52 recovery from 70.
    expect(result.deltas).toEqual({ stats: { bellatores: 0, oratores: 0, laboratores: 0 }, fatigue: -52, melancholy: -52, treasury: -15 });
    expect(() => resolveRest({ ...tired, treasury: 29 }, 'banquet', mods('banquet'), rng, config))
      .toThrow(expect.objectContaining({ code: 'INSUFFICIENT_FUNDS' }));
  });

  it('floors burdens at 0 and reports only the recovery applied', () => {
    const fresh = { ...state, fatigue: 5, melancholy: 0 };
    const result = resolveRest(fresh, 'rest_home', mods('rest_home'), rng, config);
    expect(result.deltas).toMatchObject({ fatigue: -5, melancholy: 0 });
    expect(result.events).toEqual([
      { type: 'burden_changed', week: 7, burden: 'fatigue', amount: -5, source: 'rest' },
    ]);
  });

  it('rejects unaffordable paid rest with INSUFFICIENT_FUNDS', () => {
    expect(() => resolveRest({ ...state, treasury: 14 }, 'shrine', mods('shrine'), rng, config))
      .toThrow(expect.objectContaining({ code: 'INSUFFICIENT_FUNDS' }));
    expect(resolveRest({ ...state, treasury: 0 }, 'rest_home', mods('rest_home'), rng, config).deltas.treasury).toBe(0);
  });
});

describe('invalid activity ids', () => {
  it('throw INVALID_ACTION', () => {
    const bad = 'nope' as never;
    for (const resolve of [resolveTutor, resolveJob, resolveRest]) {
      expect(() => resolve(state, bad, mods('rest_home'), rng, config))
        .toThrow(expect.objectContaining({ code: 'INVALID_ACTION' }));
    }
  });
});


describe('enabled experimental lunar bonuses', () => {
  const variant: RulesConfig = {
    ...config,
    astrology: {
      ...config.astrology,
      newMoon: { ...config.astrology.newMoon, activityBonus: 25 },
      fullMoon: { ...config.astrology.fullMoon, surge: 25 },
    },
  };

  for (const [tutor, lunar, solar, estate, gain] of [
    ['smuggler', 'new', 'square', 'laboratores', 8],
    ['hedge_knight', 'full', 'return', 'bellatores', 7],
    ['hermit', 'full', 'square', 'oratores', 8],
  ] as const) {
    it(`${tutor} combines enabled ${lunar} bonuses with ${solar}, flooring once`, () => {
      const modifiers = collectModifiers({ activityId: tutor, kind: 'tutor', solar, lunar }, variant);
      const result = resolveTutor(state, tutor, modifiers, rng, variant);
      expect(result.deltas.stats[estate]).toBe(gain);
      expect(result.deltas.treasury).toBe(-20);
      expect(result.rng).toBe(rng);
    });
  }

  for (const [job, lunar, estate] of [
    ['alehouse', 'new', 'laboratores'],
    ['village_watch', 'full', 'bellatores'],
    ['scriptorium', 'full', 'oratores'],
  ] as const) {
    it(`${job} applies enabled ${lunar} bonuses only to successful growth and payout`, () => {
      const modifiers = collectModifiers({ activityId: job, kind: 'job', solar: 'none', lunar }, variant);
      const streams = streamsWhere((r) => r === 1);
      const result = resolveJob(state, job, modifiers, streams, variant);
      const baseCoin = job === 'alehouse' ? 10 + rollInt(d100(streams.jobs).state, 1, 10).value : 15;
      expect(result.deltas.treasury).toBe(Math.floor(baseCoin * 125 / 100));
      expect(result.deltas.stats[estate]).toBe(2);
      const failed = resolveJob(state, job, modifiers, streamsWhere((r) => r === 100), variant);
      expect(failed.deltas.treasury).toBe(0);
      expect(failed.deltas.stats).toEqual({ bellatores: 0, oratores: 0, laboratores: 0 });
    });
  }
});
