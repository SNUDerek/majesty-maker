/**
 * Reducer core and home phase (implementation task C1; tech §3–§5, §9).
 *
 * `applyAction` is pure and atomic: it never mutates its input, and on a
 * `RuleError` nothing is returned, so the caller keeps the untouched input
 * state (including its RNG streams). Validation and affordability checks all
 * run before any RNG draw.
 *
 * Home flow (tech §5 steps 1–6):
 *  1. Resolve the activity with this week's modifiers (A4 resolvers).
 *  2. Apply the already-clamped deltas.
 *  3. Check collapse against the ceilings of the new stats.
 *  4. Spend the week once (`week_spent`), and record the activity for Waxing.
 *  5. On collapse, the next week is a forced convalescence (`homeCollapse`),
 *     auto-applied in the same action, if a week remains.
 *  6. Check the deadline: home at the last week becomes `defeat`/`deadline`.
 *
 * Decisions (C1):
 *  - A convalescence week is not a weekly activity: it clears
 *    `lastWeeklyActivityId` and `waxingStreak`, so a Waxing repeat cannot
 *    chain across it.
 *  - `homeCollapse.forcedWeek: false` applies the recovery immediately,
 *    without spending a week.
 *  - If one recovery does not clear the collapse (only possible in variants:
 *    with the default config, one action adds at most 15 to a burden and
 *    lowers a ceiling by at most 1), `pendingConvalescence` stays set and the
 *    only legal action is `REST rest_home`, which is resolved as another
 *    convalescence week. A pending wipeout convalescence (C2) works the same.
 *  - `waxingStreak` counts prior consecutive repeats: it increments when an
 *    activity repeats the last one and resets to 0 otherwise.
 *
 * Pilgrimage actions belong to C2–C4. Until then `BEGIN_PILGRIMAGE` is
 * advertised by `getAvailableActions` (as the C1 contract requires) but
 * rejected by `applyAction` with `INVALID_ACTION`.
 */

import { collectModifiers, solarAspect } from './astrology.js';
import { getCalendar } from './calendar.js';
import { addBurden, collapseCause } from './conditions.js';
import type { RulesConfig } from './config.js';
import {
  applyActivityDeltas,
  resolveJob,
  resolveRest,
  resolveTutor,
  restCost,
  tutorCost,
  type ActivityResolution,
} from './economy.js';
import { createRngStreams } from './rng.js';
import {
  RuleError,
  type ActivityId,
  type ApplyAction,
  type AvailableAction,
  type CampaignState,
  type CreateCampaign,
  type Estate,
  type GameAction,
  type GameEvent,
  type GetAvailableActions,
  type JobId,
  type ModifierSet,
  type RestId,
  type TutorId,
  type ZodiacSign,
} from './types.js';

type HomeKind = 'tutor' | 'job' | 'rest';
type HomeAction = Extract<GameAction, { type: 'TRAIN' | 'WORK' | 'REST' }>;
type ConvalescenceCause = NonNullable<CampaignState['pendingConvalescence']>;

const HOME_ACTIONS = new Set<GameAction['type']>(['TRAIN', 'WORK', 'REST']);
const PILGRIMAGE_ACTIONS = new Set<GameAction['type']>([
  'CHOOSE_APPROACH', 'SKIP_ENCOUNTER', 'USE_CONSUMABLE', 'ACCEPT_RESULT',
  'CONTINUE_ENCOUNTER', 'RETREAT', 'RETURN_HOME', 'CONTINUE_SEGMENT',
]);
const ESTATES: readonly Estate[] = ['bellatores', 'oratores', 'laboratores'];
/** The rest a bot must pick while a convalescence is pending. */
const CONVALESCENCE_REST: RestId = 'rest_home';

// ---------------------------------------------------------------------------
// createCampaign
// ---------------------------------------------------------------------------

export const createCampaign: CreateCampaign<RulesConfig> = (options, config) => {
  const { seed, birthSign, playerName, scionName } = options;
  if (!Number.isSafeInteger(seed)) throw new RangeError(`createCampaign: seed must be a safe integer, got ${seed}`);
  if (!Object.hasOwn(config.startingState.zodiacEstate, birthSign)) {
    throw new RangeError(`createCampaign: unknown birth sign ${JSON.stringify(birthSign)}`);
  }
  if (typeof playerName?.first !== 'string' || typeof playerName.last !== 'string' || typeof scionName !== 'string') {
    throw new TypeError('createCampaign: playerName {first, last} and scionName must be strings');
  }

  const start = config.startingState;
  const stats = Object.fromEntries(ESTATES.map((estate) => [estate, start.baseStat])) as Record<Estate, number>;
  stats[start.zodiacEstate[birthSign as ZodiacSign]] += start.zodiacBonus;
  for (const estate of ESTATES) {
    stats[estate] = Math.min(start.statMax, Math.max(start.statMin, stats[estate]));
  }

  return {
    version: 1,
    seed,
    rng: createRngStreams(seed),
    playerName: { first: playerName.first, last: playerName.last },
    scionName,
    birthSign,
    elapsedWeeks: 0,
    stats,
    fatigue: start.fatigue,
    melancholy: start.melancholy,
    treasury: Math.min(start.treasuryMax, start.treasury),
    inventory: { ...start.startingInventory },
    furthestWaystation: 0,
    phase: 'home',
    waxingStreak: 0,
  };
};

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function kindOf(action: HomeAction): HomeKind {
  return action.type === 'TRAIN' ? 'tutor' : action.type === 'WORK' ? 'job' : 'rest';
}

/** The activity id named by a home action, validated against the config tables. */
function activityOf(action: HomeAction, config: RulesConfig): ActivityId {
  const [id, table] = action.type === 'TRAIN'
    ? [action.tutor, config.classes.tutors]
    : action.type === 'WORK'
      ? [action.job, config.jobs.definitions]
      : [action.rest, config.rest];
  if (typeof id !== 'string' || !Object.hasOwn(table, id)) {
    throw new RuleError('INVALID_ACTION', `${action.type}: unknown ${kindOf(action)} ${JSON.stringify(id)}`);
  }
  return id;
}

/** This week's astrology modifiers for a home activity. */
function homeModifiers(state: CampaignState, activityId: ActivityId, kind: HomeKind, config: RulesConfig): ModifierSet {
  const calendar = getCalendar(state, config);
  return collectModifiers(
    {
      activityId,
      kind,
      solar: solarAspect(calendar.solarDistance, config),
      lunar: calendar.lunarPhase,
      ...(state.lastWeeklyActivityId === undefined ? {} : { previousActivityId: state.lastWeeklyActivityId }),
      waxingStreak: state.waxingStreak,
    },
    config,
  );
}

function isTerminal(state: CampaignState): boolean {
  return state.phase === 'victory' || state.phase === 'defeat';
}

// ---------------------------------------------------------------------------
// getAvailableActions
// ---------------------------------------------------------------------------

export const getAvailableActions: GetAvailableActions<RulesConfig> = (state, config) => {
  if (state.phase !== 'home' || state.elapsedWeeks >= config.calendar.totalWeeks) {
    // Pilgrimage actions are enumerated by C2; terminal phases allow nothing.
    return [];
  }
  if (state.pendingConvalescence !== undefined) return [{ type: 'REST', rest: CONVALESCENCE_REST }];

  const actions: AvailableAction[] = [];
  for (const tutor of Object.keys(config.classes.tutors) as TutorId[]) {
    if (tutorCost(tutor, homeModifiers(state, tutor, 'tutor', config), config) <= state.treasury) {
      actions.push({ type: 'TRAIN', tutor });
    }
  }
  for (const job of Object.keys(config.jobs.definitions) as JobId[]) {
    actions.push({ type: 'WORK', job });
  }
  for (const rest of Object.keys(config.rest) as RestId[]) {
    if (restCost(rest, homeModifiers(state, rest, 'rest', config), config) <= state.treasury) {
      actions.push({ type: 'REST', rest });
    }
  }

  const fee = config.route.departureFee;
  if (state.treasury >= fee) {
    const carried = (kind: 'equipment' | 'consumable', max: number): string[] =>
      max === 0
        ? []
        : Object.keys(state.inventory)
          .filter((id) => (state.inventory[id] ?? 0) > 0 && config.items.catalog[id]?.kind === kind)
          .sort();
    actions.push({
      type: 'BEGIN_PILGRIMAGE',
      minCarry: 0,
      maxCarry: state.treasury - fee,
      fee,
      isFinal: state.furthestWaystation >= config.route.regularSegments,
      equipmentIds: carried('equipment', config.items.maxEquipment),
      consumableIds: carried('consumable', config.items.maxConsumables),
    });
  }
  return actions;
};

// ---------------------------------------------------------------------------
// applyAction
// ---------------------------------------------------------------------------

export const applyAction: ApplyAction<RulesConfig> = (input, action, config) => {
  if (isTerminal(input)) {
    throw new RuleError('CAMPAIGN_FINISHED', `the campaign has ended (${input.phase}); no further actions`);
  }
  const type = (action as { type?: unknown } | null)?.type;
  if (typeof type !== 'string' || !(HOME_ACTIONS.has(type as GameAction['type'])
    || PILGRIMAGE_ACTIONS.has(type as GameAction['type']) || type === 'BEGIN_PILGRIMAGE')) {
    throw new RuleError('INVALID_ACTION', `unknown action ${JSON.stringify(type)}`);
  }

  if (input.phase === 'pilgrimage') {
    if (!PILGRIMAGE_ACTIONS.has(action.type)) {
      throw new RuleError('INVALID_PHASE', `${action.type} is not allowed during a pilgrimage`);
    }
    throw new RuleError('INVALID_ACTION', `${action.type}: the pilgrimage state machine is not implemented yet (C2)`);
  }

  // Home phase.
  if (input.elapsedWeeks >= config.calendar.totalWeeks) {
    throw new RuleError('DEADLINE_REACHED', 'no weeks remain in the campaign');
  }
  if (PILGRIMAGE_ACTIONS.has(action.type)) {
    throw new RuleError('INVALID_PHASE', `${action.type} is only allowed during a pilgrimage`);
  }
  if (action.type === 'BEGIN_PILGRIMAGE') {
    throw new RuleError('INVALID_ACTION', 'BEGIN_PILGRIMAGE: the pilgrimage state machine is not implemented yet (C2)');
  }
  return applyHomeAction(structuredClone(input), action as HomeAction, config);
};

function applyHomeAction(state: CampaignState, action: HomeAction, config: RulesConfig) {
  const events: GameEvent[] = [];

  if (state.pendingConvalescence !== undefined) {
    if (action.type !== 'REST' || action.rest !== CONVALESCENCE_REST) {
      throw new RuleError(
        'INVALID_ACTION',
        `a ${state.pendingConvalescence} convalescence is pending; only REST ${CONVALESCENCE_REST} is allowed`,
      );
    }
    const cause = state.pendingConvalescence;
    delete state.pendingConvalescence;
    convalesce(state, cause, events, config);
    return { state: finishHomeWeek(state, events, config), events };
  }

  const kind = kindOf(action);
  const activityId = activityOf(action, config);
  const modifiers = homeModifiers(state, activityId, kind, config);
  const resolution = resolve(state, action, modifiers, config);

  // Steps 2–4: apply, check collapse against the new ceilings, spend the week.
  const week = state.elapsedWeeks;
  Object.assign(state, applyActivityDeltas(state, resolution.deltas));
  state.rng = resolution.rng;
  events.push(...resolution.events);
  const cause = collapseCause(state);
  events.push({ type: 'week_spent', week, reason: kind });
  state.elapsedWeeks += 1;
  state.waxingStreak = state.lastWeeklyActivityId === activityId ? state.waxingStreak + 1 : 0;
  state.lastWeeklyActivityId = activityId;

  // Step 5: a home collapse forces the next week's convalescence.
  if (cause !== null) {
    events.push({ type: 'collapse', week, cause });
    convalesce(state, 'home_collapse', events, config);
  }
  return { state: finishHomeWeek(state, events, config), events };
}

function resolve(state: CampaignState, action: HomeAction, modifiers: ModifierSet, config: RulesConfig): ActivityResolution {
  switch (action.type) {
    case 'TRAIN':
      return resolveTutor(state, action.tutor, modifiers, state.rng, config);
    case 'WORK':
      return resolveJob(state, action.job, modifiers, state.rng, config);
    case 'REST':
      return resolveRest(state, action.rest, modifiers, state.rng, config);
  }
}

/**
 * One convalescence bout: spends a week (if the rules force one and a week
 * remains), recovers both burdens, and breaks the Waxing chain. Leaves
 * `pendingConvalescence` set if the burdens are still collapsed afterwards.
 */
function convalesce(state: CampaignState, cause: ConvalescenceCause, events: GameEvent[], config: RulesConfig): void {
  const { forcedWeek, recovery } = config.failure.homeCollapse;
  if (forcedWeek && state.elapsedWeeks >= config.calendar.totalWeeks) return; // bounded by the deadline

  const week = state.elapsedWeeks;
  events.push({ type: 'convalescence', week, cause });
  for (const burden of ['fatigue', 'melancholy'] as const) {
    const next = addBurden(state[burden], -recovery);
    if (next !== state[burden]) {
      events.push({ type: 'burden_changed', week, burden, amount: next - state[burden], source: 'convalescence' });
      state[burden] = next;
    }
  }
  if (forcedWeek) {
    events.push({ type: 'week_spent', week, reason: 'convalescence' });
    state.elapsedWeeks += 1;
  }
  delete state.lastWeeklyActivityId;
  state.waxingStreak = 0;
  if (collapseCause(state) !== null) state.pendingConvalescence = cause;
}

/** Step 6: a home state at the last week becomes a deadline defeat. */
function finishHomeWeek(state: CampaignState, events: GameEvent[], config: RulesConfig): CampaignState {
  if (state.elapsedWeeks >= config.calendar.totalWeeks) {
    state.phase = 'defeat';
    state.outcome = 'deadline';
    delete state.pendingConvalescence;
    events.push({ type: 'deadline', week: state.elapsedWeeks });
  }
  return state;
}
