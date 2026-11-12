/**
 * D2 scenario harness.
 *
 * Scenarios come in two tiers:
 *
 * - Rule-level scenarios call the pure rule modules (economy, astrology,
 *   calendar, conditions, encounter, items) directly and run today.
 * - Engine scenarios drive the public API (`createCampaign` / `applyAction`
 *   from `src/core/index.ts`) through `scenario()`. They are written
 *   test-first against the T0.2 contracts and use explicit readiness flags
 *   below. Enable each flag when its C-task lands:
 *   C1 home, C2 pilgrimage FSM, C3 items, C4 final gauntlet.
 *
 * Engine assumption, the one thing T0.2 does not pin down: encounter checks
 * (including a Metheglin reroll) roll d100 on the `encounters` RNG stream.
 * `forcedRolls()` relies on that to script outcomes without searching seeds.
 */
import { existsSync } from 'node:fs';
import type { RulesConfig } from '../../core/config.js';
import { createRngStreams, d100, type RngState } from '../../core/rng.js';
import {
  RuleError,
  type ApplyAction,
  type CampaignState,
  type CreateCampaign,
  type CreateCampaignOptions,
  type Estate,
  type GameAction,
  type GameEvent,
  type GetAvailableActions,
  type PilgrimageState,
} from '../../core/types.js';
import { loadContentConfig } from '../support/config.js';

export const defaultConfig = loadContentConfig();

export interface Engine {
  createCampaign: CreateCampaign<RulesConfig>;
  applyAction: ApplyAction<RulesConfig>;
  getAvailableActions: GetAvailableActions<RulesConfig>;
}

const ENGINE_SOURCE = new URL('../../core/index.ts', import.meta.url);

/** The C1 public API, or null while `src/core/index.ts` does not exist yet. */
async function loadEngine(): Promise<Engine | null> {
  if (!existsSync(ENGINE_SOURCE)) return null;
  // Non-literal specifier: typecheck must not fail while the module is absent.
  const mod = (await import(/* @vite-ignore */ ENGINE_SOURCE.href)) as Partial<Engine>;
  const missing = (['createCampaign', 'applyAction', 'getAvailableActions'] as const)
    .filter((name) => typeof mod[name] !== 'function');
  if (missing.length > 0) {
    throw new Error(`src/core/index.ts exists but does not export ${missing.join(', ')} (C1 contract)`);
  }
  return mod as Engine;
}

export const engine = await loadEngine();

export const DEFAULT_OPTIONS: CreateCampaignOptions = {
  seed: 1,
  birthSign: 'aries',
  playerName: { first: 'Test', last: 'Player' },
  scionName: 'Scion',
};

// ---------------------------------------------------------------------------
// State construction
// ---------------------------------------------------------------------------

export type PilgrimageOverrides = Partial<PilgrimageState>;

export type StateOverrides = Partial<Omit<CampaignState, 'stats' | 'pilgrimage'>> & {
  stats?: Partial<Record<Estate, number>>;
  /** Merged onto `basePilgrimage()`; implies `phase: 'pilgrimage'` unless `phase` is given. */
  pilgrimage?: PilgrimageOverrides;
};

/** A regular segment at the approach choice, with nothing carried or equipped. */
export function basePilgrimage(entryWeek: number): PilgrimageState {
  return {
    stage: 'choose_approach',
    segmentIndex: 0,
    encounterIndex: 0,
    carriedCoin: 0,
    departureCarriedCoin: 0,
    earnedCoin: 0,
    skipUsed: false,
    consumableUsed: false,
    isFinal: false,
    segmentEntryWeek: entryWeek,
  };
}

export function applyOverrides(base: CampaignState, overrides: StateOverrides): CampaignState {
  const { stats, pilgrimage, ...rest } = overrides;
  const state: CampaignState = { ...structuredClone(base), ...structuredClone(rest) };
  if (stats) state.stats = { ...state.stats, ...stats };
  if (pilgrimage) {
    // segmentEntryWeek locks the lunar phase; the entry week was already spent.
    const entryWeek = Math.max(0, state.elapsedWeeks - 1);
    state.pilgrimage = { ...basePilgrimage(entryWeek), ...structuredClone(pilgrimage) };
    state.phase = overrides.phase ?? 'pilgrimage';
  }
  return state;
}

/**
 * A fresh campaign built from the rules config alone (T0.2 shape), for
 * rule-level scenarios that run before C1. Matches what C1's
 * `createCampaign` must produce: base stats plus the zodiac bonus, starting
 * treasury and burdens, and seeded RNG substreams.
 */
export function ruleState(
  overrides: StateOverrides = {},
  seed = DEFAULT_OPTIONS.seed,
  config: RulesConfig = defaultConfig,
): CampaignState {
  const { startingState } = config;
  const birthSign = overrides.birthSign ?? DEFAULT_OPTIONS.birthSign;
  const stats: Record<Estate, number> = {
    bellatores: startingState.baseStat,
    oratores: startingState.baseStat,
    laboratores: startingState.baseStat,
  };
  stats[startingState.zodiacEstate[birthSign]] += startingState.zodiacBonus;
  const base: CampaignState = {
    version: 1,
    seed,
    rng: createRngStreams(seed),
    playerName: DEFAULT_OPTIONS.playerName,
    scionName: DEFAULT_OPTIONS.scionName,
    birthSign,
    elapsedWeeks: 0,
    stats,
    fatigue: startingState.fatigue,
    melancholy: startingState.melancholy,
    treasury: startingState.treasury,
    inventory: { ...startingState.startingInventory },
    furthestWaystation: 0,
    phase: 'home',
    waxingStreak: 0,
  };
  return applyOverrides(base, overrides);
}

// ---------------------------------------------------------------------------
// Scripted RNG
// ---------------------------------------------------------------------------

const forcedCache = new Map<string, RngState>();

/**
 * An RNG state whose next d100 draws are exactly `rolls`. Put it in
 * `rng.encounters` to script encounter checks: 100 always fails (successMax
 * is 95) and 1 always succeeds (successMin is 5).
 */
export function forcedRolls(...rolls: number[]): RngState {
  if (rolls.length > 3 || rolls.some((roll) => !Number.isInteger(roll) || roll < 1 || roll > 100)) {
    throw new RangeError('forcedRolls expects at most three integer d100 rolls in [1, 100]');
  }
  const key = rolls.join(',');
  const cached = forcedCache.get(key);
  if (cached !== undefined) return cached;
  // Expected search length is 100^rolls.length; the cap covers three rolls.
  for (let candidate = 0; candidate < 50_000_000; candidate++) {
    let state = candidate;
    let matched = true;
    for (const roll of rolls) {
      const draw = d100(state);
      if (draw.value !== roll) {
        matched = false;
        break;
      }
      state = draw.state;
    }
    if (matched) {
      forcedCache.set(key, candidate);
      return candidate;
    }
  }
  throw new Error(`no RNG state found for d100 rolls ${key}`);
}

// ---------------------------------------------------------------------------
// Running scenarios through the engine
// ---------------------------------------------------------------------------

export interface ScenarioStep {
  action: GameAction;
  before: CampaignState;
  /** The state after the action, or `before` unchanged if it was rejected. */
  after: CampaignState;
  events: GameEvent[];
  error?: RuleError;
}

export interface ScenarioResult {
  initial: CampaignState;
  final: CampaignState;
  steps: ScenarioStep[];
  events: GameEvent[];
  /** The RuleError that stopped the script, if any. */
  error?: RuleError;
}

export interface ScenarioOptions {
  config?: RulesConfig;
  /** createCampaign options other than the seed (birth sign, names). */
  campaign?: Partial<Omit<CreateCampaignOptions, 'seed'>>;
}

export function requireEngine(): Engine {
  if (!engine) throw new Error('scenario() needs the C1 engine (src/core/index.ts)');
  return engine;
}

/** createCampaign for `seed`, then the overrides on top. */
export function scenarioState(
  stateOverrides: StateOverrides,
  seed: number,
  options: ScenarioOptions = {},
): CampaignState {
  const { createCampaign } = requireEngine();
  const config = options.config ?? defaultConfig;
  const created = createCampaign({ ...DEFAULT_OPTIONS, ...options.campaign, seed }, config);
  return applyOverrides(created, stateOverrides);
}

/**
 * The D2 helper: set up `stateOverrides` on a fresh campaign for `seed`, then
 * apply `actions` in order. A RuleError stops the script and is returned, with
 * `final` left at the last valid state. Any other error is rethrown.
 */
export function scenario(
  stateOverrides: StateOverrides,
  actions: readonly GameAction[],
  seed = DEFAULT_OPTIONS.seed,
  options: ScenarioOptions = {},
): ScenarioResult {
  const { applyAction } = requireEngine();
  const config = options.config ?? defaultConfig;
  const initial = scenarioState(stateOverrides, seed, options);
  return runActions(initial, actions, applyAction, config);
}

export function runActions(
  initial: CampaignState,
  actions: readonly GameAction[],
  applyAction: ApplyAction<RulesConfig>,
  config: RulesConfig = defaultConfig,
): ScenarioResult {
  const steps: ScenarioStep[] = [];
  const events: GameEvent[] = [];
  let state = initial;
  for (const action of actions) {
    try {
      const result = applyAction(state, action, config);
      steps.push({ action, before: state, after: result.state, events: result.events });
      events.push(...result.events);
      state = result.state;
    } catch (error) {
      if (!(error instanceof RuleError)) throw error;
      steps.push({ action, before: state, after: state, events: [], error });
      return { initial, final: state, steps, events, error };
    }
  }
  return { initial, final: state, steps, events };
}

export function eventsOfType<T extends GameEvent['type']>(
  events: readonly GameEvent[],
  type: T,
): Extract<GameEvent, { type: T }>[] {
  return events.filter((event): event is Extract<GameEvent, { type: T }> => event.type === type);
}

/** Sum of coin_changed amounts on one account, optionally for one source. */
export function coinDelta(
  events: readonly GameEvent[],
  account: 'treasury' | 'carried',
  source?: string,
): number {
  return eventsOfType(events, 'coin_changed')
    .filter((event) => event.account === account && (source === undefined || event.source === source))
    .reduce((sum, event) => sum + event.amount, 0);
}

// ---------------------------------------------------------------------------
// Engine readiness: enable each suite when its implementation lands.
// ---------------------------------------------------------------------------

/**
 * Explicit flags keep a regression from silently turning a suite back off.
 * C2, C3 and C4 owners must enable their flag in the same PR as the feature.
 * Until then, the rule-level scenarios remain active.
 */
export const ENGINE_SUITES = {
  pilgrimage: true, // C2
  items: true, // C3
  final: true, // C4
} as const;

/** The presence of the public API enables C1, regardless of its behavior. */
export const hasHome = engine !== null;
export const hasPilgrimage = hasHome && ENGINE_SUITES.pilgrimage;
export const hasItems = hasHome && ENGINE_SUITES.items;
export const hasFinal = hasHome && ENGINE_SUITES.final;
