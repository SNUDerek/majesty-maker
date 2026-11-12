/**
 * Core invariant checker (task D1; tech doc §13).
 *
 * Test-side, but free of test-framework and Node imports, so the simulation
 * runner can import it in `--strict` mode.
 *
 * `checkInvariants` returns every violation as a message prefixed with a
 * stable invariant id (e.g. `[treasury.range] ...`), so callers and tests can
 * match on the id. `assertInvariants` throws an `InvariantError` that lists
 * them all. Both tolerate malformed input (missing fields, wrong types): a
 * broken state produces violations, never a TypeError.
 *
 * Pilgrimage progress contract this checker enforces (for C2-C4):
 * - `encounterIndex` counts encounters already resolved or skipped in the
 *   current segment, so it is also the index of the encounter being played.
 * - `furthestWaystation === segmentIndex` while the segment is in progress.
 *   Completing a regular segment advances the checkpoint to `segmentIndex + 1`
 *   and moves to `waystation_decision` with `encounterIndex` equal to the
 *   segment length. The final gauntlet has `segmentIndex === regularSegments`
 *   and never reaches `waystation_decision` (completion is victory).
 * - `reroll_or_accept` is exactly the stage with `pendingFailure === true`.
 * - Convalescence happens at home: `pendingConvalescence` is only legal in the
 *   home phase, and it is the only way a collapsed burden may persist there.
 */

import type { RulesConfig } from '../core/config.js';
import { fatigueCeiling, melancholyCeiling } from '../core/conditions.js';
import { RNG_STREAM_NAMES } from '../core/rng.js';
import type {
  ActivityId,
  CampaignState,
  Estate,
  Phase,
  PilgrimageStage,
  ZodiacSign,
} from '../core/types.js';

export class InvariantError extends Error {
  readonly violations: readonly string[];

  constructor(violations: readonly string[]) {
    super(`${violations.length} invariant violation(s):\n  ${violations.join('\n  ')}`);
    this.name = 'InvariantError';
    this.violations = violations;
  }
}

/** Throws an `InvariantError` listing every violation, if any. */
export function assertInvariants(
  state: CampaignState,
  config: RulesConfig,
  prev?: CampaignState,
): void {
  const violations = checkInvariants(state, config, prev);
  if (violations.length > 0) throw new InvariantError(violations);
}

// ---------------------------------------------------------------------------
// Domain lists (Record<T, true> keeps each list complete at compile time)
// ---------------------------------------------------------------------------

function keysOf<T extends string>(members: Record<T, true>): readonly T[] {
  return Object.keys(members) as T[];
}

const ESTATES = keysOf<Estate>({ bellatores: true, oratores: true, laboratores: true });
const PHASES = keysOf<Phase>({ home: true, pilgrimage: true, victory: true, defeat: true });
const STAGES = keysOf<PilgrimageStage>({
  encounter_reveal: true,
  choose_approach: true,
  reroll_or_accept: true,
  continue_or_retreat: true,
  waystation_decision: true,
});
const SIGNS = keysOf<ZodiacSign>({
  aries: true, taurus: true, gemini: true, cancer: true, leo: true, virgo: true,
  libra: true, scorpio: true, sagittarius: true, capricorn: true, aquarius: true, pisces: true,
});
const ACTIVITIES = keysOf<ActivityId>({
  hedge_knight: true, hermit: true, smuggler: true,
  stables: true, alehouse: true, village_watch: true, scriptorium: true,
  rest_home: true, bathhouse: true, shrine: true, banquet: true,
});
const CONVALESCENCE_CAUSES = ['home_collapse', 'wipeout'] as const;
const OUTCOME_BY_PHASE: Partial<Record<Phase, CampaignState['outcome']>> = {
  victory: 'victory',
  defeat: 'deadline',
};

// ---------------------------------------------------------------------------
// Checker
// ---------------------------------------------------------------------------

type Report = (id: string, message: string) => void;

const isInt = (value: unknown): value is number => Number.isSafeInteger(value);
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const isOneOf = <T extends string>(values: readonly T[], value: unknown): value is T =>
  typeof value === 'string' && (values as readonly string[]).includes(value);

/** Reports `id` unless `value` is a safe integer in `[min, max]`; returns whether it passed. */
function intInRange(
  report: Report,
  id: string,
  name: string,
  value: unknown,
  min: number,
  max = Number.MAX_SAFE_INTEGER,
): value is number {
  if (!isInt(value)) {
    report(id, `${name} must be a safe integer, got ${String(value)}`);
    return false;
  }
  if (value < min || value > max) {
    report(id, `${name} must be in [${min}, ${max}], got ${value}`);
    return false;
  }
  return true;
}

/** Returns every invariant violation in `state` (and in the `prev` -> `state` transition). */
export function checkInvariants(
  state: CampaignState,
  config: RulesConfig,
  prev?: CampaignState,
): string[] {
  const violations: string[] = [];
  const report: Report = (id, message) => violations.push(`[${id}] ${message}`);
  const s: unknown = state;
  if (!isRecord(s)) {
    report('state.shape', `state must be an object, got ${String(s)}`);
    return violations;
  }

  checkIdentity(s, report);
  checkRng(s, report);
  const statsOk = checkStats(s, config, report);
  const burdensOk = checkBurdens(s, report);
  intInRange(report, 'treasury.range', 'treasury', s.treasury, 0, config.startingState.treasuryMax);
  checkInventory(s, config, report);
  checkCalendar(s, config, report);
  checkPhase(s, config, report);
  if (statsOk && burdensOk) checkCollapse(s as unknown as CampaignState, report);
  if (isRecord(s.pilgrimage)) checkPilgrimage(s, s.pilgrimage, config, report);
  if (prev !== undefined && isRecord(prev as unknown)) checkTransition(prev, s, config, report);

  return violations;
}

function checkIdentity(s: Record<string, unknown>, report: Report): void {
  if (s.version !== 1) report('state.version', `version must be 1, got ${String(s.version)}`);
  if (!isInt(s.seed)) report('state.seed', `seed must be a safe integer, got ${String(s.seed)}`);
  if (!isOneOf(SIGNS, s.birthSign)) {
    report('state.birthSign', `birthSign must be a zodiac sign, got ${String(s.birthSign)}`);
  }
  const name = s.playerName;
  if (!isRecord(name) || typeof name.first !== 'string' || typeof name.last !== 'string') {
    report('state.playerName', 'playerName must be {first: string, last: string}');
  }
  if (typeof s.scionName !== 'string') report('state.scionName', 'scionName must be a string');
  if (s.lastWeeklyActivityId !== undefined && !isOneOf(ACTIVITIES, s.lastWeeklyActivityId)) {
    report(
      'state.lastWeeklyActivityId',
      `lastWeeklyActivityId must be an activity id, got ${String(s.lastWeeklyActivityId)}`,
    );
  }
  intInRange(report, 'state.waxingStreak', 'waxingStreak', s.waxingStreak, 0);
}

function checkRng(s: Record<string, unknown>, report: Report): void {
  const rng = s.rng;
  if (!isRecord(rng)) {
    report('rng.shape', 'rng must be an object of named stream states');
    return;
  }
  const expected = [...RNG_STREAM_NAMES].sort();
  const actual = Object.keys(rng).sort();
  if (expected.join() !== actual.join()) {
    report('rng.shape', `rng streams must be exactly [${expected.join(', ')}], got [${actual.join(', ')}]`);
  }
  for (const name of RNG_STREAM_NAMES) {
    if (!Object.hasOwn(rng, name)) continue; // already reported as rng.shape
    intInRange(report, 'rng.uint32', `rng.${name}`, rng[name], 0, 0xffff_ffff);
  }
}

function checkStats(s: Record<string, unknown>, config: RulesConfig, report: Report): boolean {
  const stats = s.stats;
  if (!isRecord(stats)) {
    report('stats.range', 'stats must be an object keyed by Estate');
    return false;
  }
  let ok = true;
  const extra = Object.keys(stats).filter((key) => !isOneOf(ESTATES, key));
  if (extra.length > 0) {
    report('stats.range', `stats has unknown keys [${extra.join(', ')}]`);
    ok = false;
  }
  const { statMin, statMax } = config.startingState;
  for (const estate of ESTATES) {
    ok = intInRange(report, 'stats.range', `stats.${estate}`, stats[estate], statMin, statMax) && ok;
  }
  return ok;
}

function checkBurdens(s: Record<string, unknown>, report: Report): boolean {
  const fatigueOk = intInRange(report, 'burden.range', 'fatigue', s.fatigue, 0);
  const melancholyOk = intInRange(report, 'burden.range', 'melancholy', s.melancholy, 0);
  return fatigueOk && melancholyOk;
}

function checkInventory(s: Record<string, unknown>, config: RulesConfig, report: Report): void {
  const inventory = s.inventory;
  if (!isRecord(inventory)) {
    report('inventory.shape', 'inventory must be an object of item id -> count');
    return;
  }
  for (const [itemId, count] of Object.entries(inventory)) {
    if (!Object.hasOwn(config.items.catalog, itemId)) {
      report('inventory.item', `inventory has unknown item "${itemId}"`);
    }
    // Zero counts are removed rather than stored, so serialized states stay canonical.
    intInRange(report, 'inventory.count', `inventory.${itemId}`, count, 1);
  }
}

function checkCalendar(s: Record<string, unknown>, config: RulesConfig, report: Report): void {
  const { totalWeeks } = config.calendar;
  intInRange(report, 'weeks.range', 'elapsedWeeks', s.elapsedWeeks, 0, totalWeeks);
  intInRange(
    report,
    'checkpoint.range',
    'furthestWaystation',
    s.furthestWaystation,
    0,
    config.route.regularSegments,
  );
}

function checkPhase(s: Record<string, unknown>, config: RulesConfig, report: Report): void {
  const phase = s.phase;
  if (!isOneOf(PHASES, phase)) {
    report('phase.value', `phase must be one of [${PHASES.join(', ')}], got ${String(phase)}`);
    return;
  }

  const hasPilgrimage = s.pilgrimage !== undefined;
  if ((phase === 'pilgrimage') !== hasPilgrimage) {
    report(
      'phase.pilgrimage',
      phase === 'pilgrimage'
        ? 'pilgrimage phase requires a pilgrimage object'
        : `pilgrimage object must be absent in phase ${phase}`,
    );
  }
  if (hasPilgrimage && !isRecord(s.pilgrimage)) {
    report('pilgrimage.shape', 'pilgrimage must be an object');
  }

  const expectedOutcome = OUTCOME_BY_PHASE[phase];
  if (s.outcome !== expectedOutcome) {
    report(
      'phase.outcome',
      `phase ${phase} requires outcome ${String(expectedOutcome)}, got ${String(s.outcome)}`,
    );
  }
  if (phase === 'victory' && s.furthestWaystation !== config.route.regularSegments) {
    report('phase.outcome', 'victory requires every regular waystation to be reached');
  }
  if (phase === 'defeat' && s.elapsedWeeks !== config.calendar.totalWeeks) {
    report('phase.outcome', 'deadline defeat requires the deadline week');
  }

  // The deadline is checked after every home action, so home never sits at the deadline.
  if (phase === 'home' && isInt(s.elapsedWeeks) && s.elapsedWeeks >= config.calendar.totalWeeks) {
    report('weeks.deadline', `home phase at week ${s.elapsedWeeks} must have become a deadline defeat`);
  }

  const pending = s.pendingConvalescence;
  if (pending !== undefined) {
    if (!isOneOf(CONVALESCENCE_CAUSES, pending)) {
      report('convalescence.value', `pendingConvalescence must be home_collapse|wipeout, got ${String(pending)}`);
    } else if (phase !== 'home') {
      report('convalescence.phase', `pendingConvalescence is only legal at home, not in phase ${phase}`);
    }
  }
}

/** No collapsed burden persists in an interactable state without a pending convalescence. */
function checkCollapse(state: CampaignState, report: Report): void {
  if (state.phase !== 'home' && state.phase !== 'pilgrimage') return;
  if (state.phase === 'home' && state.pendingConvalescence !== undefined) return;
  const fatigueMax = fatigueCeiling(state.stats);
  const melancholyMax = melancholyCeiling(state.stats);
  if (state.fatigue >= fatigueMax) {
    report('collapse.persisting', `fatigue ${state.fatigue} >= ceiling ${fatigueMax} in phase ${state.phase}`);
  }
  if (state.melancholy >= melancholyMax) {
    report(
      'collapse.persisting',
      `melancholy ${state.melancholy} >= ceiling ${melancholyMax} in phase ${state.phase}`,
    );
  }
}

function checkPilgrimage(
  s: Record<string, unknown>,
  p: Record<string, unknown>,
  config: RulesConfig,
  report: Report,
): void {
  const { regularSegments, encountersPerSegment, finalEncounters } = config.route;
  const stage = p.stage;
  if (!isOneOf(STAGES, stage)) {
    report('pilgrimage.stage', `stage must be one of [${STAGES.join(', ')}], got ${String(stage)}`);
  }
  for (const flag of ['skipUsed', 'consumableUsed', 'isFinal'] as const) {
    if (typeof p[flag] !== 'boolean') report('pilgrimage.shape', `pilgrimage.${flag} must be a boolean`);
  }

  // Progress through the route.
  const isFinal = p.isFinal === true;
  const length = isFinal ? finalEncounters : encountersPerSegment;
  const checkpoint = s.furthestWaystation;
  if (isFinal) {
    if (p.segmentIndex !== regularSegments) {
      report('pilgrimage.segment', `final gauntlet segmentIndex must be ${regularSegments}, got ${String(p.segmentIndex)}`);
    }
    if (checkpoint !== regularSegments) {
      report('pilgrimage.segment', 'final gauntlet requires every regular waystation to be reached');
    }
    if (stage === 'waystation_decision') {
      report('pilgrimage.stage', 'the final gauntlet has no waystation; completing it is victory');
    }
  } else if (intInRange(report, 'pilgrimage.segment', 'pilgrimage.segmentIndex', p.segmentIndex, 0, regularSegments - 1)) {
    const expected = stage === 'waystation_decision' ? p.segmentIndex + 1 : p.segmentIndex;
    if (checkpoint !== expected) {
      report(
        'pilgrimage.checkpoint',
        `furthestWaystation must be ${expected} at segment ${p.segmentIndex} stage ${String(stage)}, got ${String(checkpoint)}`,
      );
    }
  }
  if (intInRange(report, 'pilgrimage.encounter', 'pilgrimage.encounterIndex', p.encounterIndex, 0, length)) {
    const complete = p.encounterIndex === length;
    if (complete !== (stage === 'waystation_decision')) {
      report(
        'pilgrimage.encounter',
        complete
          ? `a completed segment (${length}/${length}) must be at waystation_decision, not ${String(stage)}`
          : `waystation_decision requires a completed segment, at encounter ${p.encounterIndex}/${length}`,
      );
    }
    if (stage === 'continue_or_retreat' && p.encounterIndex === 0) {
      report('pilgrimage.encounter', 'continue_or_retreat requires at least one resolved encounter');
    }
  }

  // Stage-specific encounter fields.
  if (stage === 'choose_approach' || stage === 'reroll_or_accept') {
    if (!isOneOf(ESTATES, p.currentThreat)) {
      report('pilgrimage.threat', `stage ${stage} requires a revealed currentThreat`);
    }
  } else if (p.currentThreat !== undefined && !isOneOf(ESTATES, p.currentThreat)) {
    report('pilgrimage.threat', `currentThreat must be an Estate, got ${String(p.currentThreat)}`);
  }
  if (stage === 'reroll_or_accept') {
    if (!isOneOf(ESTATES, p.currentApproach)) {
      report('pilgrimage.reroll', 'reroll_or_accept requires the chosen currentApproach');
    }
    if (p.lastRoll === undefined || p.lastProbability === undefined) {
      report('pilgrimage.reroll', 'reroll_or_accept requires the failed lastRoll and lastProbability');
    }
    if (p.consumableId === undefined || p.consumableUsed === true) {
      report('pilgrimage.reroll', 'reroll_or_accept requires an unused carried consumable');
    }
    const item = typeof p.consumableId === 'string' && Object.hasOwn(config.items.catalog, p.consumableId)
      ? config.items.catalog[p.consumableId]
      : undefined;
    if (item?.effect !== 'reroll_failed_check') {
      report('pilgrimage.reroll', 'reroll_or_accept requires a consumable with a reroll effect');
    }
    if (isInt(p.lastRoll) && isInt(p.lastProbability) && p.lastRoll <= p.lastProbability) {
      report('pilgrimage.reroll', 'reroll_or_accept requires a failed roll (roll > probability)');
    }
  } else if (p.currentApproach !== undefined && !isOneOf(ESTATES, p.currentApproach)) {
    report('pilgrimage.threat', `currentApproach must be an Estate, got ${String(p.currentApproach)}`);
  }
  if ((p.pendingFailure === true) !== (stage === 'reroll_or_accept')) {
    report('pilgrimage.reroll', 'pendingFailure must be true exactly in stage reroll_or_accept');
  }
  if (p.pendingFailure !== undefined && typeof p.pendingFailure !== 'boolean') {
    report('pilgrimage.reroll', 'pendingFailure must be a boolean when present');
  }
  if (p.lastRoll !== undefined) intInRange(report, 'pilgrimage.roll', 'pilgrimage.lastRoll', p.lastRoll, 1, 100);
  if (p.lastProbability !== undefined) {
    intInRange(
      report,
      'pilgrimage.roll',
      'pilgrimage.lastProbability',
      p.lastProbability,
      config.encounters.successMin,
      config.encounters.successMax,
    );
  }

  // Coin: carried Coin only ever decreases from what was carried out plus what was earned.
  const { carriedCoin, departureCarriedCoin, earnedCoin } = p;
  const carriedOk = intInRange(report, 'pilgrimage.coin', 'pilgrimage.carriedCoin', carriedCoin, 0);
  const departureOk = intInRange(report, 'pilgrimage.coin', 'pilgrimage.departureCarriedCoin', departureCarriedCoin, 0);
  const earnedOk = intInRange(report, 'pilgrimage.coin', 'pilgrimage.earnedCoin', earnedCoin, 0);
  if (carriedOk && departureOk && earnedOk && carriedCoin > departureCarriedCoin + earnedCoin) {
    report(
      'pilgrimage.coin',
      `carriedCoin ${carriedCoin} exceeds departureCarriedCoin ${departureCarriedCoin} + earnedCoin ${earnedCoin}`,
    );
  }

  // Carried item slots.
  for (const [field, kind] of [['equipmentId', 'equipment'], ['consumableId', 'consumable']] as const) {
    const itemId = p[field];
    if (itemId === undefined) continue;
    const item = typeof itemId === 'string' && Object.hasOwn(config.items.catalog, itemId)
      ? config.items.catalog[itemId]
      : undefined;
    if (item === undefined) {
      report('pilgrimage.item', `pilgrimage.${field} must be a catalog item, got ${String(itemId)}`);
    } else if (item.kind !== kind) {
      report('pilgrimage.item', `pilgrimage.${field} "${String(itemId)}" is a ${item.kind}, not ${kind}`);
    }
  }

  if (p.skipUsed === true && config.astrology.newMoon.skipFee === null) {
    report('pilgrimage.skip', 'skipUsed is set but New Moon skipping is disabled');
  }

  // No week passes inside a segment: entry spends the only one.
  if (intInRange(report, 'pilgrimage.entryWeek', 'pilgrimage.segmentEntryWeek', p.segmentEntryWeek, 0)) {
    const weeks = s.elapsedWeeks;
    if (isInt(weeks) && (p.segmentEntryWeek > weeks || weeks - p.segmentEntryWeek > 1)) {
      report(
        'pilgrimage.entryWeek',
        `segmentEntryWeek ${p.segmentEntryWeek} must be the current week or the one before (elapsed ${weeks})`,
      );
    }
  }
}

function checkTransition(
  prev: CampaignState,
  s: Record<string, unknown>,
  config: RulesConfig,
  report: Report,
): void {
  for (const field of ['version', 'seed', 'birthSign', 'scionName'] as const) {
    if (s[field] !== prev[field]) report('transition.identity', `${field} changed from ${String(prev[field])}`);
  }
  const name = s.playerName;
  if (!isRecord(name) || !isRecord(prev.playerName)
    || name.first !== prev.playerName.first || name.last !== prev.playerName.last) {
    report('transition.identity', 'playerName changed');
  }

  if (isInt(s.elapsedWeeks) && isInt(prev.elapsedWeeks)) {
    const delta = s.elapsedWeeks - prev.elapsedWeeks;
    // One action spends at most its own week plus one convalescence bout.
    const { forcedWeek } = config.failure.homeCollapse;
    const maxDelta = 1 + Math.max(forcedWeek ? 1 : 0, config.failure.wipeoutConvalescenceWeeks);
    if (delta < 0) report('transition.weeks', `elapsedWeeks decreased from ${prev.elapsedWeeks} to ${s.elapsedWeeks}`);
    else if (delta > maxDelta) {
      report('transition.weeks', `elapsedWeeks advanced ${delta} weeks in one action (max ${maxDelta})`);
    }

    // Segment entry (from home or a waystation) spends exactly one week; play inside a segment spends none.
    const next = s.pilgrimage;
    if (s.phase === 'pilgrimage' && isRecord(next)) {
      const entered = !isRecord(prev.pilgrimage) || prev.pilgrimage.segmentIndex !== next.segmentIndex
        || prev.pilgrimage.isFinal !== next.isFinal;
      if (entered && delta !== 1) {
        report('transition.weeks', `entering a segment must spend exactly 1 week, spent ${delta}`);
      } else if (!entered && delta !== 0) {
        report('transition.weeks', `play inside a segment must spend no week, spent ${delta}`);
      }
    }
  }

  const next = s.pilgrimage;
  const previous = prev.pilgrimage;
  if (s.phase === 'pilgrimage' && isRecord(next)) {
    const sameSegment = isRecord(previous) && previous.segmentIndex === next.segmentIndex
      && previous.isFinal === next.isFinal;
    if (sameSegment) {
      if (next.segmentEntryWeek !== previous.segmentEntryWeek) {
        report('transition.progress', 'segmentEntryWeek must remain locked inside a segment');
      }
      if (isInt(next.encounterIndex) && isInt(previous.encounterIndex)) {
        const advanced = next.encounterIndex - previous.encounterIndex;
        if (advanced < 0 || advanced > 1) {
          report('transition.progress', 'encounterIndex must stay fixed or advance exactly once inside a segment');
        }
      }
    } else if (next.encounterIndex !== 0) {
      report('transition.progress', 'entering a segment must start at encounterIndex 0');
    }
  }

  if (isInt(s.furthestWaystation) && s.furthestWaystation < prev.furthestWaystation) {
    report(
      'transition.checkpoint',
      `furthestWaystation regressed from ${prev.furthestWaystation} to ${s.furthestWaystation}`,
    );
  }
  if (isInt(s.furthestWaystation) && isInt(prev.furthestWaystation)
    && s.furthestWaystation > prev.furthestWaystation + 1) {
    report('transition.checkpoint', 'one action cannot unlock more than one checkpoint');
  }

  if ((prev.phase === 'victory' || prev.phase === 'defeat') && (s.phase !== prev.phase || s.outcome !== prev.outcome)) {
    report('transition.terminal', `terminal phase ${prev.phase} changed to ${String(s.phase)}`);
  }
}
