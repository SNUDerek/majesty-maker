import { describe, expect, it, vi } from 'vitest';
import { applyAction, createCampaign } from '../core/index.js';
import { withOverrides } from '../core/config.js';
import type { GameAction } from '../core/types.js';
import { deriveBatchSeed, runCampaign, type Policy } from '../simulation/runner.js';
import * as invariants from './invariants.js';
import { loadContentConfig } from './support/config.js';

const config = loadContentConfig();
const resting: Policy = {
  id: 'test-rest', params: {}, decide: () => ({ type: 'REST', rest: 'rest_home' }),
};
const pilgrim: Policy = {
  id: 'test-pilgrim', params: {},
  decide(_state, available) {
    const departure = available.find((a) => a.type === 'BEGIN_PILGRIMAGE');
    if (departure?.type === 'BEGIN_PILGRIMAGE') {
      return {
        type: 'BEGIN_PILGRIMAGE', carry: departure.maxCarry,
        consumableId: departure.consumableIds.includes('metheglin') ? 'metheglin' : undefined,
      };
    }
    const priorities: GameAction['type'][] = [
      'USE_CONSUMABLE', 'CHOOSE_APPROACH', 'CONTINUE_ENCOUNTER', 'CONTINUE_SEGMENT',
      'ACCEPT_RESULT', 'RETURN_HOME', 'REST',
    ];
    for (const type of priorities) {
      const action = available.find((a) => a.type === type);
      if (action && action.type !== 'BEGIN_PILGRIMAGE') return action;
    }
    throw new Error('No test action');
  },
};

describe('E1 campaign runner', () => {
  it('runs home decisions to the deadline and retains events without snapshots', () => {
    const result = runCampaign({ seed: 12, sign: 'aries', policy: resting, config, strict: true });
    expect(result.finalState.outcome).toBe('deadline');
    expect(result.finalState.elapsedWeeks).toBe(config.calendar.totalWeeks);
    expect(result.decisions).toHaveLength(config.calendar.totalWeeks);
    expect(result.events.at(-1)?.type).toBe('deadline');
    expect(result.decisions.every((d) => d.probability === null && d.before === undefined)).toBe(true);
  });

  it('records automatic and chance-based job probabilities matching engine events', () => {
    for (const job of ['stables', 'alehouse', 'village_watch', 'scriptorium'] as const) {
      const policy: Policy = {
        id: job, params: {}, decide: (_s, available) =>
          available.find((a) => a.type === 'WORK' && a.job === job) as GameAction,
      };
      const result = runCampaign({ seed: 1, sign: 'pisces', policy, config, strict: true });
      for (const d of result.decisions) {
        const resolved = result.events.slice(d.eventStart, d.eventEnd).find((e) => e.type === 'job_resolved');
        expect(resolved?.type).toBe('job_resolved');
        if (resolved?.type === 'job_resolved') expect(d.probability).toBe(resolved.probability);
      }
    }
  });

  it('replays full pilgrimage traces byte-for-byte, including rerolls and locked lunar odds', () => {
    const variant = withOverrides(config, {
      startingState: { startingInventory: { metheglin: 5 } },
    });
    const options = { seed: 123, sign: 'aries' as const, policy: pilgrim, config: variant, strict: true, trace: true };
    const result = runCampaign(options);
    expect(JSON.stringify(runCampaign(options))).toBe(JSON.stringify(result));
    expect(result.events.some((e) => e.type === 'pilgrimage_started')).toBe(true);
    expect(result.events.some((e) => e.type === 'reroll_used')).toBe(true);
    let state = createCampaign({
      seed: 123, birthSign: 'aries', playerName: { first: 'Simulation', last: 'Runner' }, scionName: 'Scion',
    }, variant);
    for (const d of result.decisions) {
      expect(d.before).toEqual(state);
      const applied = applyAction(state, d.action, variant);
      expect(d.after).toEqual(applied.state);
      expect(result.events.slice(d.eventStart, d.eventEnd)).toEqual(applied.events);
      for (const e of applied.events) {
        if (e.type === 'encounter_resolved') expect(d.probability).toBe(e.probability);
      }
      state = applied.state;
    }
    expect(state).toEqual(result.finalState);
  });

  it('supports victory through the final gauntlet', () => {
    const variant = withOverrides(config, {
      encounters: { successMin: 100, successMax: 100 },
    });
    const result = runCampaign({ seed: 7, sign: 'leo', policy: pilgrim, config: variant, strict: true });
    expect(result.finalState.outcome).toBe('victory');
    expect(result.events.at(-1)?.type).toBe('victory');
  });

  it('checks initial and transition invariants only in strict mode', () => {
    const spy = vi.spyOn(invariants, 'assertInvariants');
    try {
      runCampaign({ seed: 0, sign: 'aries', policy: resting, config });
      expect(spy).not.toHaveBeenCalled();
      const result = runCampaign({ seed: 0, sign: 'aries', policy: resting, config, strict: true });
      expect(spy).toHaveBeenCalledTimes(result.decisions.length + 1);
      spy.mockImplementation(() => { throw new Error('test violation'); });
      expect(() => runCampaign({ seed: 0, sign: 'aries', policy: resting, config, strict: true }))
        .toThrow('test violation');
    } finally { spy.mockRestore(); }
  });

  it('isolates policy mutations and reports invalid decisions with reproduction context', () => {
    const mutating: Policy = {
      ...resting, decide(state) { state.stats.bellatores = -999; return { type: 'REST', rest: 'rest_home' }; },
    };
    expect(runCampaign({ seed: 2, sign: 'aries', policy: mutating, config }).finalState.stats.bellatores)
      .toBeGreaterThanOrEqual(0);
    const invalid: Policy = { ...resting, id: 'invalid', decide: () => ({ type: 'RETREAT' }) };
    expect(() => runCampaign({ seed: 42, sign: 'leo', policy: invalid, config }))
      .toThrow(/policy=invalid seed=42 sign=leo step=0 week=0/);
  });

  it('enforces the safety cap but allows termination on its last step', () => {
    expect(() => runCampaign({ seed: 0, sign: 'aries', policy: resting, config, maxSteps: 1 }))
      .toThrow('Safety cap of 1 steps reached');
    expect(runCampaign({
      seed: 0, sign: 'aries', policy: resting, config, maxSteps: config.calendar.totalWeeks,
    }).finalState.outcome).toBe('deadline');
    for (const maxSteps of [0, -1, 1.5, NaN, Infinity]) {
      expect(() => runCampaign({ seed: 0, sign: 'aries', policy: resting, config, maxSteps })).toThrow(RangeError);
    }
  });
});

describe('paired batch seeds', () => {
  it('has a stable uint32 derivation independent of policy and iteration order', () => {
    const seeds = Array.from({ length: 20 }, (_, i) => deriveBatchSeed(123, 'aries', i));
    expect(new Set(seeds).size).toBe(20);
    expect(seeds.every((seed) => Number.isInteger(seed) && seed >= 0 && seed <= 0xffff_ffff)).toBe(true);
    expect([...seeds.keys()].reverse().map((i) => deriveBatchSeed(123, 'aries', i))).toEqual([...seeds].reverse());
    expect(deriveBatchSeed(124, 'aries', 0)).not.toBe(seeds[0]);
    expect(deriveBatchSeed(123, 'leo', 0)).not.toBe(seeds[0]);
    const a = runCampaign({ seed: seeds[0]!, sign: 'aries', policy: resting, config });
    const b = runCampaign({ seed: seeds[0]!, sign: 'aries', policy: { ...resting, id: 'other' }, config });
    expect(a).toEqual(b);
  });

  it('rejects invalid seed/index inputs', () => {
    expect(() => deriveBatchSeed(NaN, 'aries', 0)).toThrow(RangeError);
    for (const index of [-1, 0.5, Infinity]) expect(() => deriveBatchSeed(0, 'aries', index)).toThrow(RangeError);
  });
});
