/** Test the D3 harness independently while C1–C4 are under development. */
import { describe, expect, it } from 'vitest';
import { pick } from '../../core/rng.js';
import { RuleError, type AvailableAction, type GameAction } from '../../core/types.js';
import {
  DEFAULT_OPTIONS, defaultConfig, ruleState, type Engine,
} from '../scenarios/harness.js';
import {
  assertRejectedAtomically, invalidActions, replayCampaign, selectAction, walkCampaign,
} from './walker.js';

const rest = { type: 'REST', rest: 'rest_home' } satisfies GameAction;
const work = { type: 'WORK', job: 'stables' } satisfies GameAction;

/** Minimal test double; deliberately does not stand in for the real engine campaign suite. */
function fixtureEngine(): Engine {
  return {
    createCampaign: (options, config) => ruleState({ birthSign: options.birthSign }, options.seed, config),
    getAvailableActions: (state) => state.phase === 'home' ? [rest, work] : [],
    applyAction: (state, action, config) => {
      const offered = [rest, work].some((legal) => JSON.stringify(legal) === JSON.stringify(action));
      if (state.phase !== 'home' || !offered) {
        throw new RuleError('INVALID_ACTION', 'fixture rejection');
      }
      const next = structuredClone(state);
      next.elapsedWeeks++;
      if (action.type === 'WORK') next.treasury++;
      if (next.elapsedWeeks === config.calendar.totalWeeks) {
        next.phase = 'defeat';
        next.outcome = 'deadline';
      }
      return { state: next, events: [{ type: 'week_spent', reason: 'rest', week: state.elapsedWeeks }] };
    },
  };
}

const departure: AvailableAction = {
  type: 'BEGIN_PILGRIMAGE', minCarry: 0, maxCarry: 2, fee: 5, isFinal: false,
  equipmentIds: ['gambeson'], consumableIds: ['metheglin'],
};

describe('D3 walker infrastructure', () => {
  it('selects uniformly from descriptors with an independent explicit RNG', () => {
    const actions: AvailableAction[] = [rest, work, { type: 'TRAIN', tutor: 'hermit' }];
    for (let seed = 0; seed < 50; seed++) {
      expect(selectAction(actions, seed)).toEqual(pick(seed, actions));
    }
    expect(() => selectAction([], 1)).toThrow(RangeError);
  });

  it('materializes carry endpoints and optional item slots without changing descriptors', () => {
    const before = structuredClone(departure);
    const choices = new Set<string>();
    for (let seed = 0; seed < 200; seed++) {
      const { value } = selectAction([departure], seed);
      if (value.type !== 'BEGIN_PILGRIMAGE') throw new Error('expected departure');
      expect(value.carry).toBeGreaterThanOrEqual(0);
      expect(value.carry).toBeLessThanOrEqual(2);
      choices.add(JSON.stringify(value));
    }
    expect(choices.size).toBe(3 * 2 * 2);
    expect(departure).toEqual(before);
    const noSlots = { ...departure, minCarry: 7, maxCarry: 7, equipmentIds: [], consumableIds: [] };
    expect(selectAction([noSlots], 1).value).toEqual({ type: 'BEGIN_PILGRIMAGE', carry: 7 });
  });

  it('provides phase-invalid actions and invalid departure parameters', () => {
    const home = ruleState();
    expect(invalidActions(home, [departure])).toEqual(expect.arrayContaining([
      { type: 'BEGIN_PILGRIMAGE', carry: -1 },
      { type: 'BEGIN_PILGRIMAGE', carry: 3 },
      { type: 'BEGIN_PILGRIMAGE', carry: 0.5 },
    ]));
    for (const phase of ['pilgrimage', 'victory', 'defeat'] as const) {
      expect(invalidActions({ ...home, phase }, [])).toContainEqual(rest);
    }
  });

  it('probes every unoffered concrete action, including wrong pilgrimage stages', () => {
    const offered: AvailableAction[] = [
      { type: 'CONTINUE_ENCOUNTER' }, { type: 'RETREAT' },
      { type: 'USE_CONSUMABLE', itemId: 'theriac' },
    ];
    const state = { ...ruleState(), phase: 'pilgrimage' as const };
    const invalid = invalidActions(state, offered, ['theriac', 'metheglin']);
    for (const action of offered) expect(invalid).not.toContainEqual(action);
    expect(invalid).toEqual(expect.arrayContaining([
      { type: 'CHOOSE_APPROACH', estate: 'oratores' },
      { type: 'SKIP_ENCOUNTER' }, { type: 'ACCEPT_RESULT' },
      { type: 'RETURN_HOME' }, { type: 'CONTINUE_SEGMENT' },
      { type: 'USE_CONSUMABLE', itemId: 'metheglin' },
      { type: 'TRAIN', tutor: 'smuggler' },
      { type: 'BEGIN_PILGRIMAGE', carry: 0 },
    ]));
    // Unaffordable home activities are probed when not offered.
    expect(invalidActions(ruleState(), [rest])).toContainEqual({ type: 'REST', rest: 'banquet' });
    expect(invalidActions(ruleState(), [rest])).not.toContainEqual(rest);
  });

  it('records full campaigns, checks every state including terminal, and replays identical bytes', () => {
    const engine = fixtureEngine();
    const options = { ...DEFAULT_OPTIONS, seed: 123 };
    const trace = walkCampaign(engine, options, defaultConfig);
    expect(trace.actions).toHaveLength(defaultConfig.calendar.totalWeeks);
    expect(trace.resultBytes).toHaveLength(trace.actions.length);
    expect(trace.invalidChecks).toBe(trace.actions.length + 1);
    expect(new Set(trace.actions.map((action) => action.type)).size).toBe(2);
    expect(walkCampaign(engine, options, defaultConfig)).toEqual(trace);
    expect(() => replayCampaign(engine, trace, defaultConfig)).not.toThrow();
  });

  it.each(['state', 'rng', 'events', 'initial'] as const)('detects nondeterministic %s', (field) => {
    const engine = fixtureEngine();
    const trace = walkCampaign(engine, DEFAULT_OPTIONS, defaultConfig);
    const altered: Engine = {
      ...engine,
      createCampaign: (options, config) => {
        const state = engine.createCampaign(options, config);
        if (field === 'initial') state.treasury++;
        return state;
      },
      applyAction: (state, action, config) => {
        const result = engine.applyAction(state, action, config);
        if (field === 'state') result.state.treasury++;
        if (field === 'rng') result.state.rng = { ...result.state.rng, jobs: 42 };
        if (field === 'events') result.events = [];
        return result;
      },
    };
    expect(() => replayCampaign(altered, trace, defaultConfig)).toThrow(/seed=1.*replay step=0/);
  });

  it('detects invalid actions accepted silently, wrong error types, and mutation before rejection', () => {
    const engine = fixtureEngine();
    const state = ruleState();
    const action: GameAction = { type: 'RETREAT' };
    expect(() => assertRejectedAtomically(engine, state, action, defaultConfig)).not.toThrow();
    expect(() => assertRejectedAtomically({
      ...engine, applyAction: () => ({ state, events: [] }),
    }, state, action, defaultConfig)).toThrow();
    expect(() => assertRejectedAtomically({
      ...engine, applyAction: () => { throw new TypeError('bug'); },
    }, state, action, defaultConfig)).toThrow();
    expect(() => assertRejectedAtomically({
      ...engine, applyAction: (input) => {
        input.rng = { ...input.rng, jobs: 42 };
        throw new RuleError('INVALID_ACTION', 'mutated');
      },
    }, structuredClone(state), action, defaultConfig)).toThrow(/changed RNG/);
    expect(() => assertRejectedAtomically({
      ...engine, applyAction: (input) => {
        input.treasury--;
        throw new RuleError('INVALID_ACTION', 'mutated');
      },
    }, structuredClone(state), action, defaultConfig)).toThrow(/changed its input/);
  });

  it('detects invariant violations and mutation on successful actions', () => {
    const engine = fixtureEngine();
    for (const mutate of [false, true]) {
      const broken: Engine = {
        ...engine, applyAction: (state, action, config) => {
          const result = engine.applyAction(state, action, config);
          if (mutate) state.treasury--;
          else result.state.treasury = -1;
          return result;
        },
      };
      expect(() => walkCampaign(broken, DEFAULT_OPTIONS, defaultConfig)).toThrow(
        mutate ? /mutated its input/ : /treasury.range/,
      );
    }
  });

  it('detects getAvailableActions mutation, dead ends, loops, and terminal actions', () => {
    const engine = fixtureEngine();
    expect(() => walkCampaign({
      ...engine, getAvailableActions: (state) => { state.treasury++; return [rest]; },
    }, DEFAULT_OPTIONS, defaultConfig)).toThrow(/getAvailableActions mutated/);
    expect(() => walkCampaign({
      ...engine, getAvailableActions: () => [],
    }, DEFAULT_OPTIONS, defaultConfig)).toThrow(/no legal actions/);
    expect(() => walkCampaign({
      ...engine, applyAction: (state, action, config) => {
        engine.applyAction(state, action, config); // preserve the fixture's invalid-action rejection
        return { state: structuredClone(state), events: [] };
      },
    }, DEFAULT_OPTIONS, defaultConfig, 5)).toThrow(/did not terminate within 5/);
    expect(() => walkCampaign({
      ...engine, getAvailableActions: (state) => state.phase === 'home' ? [rest, work] : [rest],
    }, DEFAULT_OPTIONS, defaultConfig)).toThrow(/terminal state offers actions/);
  });
});
