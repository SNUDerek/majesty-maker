/** D2 harness contracts supporting the deterministic scenarios in tech §13. */
import { describe, expect, it } from 'vitest';
import { d100 } from '../../core/rng.js';
import { RuleError, type ApplyAction, type GameAction } from '../../core/types.js';
import { assertInvariants } from '../invariants.js';
import {
  applyOverrides, defaultConfig, forcedRolls, ruleState, runActions,
} from './harness.js';

const rest: GameAction = { type: 'REST', rest: 'rest_home' };

describe('§13 scenario harness', () => {
  it('constructs a valid default campaign and isolates nested overrides', () => {
    const initial = ruleState();
    assertInvariants(initial, defaultConfig);
    const overrides = { stats: { bellatores: 30 }, inventory: { theriac: 1 } };
    const next = applyOverrides(initial, overrides);
    overrides.inventory.theriac = 5;
    next.stats.oratores = 40;
    expect(next.inventory.theriac).toBe(1);
    expect(initial.stats.oratores).toBe(15);
    expect(next.stats.bellatores).toBe(30);
    const road = applyOverrides(initial, { elapsedWeeks: 6, pilgrimage: { carriedCoin: 10 } });
    expect(road.phase).toBe('pilgrimage');
    expect(road.pilgrimage).toMatchObject({ carriedCoin: 10, segmentEntryWeek: 5, encounterIndex: 0 });
  });

  it.each([[1], [100], [100, 1], [100, 100]])('scripts and repeats d100 draws %j', (...rolls) => {
    const seed = forcedRolls(...rolls);
    let state = seed;
    for (const roll of rolls) {
      const draw = d100(state);
      expect(draw.value).toBe(roll);
      state = draw.state;
    }
    expect(forcedRolls(...rolls)).toBe(seed);
  });

  it.each([[0], [101], [NaN], [Infinity], [1.5], [1, 1, 1, 1]])('rejects invalid roll scripts %j', (...rolls) => {
    expect(() => forcedRolls(...rolls)).toThrow(RangeError);
  });

  it('records ordered steps/events and stops at the last valid state on RuleError', () => {
    let calls = 0;
    const rejected = new RuleError('INVALID_ACTION', 'scripted rejection');
    const apply: ApplyAction<typeof defaultConfig> = (state) => {
      if (++calls === 2) throw rejected;
      return {
        state: { ...state, elapsedWeeks: state.elapsedWeeks + 1 },
        events: [{ type: 'week_spent', week: state.elapsedWeeks, reason: 'rest' }],
      };
    };
    const initial = ruleState();
    const result = runActions(initial, [rest, rest, rest], apply);
    expect(calls).toBe(2);
    expect(result.error).toBe(rejected);
    expect(result.final.elapsedWeeks).toBe(1);
    expect(initial.elapsedWeeks).toBe(0);
    expect(result.steps).toHaveLength(2);
    expect(result.steps[0]!.before).toBe(initial);
    expect(result.steps[1]!.before).toBe(result.final);
    expect(result.steps[1]!.after).toBe(result.final);
    expect(result.steps[1]!.events).toEqual([]);
    expect(result.events).toEqual([{ type: 'week_spent', week: 0, reason: 'rest' }]);
  });

  it('propagates unexpected errors instead of treating them as rejected actions', () => {
    const bug = new Error('unexpected failure');
    expect(() => runActions(ruleState(), [rest], () => { throw bug; })).toThrow(bug);
  });
});
