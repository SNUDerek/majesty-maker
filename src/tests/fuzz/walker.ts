/** D3: reproducible legal walks, byte-for-byte replay, and rejected-action atomicity. */
import assert from 'node:assert/strict';
import type { RulesConfig } from '../../core/config.js';
import { pick, rollInt, type Draw, type RngState } from '../../core/rng.js';
import {
  RuleError, type AvailableAction, type CampaignState, type CreateCampaignOptions,
  type Estate, type GameAction, type JobId, type RestId, type TutorId,
} from '../../core/types.js';
import { assertInvariants } from '../invariants.js';
import type { Engine } from '../scenarios/harness.js';

export interface CampaignTrace {
  options: CreateCampaignOptions;
  initialBytes: string;
  actions: GameAction[];
  /** JSON of state and events after each successful action, preserving key order. */
  resultBytes: string[];
  invalidChecks: number;
}

/** Uniform over descriptors, then over each carry/slot choice. Policy RNG is separate from game RNG. */
export function selectAction(available: readonly AvailableAction[], random: RngState): Draw<GameAction> {
  const selected = pick(random, available);
  const descriptor = selected.value;
  if (descriptor.type !== 'BEGIN_PILGRIMAGE') {
    return { value: { ...descriptor }, state: selected.state };
  }
  const carry = rollInt(selected.state, descriptor.minCarry, descriptor.maxCarry);
  const equipment = pick(carry.state, [undefined, ...descriptor.equipmentIds]);
  const consumable = pick(equipment.state, [undefined, ...descriptor.consumableIds]);
  return {
    value: {
      type: 'BEGIN_PILGRIMAGE', carry: carry.value,
      ...(equipment.value === undefined ? {} : { equipmentId: equipment.value }),
      ...(consumable.value === undefined ? {} : { consumableId: consumable.value }),
    },
    state: consumable.state,
  };
}

const TUTORS = ['hedge_knight', 'hermit', 'smuggler'] as const satisfies readonly TutorId[];
const JOBS = ['stables', 'alehouse', 'village_watch', 'scriptorium'] as const satisfies readonly JobId[];
const RESTS = ['rest_home', 'bathhouse', 'shrine', 'banquet'] as const satisfies readonly RestId[];
const ESTATES = ['bellatores', 'oratores', 'laboratores'] as const satisfies readonly Estate[];

/** Every concrete non-departure action; `itemIds` adds one USE_CONSUMABLE per item. */
export function concreteActions(itemIds: readonly string[]): GameAction[] {
  return [
    ...TUTORS.map((tutor) => ({ type: 'TRAIN', tutor }) as const),
    ...JOBS.map((job) => ({ type: 'WORK', job }) as const),
    ...RESTS.map((rest) => ({ type: 'REST', rest }) as const),
    ...ESTATES.map((estate) => ({ type: 'CHOOSE_APPROACH', estate }) as const),
    ...itemIds.map((itemId) => ({ type: 'USE_CONSUMABLE', itemId }) as const),
    { type: 'SKIP_ENCOUNTER' }, { type: 'ACCEPT_RESULT' }, { type: 'CONTINUE_ENCOUNTER' },
    { type: 'RETREAT' }, { type: 'RETURN_HOME' }, { type: 'CONTINUE_SEGMENT' },
  ];
}

/**
 * Actions that must be rejected in this exact state: every concrete action that
 * `getAvailableActions` does not offer (wrong phase, wrong pilgrimage stage,
 * unaffordable, item not carried, skip already used, …), plus departure
 * parameter violations. This also holds `getAvailableActions` to completeness:
 * an unlisted action that the engine accepts fails the probe.
 */
export function invalidActions(
  state: CampaignState, available: readonly AvailableAction[], itemIds: readonly string[] = ['metheglin'],
): GameAction[] {
  const offered = new Set(available.map((action) => JSON.stringify(action)));
  const candidates = concreteActions(itemIds).filter((action) => !offered.has(JSON.stringify(action)));
  const departure = available.find((action) => action.type === 'BEGIN_PILGRIMAGE');
  if (!departure) {
    candidates.push({ type: 'BEGIN_PILGRIMAGE', carry: 0 });
  } else {
    candidates.push(
      { type: 'BEGIN_PILGRIMAGE', carry: -1 },
      { type: 'BEGIN_PILGRIMAGE', carry: departure.maxCarry + 1 },
      { type: 'BEGIN_PILGRIMAGE', carry: 0.5 },
      { type: 'BEGIN_PILGRIMAGE', carry: departure.minCarry, equipmentId: '__d3_unknown_item__' },
      { type: 'BEGIN_PILGRIMAGE', carry: departure.minCarry, consumableId: '__d3_unknown_item__' },
    );
  }
  return candidates;
}

export function assertRejectedAtomically(
  engine: Engine, state: CampaignState, action: GameAction, config: RulesConfig,
): void {
  const before = structuredClone(state);
  assert.throws(() => engine.applyAction(state, action, config), RuleError);
  assert.deepStrictEqual(state.rng, before.rng, 'rejected action changed RNG');
  assert.deepStrictEqual(state, before, 'rejected action changed its input');
}

function availableActions(engine: Engine, state: CampaignState, config: RulesConfig): AvailableAction[] {
  const before = JSON.stringify(state);
  const actions = engine.getAvailableActions(state, config);
  assert.equal(JSON.stringify(state), before, 'getAvailableActions mutated its input');
  return actions;
}

function apply(engine: Engine, state: CampaignState, action: GameAction, config: RulesConfig) {
  const before = structuredClone(state);
  const result = engine.applyAction(state, action, config);
  assert.deepStrictEqual(state, before, 'successful action mutated its input');
  assertInvariants(result.state, config, before);
  return result;
}

function context(error: unknown, trace: CampaignTrace, config: RulesConfig): Error {
  return new Error(
    `D3 config=${config.id} seed=${trace.options.seed} sign=${trace.options.birthSign}`
    + ` step=${trace.actions.length} actions=${JSON.stringify(trace.actions)}: `
    + (error instanceof Error ? error.message : String(error)),
    { cause: error },
  );
}

/** Walk to victory/deadline; fail explicitly on dead ends or nonterminating FSMs. */
export function walkCampaign(
  engine: Engine, options: CreateCampaignOptions, config: RulesConfig,
  maxSteps = config.calendar.totalWeeks * (5 * Math.max(config.route.encountersPerSegment, config.route.finalEncounters) + 12),
): CampaignTrace {
  const trace: CampaignTrace = {
    options: structuredClone(options), initialBytes: '', actions: [], resultBytes: [], invalidChecks: 0,
  };
  // Do not consume a game stream to pick actions or invalid probes.
  let policyRandom = (options.seed ^ 0xd3a17e5) >>> 0;
  let invalidRandom = (options.seed ^ 0xa70c1c) >>> 0;
  try {
    let state = engine.createCampaign(structuredClone(options), config);
    trace.initialBytes = JSON.stringify(state);
    assertInvariants(state, config);
    for (;;) {
      const available = availableActions(engine, state, config);
      const invalid = pick(invalidRandom, invalidActions(state, available, Object.keys(config.items.catalog)));
      invalidRandom = invalid.state;
      try {
        assertRejectedAtomically(engine, state, invalid.value, config);
      } catch (error) {
        throw new Error(
          `invalid action=${JSON.stringify(invalid.value)}: ${error instanceof Error ? error.message : String(error)}`,
          { cause: error },
        );
      }
      trace.invalidChecks++;
      if (state.phase === 'victory' || state.phase === 'defeat') {
        assert.equal(available.length, 0, 'terminal state offers actions');
        return trace;
      }
      assert.ok(available.length > 0, 'nonterminal state has no legal actions');
      assert.ok(trace.actions.length < maxSteps, `campaign did not terminate within ${maxSteps} actions`);
      const chosen = selectAction(available, policyRandom);
      policyRandom = chosen.state;
      trace.actions.push(structuredClone(chosen.value));
      const result = apply(engine, state, chosen.value, config);
      trace.resultBytes.push(JSON.stringify({ state: result.state, events: result.events }));
      state = result.state;
    }
  } catch (error) {
    throw context(error, trace, config);
  }
}

/** Recreate the campaign and replay recorded actions, without making new policy draws. */
export function replayCampaign(engine: Engine, trace: CampaignTrace, config: RulesConfig): void {
  let step = 0;
  try {
    let state = engine.createCampaign(structuredClone(trace.options), config);
    assert.equal(JSON.stringify(state), trace.initialBytes, 'initial state differs on replay');
    assertInvariants(state, config);
    assert.equal(trace.actions.length, trace.resultBytes.length);
    for (const action of trace.actions) {
      const result = apply(engine, state, structuredClone(action), config);
      assert.equal(
        JSON.stringify({ state: result.state, events: result.events }), trace.resultBytes[step],
        `state/events differ on replay at step ${step}`,
      );
      state = result.state;
      step++;
    }
    assert.ok(state.phase === 'victory' || state.phase === 'defeat', 'replay did not reach a terminal state');
  } catch (error) {
    throw context(new Error(
      `replay step=${step}: ${error instanceof Error ? error.message : String(error)}`, { cause: error },
    ), trace, config);
  }
}
