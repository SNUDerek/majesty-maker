/** Pilgrimage: encounter generation (B3), the segment state machine (C2) and the final gauntlet (C4). */
import type { RulesConfig } from './config.js';
import { d100, drawFrom, drawWeighted, rollInt, type Draw, type RngState } from './rng.js';
import { getCalendar } from './calendar.js';
import { clampTreasury, collapseCause, purseProtectionPct } from './conditions.js';
import { encounterOdds, failurePenalty, isEncounterSuccess } from './encounter.js';
import { canUseConsumable, consumableEffect, getItem } from './items.js';
import { applyIntegerPercent } from './math.js';
import {
  RuleError,
  type ActionResult,
  type AvailableAction,
  type CampaignState,
  type CoinAccount,
  type CoinSource,
  type Estate,
  type GameAction,
  type GameEvent,
  type LunarPhase,
  type PilgrimageStage,
  type PilgrimageState,
} from './types.js';

// Fixed order makes seeded draws independent of JSON property insertion order.
const THREAT_ORDER = ['bellatores', 'oratores', 'laboratores'] as const satisfies readonly Estate[];

/**
 * Draw with replacement from relative integer weights. Pass rng.encounters and
 * store the returned state in that stream. This has no player-build input and
 * never adjusts the distribution to counter the player. Zero weights exclude
 * an Estate; even a single possible threat consumes a draw.
 */
export function drawThreat(
  state: RngState,
  distribution: RulesConfig['encounters']['distribution'],
): Draw<Estate> {
  return drawWeighted(state, THREAT_ORDER.map((estate) => [estate, distribution[estate]] as const));
}

// ===========================================================================
// C2: pilgrimage state machine (tech §7)
// ===========================================================================
//
// Pure transitions over CampaignState. The C1 reducer dispatches
// BEGIN_PILGRIMAGE and every in-pilgrimage action here, and appends
// `pilgrimageActions` / `beginPilgrimageDescriptor` to `getAvailableActions`.
// Like the reducer, every transition validates and throws a `RuleError`
// before returning, and never mutates its input.
//
// Stages:
//   BEGIN_PILGRIMAGE (home) -> fee + carry out, week spent, threat drawn -> choose_approach
//   CHOOSE_APPROACH -> d100 on rng.encounters
//     success: +1d4 carried (rng.rewards) -> continue_or_retreat | waystation_decision
//     failure: reroll_or_accept (unused reroll consumable carried) | penalty
//   penalty -> wipeout (burden reaches its ceiling, or Coin cost > carried)
//            | continue_or_retreat | waystation_decision
//   ACCEPT_RESULT (reroll_or_accept) -> penalty
//   CONTINUE_ENCOUNTER -> threat drawn -> choose_approach
//   RETREAT -> loot forfeit + toll, bank, home (no extra week)
//   RETURN_HOME (waystation) -> bank, home (no extra week)
//   CONTINUE_SEGMENT (waystation) -> week spent, no fee, threat drawn -> choose_approach
//
// Final gauntlet (C4, tech §8): once every regular waystation is reached
// (`furthestWaystation === regularSegments`), BEGIN_PILGRIMAGE from home or
// CONTINUE_SEGMENT from the last waystation enters segment `regularSegments`
// with `isFinal`, `finalEncounters` and `finalRoadBonus`. It runs on the same
// FSM; resolving its last encounter is immediate victory (carried Coin banked,
// slot items returned, no week spent). A retreat or wipeout keeps the final
// checkpoint, so it can be retried while weeks remain.
//
// `encounter_reveal` is transient: the threat is revealed in the same action
// that reaches it, because no player action exists between reveal and choice.
// The convalescence week after a wipeout is applied in the same action, as for
// a home collapse.
//
// C3 items and skipping:
//   BEGIN_PILGRIMAGE may move one equipment and one consumable from the
//   inventory into the slots. USE_CONSUMABLE follows B2's stage rules:
//   Theriac/Wort at continue_or_retreat or waystation_decision, Metheglin only
//   at reroll_or_accept, where it rerolls the same threat and approach. A used
//   consumable stays in its slot with `consumableUsed`, so it is never
//   returned or lost again. SKIP_ENCOUNTER (choose_approach, New Moon
//   segments, once per segment, fee from carried Coin, off while
//   `astrology.newMoon.skipFee` is null) counts the card as passed with no roll.

export type PilgrimageAction = Extract<
  GameAction,
  {
    type:
      | 'BEGIN_PILGRIMAGE'
      | 'CHOOSE_APPROACH'
      | 'SKIP_ENCOUNTER'
      | 'USE_CONSUMABLE'
      | 'ACCEPT_RESULT'
      | 'CONTINUE_ENCOUNTER'
      | 'RETREAT'
      | 'RETURN_HOME'
      | 'CONTINUE_SEGMENT';
  }
>;

const PILGRIMAGE_ACTION_TYPES: ReadonlySet<string> = new Set<PilgrimageAction['type']>([
  'BEGIN_PILGRIMAGE', 'CHOOSE_APPROACH', 'SKIP_ENCOUNTER', 'USE_CONSUMABLE', 'ACCEPT_RESULT',
  'CONTINUE_ENCOUNTER', 'RETREAT', 'RETURN_HOME', 'CONTINUE_SEGMENT',
]);

/** True for the actions `applyPilgrimageAction` handles (the reducer's dispatch test). */
export function isPilgrimageAction(action: GameAction): action is PilgrimageAction {
  return PILGRIMAGE_ACTION_TYPES.has(action.type);
}

/** Mutable working copy plus the event log for one transition. */
class Transition {
  readonly events: GameEvent[] = [];

  constructor(public state: CampaignState, readonly config: RulesConfig) {}

  get week(): number {
    return this.state.elapsedWeeks;
  }

  get road(): PilgrimageState {
    const road = this.state.pilgrimage;
    if (road === undefined) throw new Error('Transition.road: not on a pilgrimage');
    return road;
  }

  coin(account: CoinAccount, amount: number, source: CoinSource): void {
    if (amount !== 0) this.events.push({ type: 'coin_changed', week: this.week, account, amount, source });
  }

  /** Moves `amount` carried Coin into the treasury (clamped at treasuryMax). */
  bank(amount: number, source: CoinSource): void {
    const road = this.road;
    road.carriedCoin -= amount;
    this.coin('carried', -amount, source);
    const next = clampTreasury(this.state.treasury + amount, this.config);
    this.coin('treasury', next - this.state.treasury, source);
    this.state.treasury = next;
  }

  spendWeek(reason: 'segment_entry' | 'convalescence'): void {
    this.events.push({ type: 'week_spent', week: this.week, reason });
    this.state.elapsedWeeks += 1;
  }

  result(): ActionResult {
    return { state: this.state, events: this.events };
  }
}

function lengthOf(road: Pick<PilgrimageState, 'isFinal'>, config: RulesConfig): number {
  return road.isFinal ? config.route.finalEncounters : config.route.encountersPerSegment;
}

/** The lunar phase locked at segment entry. */
export function segmentLunarPhase(state: CampaignState, config: RulesConfig): LunarPhase {
  const road = state.pilgrimage;
  if (road === undefined) throw new RangeError('segmentLunarPhase: not on a pilgrimage');
  return getCalendar({ ...state, elapsedWeeks: road.segmentEntryWeek }, config).lunarPhase;
}

function requireStage(state: CampaignState, action: PilgrimageAction, ...stages: PilgrimageStage[]): PilgrimageState {
  if (state.phase !== 'pilgrimage' || state.pilgrimage === undefined) {
    throw new RuleError('INVALID_PHASE', `${action.type} needs an active pilgrimage, but the phase is ${state.phase}`);
  }
  if (!stages.includes(state.pilgrimage.stage)) {
    throw new RuleError('INVALID_STAGE', `${action.type} is not allowed at stage ${state.pilgrimage.stage}`);
  }
  return state.pilgrimage;
}

function requireWeek(state: CampaignState, config: RulesConfig): void {
  if (state.elapsedWeeks >= config.calendar.totalWeeks) {
    throw new RuleError('DEADLINE_REACHED', `no week remains to enter a segment (week ${state.elapsedWeeks})`);
  }
}

// ---------------------------------------------------------------------------
// Entry
// ---------------------------------------------------------------------------

/** True when the segment after the regular route is the final gauntlet. */
function isFinalSegment(segmentIndex: number, config: RulesConfig): boolean {
  return segmentIndex >= config.route.regularSegments;
}

/** Spends the entry week, locks the lunar phase and reveals the first threat. */
function enterSegment(t: Transition, segmentIndex: number): void {
  const road = t.road;
  const entryWeek = t.week;
  t.spendWeek('segment_entry');
  Object.assign(road, {
    segmentIndex,
    encounterIndex: 0,
    skipUsed: false,
    isFinal: isFinalSegment(segmentIndex, t.config),
    segmentEntryWeek: entryWeek,
  });
  t.events.push({ type: 'pilgrimage_started', week: entryWeek, segmentIndex, isFinal: road.isFinal });
  revealThreat(t, entryWeek);
}

function revealThreat(t: Transition, week = t.week): void {
  const road = t.road;
  const drawn = drawFrom(t.state.rng, 'encounters', (s) => drawThreat(s, t.config.encounters.distribution));
  t.state.rng = drawn.streams;
  for (const key of ['currentApproach', 'lastRoll', 'lastProbability', 'pendingFailure'] as const) delete road[key];
  road.currentThreat = drawn.value;
  road.stage = 'choose_approach';
  t.events.push({ type: 'encounter_drawn', week, threat: drawn.value, encounterIndex: road.encounterIndex });
}

function begin(input: CampaignState, action: Extract<GameAction, { type: 'BEGIN_PILGRIMAGE' }>, config: RulesConfig): ActionResult {
  if (input.phase !== 'home') {
    throw new RuleError('INVALID_PHASE', `BEGIN_PILGRIMAGE starts from home, but the phase is ${input.phase}`);
  }
  requireWeek(input, config);
  if (input.pendingConvalescence !== undefined) {
    throw new RuleError('INVALID_ACTION', 'departure is unavailable while convalescence is pending');
  }
  const slots = [
    ['equipment', action.equipmentId, config.items.maxEquipment],
    ['consumable', action.consumableId, config.items.maxConsumables],
  ] as const;
  for (const [kind, itemId, max] of slots) {
    if (itemId === undefined) continue;
    if (typeof itemId !== 'string') throw new RuleError('INVALID_ITEM', `${kind} id must be a string`);
    if (getItem(itemId, config).kind !== kind) {
      throw new RuleError('INVALID_ITEM', `${itemId} is not ${kind === 'equipment' ? 'equipment' : 'a consumable'}`);
    }
    if (max < 1) throw new RuleError('INVALID_ACTION', `no ${kind} slot is configured (items.max*)`);
    if ((input.inventory[itemId] ?? 0) < 1) {
      throw new RuleError('ITEM_UNAVAILABLE', `${itemId} is not in the inventory`);
    }
  }
  const { carry } = action;
  if (!Number.isSafeInteger(carry) || carry < 0) {
    throw new RuleError('INVALID_ACTION', `carry must be a non-negative integer, got ${String(carry)}`);
  }
  const fee = config.route.departureFee;
  if (fee + carry > input.treasury) {
    throw new RuleError('INSUFFICIENT_FUNDS', `departure needs ${fee} + ${carry} Coin, the treasury holds ${input.treasury}`);
  }

  const t = new Transition(structuredClone(input), config);
  t.state.treasury -= fee + carry;
  t.coin('treasury', -fee, 'departure_fee');
  t.coin('treasury', -carry, 'carry_out');
  t.coin('carried', carry, 'carry_out');
  for (const [, itemId] of slots) {
    if (itemId === undefined) continue;
    const left = t.state.inventory[itemId]! - 1;
    if (left === 0) delete t.state.inventory[itemId];
    else t.state.inventory[itemId] = left;
    t.events.push({ type: 'item_changed', week: t.week, itemId, amount: -1, source: 'pilgrimage_slot_out' });
  }
  // A pilgrimage week is not a weekly activity: it breaks any Waxing repeat.
  delete t.state.lastWeeklyActivityId;
  t.state.waxingStreak = 0;
  t.state.phase = 'pilgrimage';
  t.state.pilgrimage = {
    stage: 'encounter_reveal',
    segmentIndex: input.furthestWaystation,
    encounterIndex: 0,
    carriedCoin: carry,
    departureCarriedCoin: carry,
    earnedCoin: 0,
    skipUsed: false,
    consumableUsed: false,
    isFinal: isFinalSegment(input.furthestWaystation, config), // set again by enterSegment
    segmentEntryWeek: input.elapsedWeeks,
    ...(action.equipmentId === undefined ? {} : { equipmentId: action.equipmentId }),
    ...(action.consumableId === undefined ? {} : { consumableId: action.consumableId }),
  };
  enterSegment(t, input.furthestWaystation);
  return t.result();
}

// ---------------------------------------------------------------------------
// Encounters
// ---------------------------------------------------------------------------

function chooseApproach(input: CampaignState, action: Extract<GameAction, { type: 'CHOOSE_APPROACH' }>, config: RulesConfig): ActionResult {
  const current = requireStage(input, action, 'choose_approach');
  const approach = action.estate;
  if (!Object.hasOwn(input.stats, approach)) {
    throw new RuleError('INVALID_ACTION', `unknown approach ${JSON.stringify(approach)}`);
  }
  if (current.currentThreat === undefined) throw new Error('choose_approach without a revealed threat');

  const t = new Transition(structuredClone(input), config);
  t.road.currentApproach = approach;
  const success = rollEncounter(t);
  if (success) {
    reward(t);
  } else if (canReroll(t.road, config)) {
    t.road.stage = 'reroll_or_accept';
    t.road.pendingFailure = true;
  } else {
    applyFailure(t);
  }
  return t.result();
}

/** Rolls d100 for the current threat and approach, records it, and reports success. */
function rollEncounter(t: Transition): boolean {
  const { state, config } = t;
  const road = t.road;
  const threat = road.currentThreat;
  const approach = road.currentApproach;
  if (threat === undefined || approach === undefined) throw new Error('rollEncounter needs a threat and an approach');
  const odds = encounterOdds(
    {
      stat: state.stats[approach],
      approach,
      threat,
      lunar: segmentLunarPhase(state, config),
      segmentIndex: road.segmentIndex,
      isFinal: road.isFinal,
      ...(road.equipmentId === undefined ? {} : { equipmentId: road.equipmentId }),
    },
    config,
  );
  const roll = drawFrom(t.state.rng, 'encounters', d100);
  t.state.rng = roll.streams;
  const success = isEncounterSuccess(odds.probability, roll.value);
  Object.assign(road, { lastRoll: roll.value, lastProbability: odds.probability });
  t.events.push({
    type: 'encounter_resolved', week: t.week, segmentIndex: road.segmentIndex, isFinal: road.isFinal,
    encounterIndex: road.encounterIndex, threat, approach, success, probability: odds.probability, roll: roll.value,
  });
  return success;
}

/** A won encounter: +1d4 carried and earned Coin (rng.rewards), then advance. */
function reward(t: Transition): void {
  const road = t.road;
  const drawn = drawFrom(t.state.rng, 'rewards', (s) => rollInt(s, 1, t.config.encounters.rewardCoinDie));
  t.state.rng = drawn.streams;
  road.carriedCoin += drawn.value;
  road.earnedCoin += drawn.value;
  t.coin('carried', drawn.value, 'encounter_reward');
  advance(t);
}

function canReroll(road: PilgrimageState, config: RulesConfig): boolean {
  return road.consumableId !== undefined && !road.consumableUsed &&
    getItem(road.consumableId, config).effect === 'reroll_failed_check';
}

function acceptResult(input: CampaignState, action: PilgrimageAction, config: RulesConfig): ActionResult {
  requireStage(input, action, 'reroll_or_accept');
  const t = new Transition(structuredClone(input), config);
  applyFailure(t);
  return t.result();
}

/** Charges the failed approach's penalty, then wipes out or advances. */
function applyFailure(t: Transition): void {
  const { state, config } = t;
  const road = t.road;
  const approach = road.currentApproach;
  if (approach === undefined) throw new Error('applyFailure without a chosen approach');
  delete road.pendingFailure;
  const penalty = failurePenalty(
    {
      approach,
      lunar: segmentLunarPhase(state, config),
      ...(road.equipmentId === undefined ? {} : { equipmentId: road.equipmentId }),
      purseProtectionPct: purseProtectionPct(state.stats),
    },
    config,
  );

  if (penalty.resource === 'coin') {
    if (penalty.amount > road.carriedCoin) {
      wipeout(t, 'coin');
      return;
    }
    road.carriedCoin -= penalty.amount;
    t.coin('carried', -penalty.amount, 'laboratores_penalty');
  } else if (penalty.amount > 0) {
    state[penalty.resource] += penalty.amount;
    t.events.push({
      type: 'burden_changed', week: t.week, burden: penalty.resource, amount: penalty.amount, source: 'encounter_penalty',
    });
    const cause = collapseCause(state);
    if (cause !== null) {
      wipeout(t, cause);
      return;
    }
  }
  advance(t);
}

/**
 * One resolved encounter: the index advances once, and the last one completes
 * the segment (a waystation, or victory for the final gauntlet).
 */
function advance(t: Transition): void {
  const road = t.road;
  road.encounterIndex += 1;
  if (road.encounterIndex < lengthOf(road, t.config)) {
    road.stage = 'continue_or_retreat';
    return;
  }
  if (road.isFinal) {
    victory(t);
    return;
  }
  const waystation = road.segmentIndex + 1;
  // The checkpoint only ever grows (tech §7).
  t.state.furthestWaystation = Math.max(t.state.furthestWaystation, waystation);
  road.stage = 'waystation_decision';
  t.events.push({ type: 'waystation_reached', week: t.week, waystation });
}

function continueEncounter(input: CampaignState, action: PilgrimageAction, config: RulesConfig): ActionResult {
  requireStage(input, action, 'continue_or_retreat');
  const t = new Transition(structuredClone(input), config);
  revealThreat(t);
  return t.result();
}

// ---------------------------------------------------------------------------
// Items and skipping (C3)
// ---------------------------------------------------------------------------

const ROAD_STAGES: PilgrimageStage[] = [
  'encounter_reveal', 'choose_approach', 'reroll_or_accept', 'continue_or_retreat', 'waystation_decision',
];

function useConsumable(input: CampaignState, action: Extract<GameAction, { type: 'USE_CONSUMABLE' }>, config: RulesConfig): ActionResult {
  const current = requireStage(input, action, ...ROAD_STAGES);
  const { itemId } = action;
  if (typeof itemId !== 'string') throw new RuleError('INVALID_ITEM', 'itemId must be a string');
  getItem(itemId, config); // INVALID_ITEM for unknown ids
  if (current.consumableId !== itemId) {
    throw new RuleError('ITEM_UNAVAILABLE', `${itemId} is not in the consumable slot`);
  }
  if (current.consumableUsed) throw new RuleError('CONSUMABLE_ALREADY_USED', `${itemId} has already been used`);
  if (!canUseConsumable(itemId, current.stage, config)) {
    throw new RuleError('INVALID_STAGE', `${itemId} cannot be used at stage ${current.stage}`);
  }

  const t = new Transition(structuredClone(input), config);
  const road = t.road;
  const state = t.state;
  const effect = consumableEffect(itemId, current.stage, state, config);
  road.consumableUsed = true;
  // The item left the inventory at departure; consuming it changes no count.
  t.events.push({ type: 'item_changed', week: t.week, itemId, amount: 0, source: 'consumed' });
  t.events.push({ type: 'consumable_used', week: t.week, itemId });

  if (!effect.reroll) {
    for (const burden of ['fatigue', 'melancholy'] as const) {
      if (effect[burden] === 0) continue;
      state[burden] += effect[burden];
      t.events.push({ type: 'burden_changed', week: t.week, burden, amount: effect[burden], source: 'consumable' });
    }
    return t.result();
  }

  // Metheglin: the same threat and approach roll again. The first failure is
  // never charged; the encounter index advances once, whatever the reroll.
  delete road.pendingFailure;
  const success = rollEncounter(t);
  t.events.push({ type: 'reroll_used', week: t.week, itemId, roll: road.lastRoll! });
  if (success) reward(t);
  else applyFailure(t);
  return t.result();
}

/** The New Moon bribe is configured, the segment is New Moon-locked and it is unused. */
function skipBlocker(state: CampaignState, config: RulesConfig): string | null {
  const fee = config.astrology.newMoon.skipFee;
  if (fee === null) return 'encounter skipping is disabled (astrology.newMoon.skipFee is null)';
  if (segmentLunarPhase(state, config) !== 'new') return 'encounters can be skipped only in a New Moon segment';
  return null;
}

function skipEncounter(input: CampaignState, action: PilgrimageAction, config: RulesConfig): ActionResult {
  const current = requireStage(input, action, 'choose_approach');
  const blocker = skipBlocker(input, config);
  if (blocker !== null) throw new RuleError('INVALID_ACTION', blocker);
  if (current.skipUsed) throw new RuleError('SKIP_ALREADY_USED', 'the New Moon skip is once per segment');
  const fee = config.astrology.newMoon.skipFee!;
  if (fee > current.carriedCoin) {
    throw new RuleError('INSUFFICIENT_FUNDS', `the skip costs ${fee} carried Coin, ${current.carriedCoin} carried`);
  }

  const t = new Transition(structuredClone(input), config);
  const road = t.road;
  road.carriedCoin -= fee;
  t.coin('carried', -fee, 'skip_fee');
  road.skipUsed = true;
  t.events.push({ type: 'encounter_skipped', week: t.week, encounterIndex: road.encounterIndex, source: 'new_moon_bribe' });
  // Q9: a skipped card counts toward the segment's N encounters.
  advance(t);
  return t.result();
}

// ---------------------------------------------------------------------------
// Leaving the road
// ---------------------------------------------------------------------------

/** Returns slot items to the inventory (an unused consumable too) and leaves the road. */
function leaveRoad(t: Transition, lostConsumable: boolean): void {
  const road = t.road;
  const inventory = t.state.inventory;
  const giveBack = (itemId: string): void => {
    inventory[itemId] = (inventory[itemId] ?? 0) + 1;
    t.events.push({ type: 'item_changed', week: t.week, itemId, amount: 1, source: 'pilgrimage_slot_returned' });
  };
  if (road.equipmentId !== undefined) giveBack(road.equipmentId);
  if (road.consumableId !== undefined && !road.consumableUsed) {
    if (lostConsumable) {
      t.events.push({ type: 'item_changed', week: t.week, itemId: road.consumableId, amount: 0, source: 'wipeout_lost' });
    } else {
      giveBack(road.consumableId);
    }
  }
  delete t.state.pilgrimage;
}

function goHome(t: Transition, lostConsumable: boolean): void {
  leaveRoad(t, lostConsumable);
  t.state.phase = 'home';
}

/**
 * Final gauntlet completed (tech §8): immediate victory in the current week,
 * with no week consumed after it. Carried Coin is banked and slot items come
 * home so the terminal state's ledger is complete.
 */
function victory(t: Transition): void {
  t.bank(t.road.carriedCoin, 'bank_carried');
  leaveRoad(t, false);
  t.state.phase = 'victory';
  t.state.outcome = 'victory';
  t.events.push({ type: 'victory', week: t.week });
}

/** Home with no week left is the deadline defeat (tech §3). */
function checkDeadline(t: Transition): void {
  const { totalWeeks } = t.config.calendar;
  if (t.state.phase === 'home' && t.state.elapsedWeeks >= totalWeeks) {
    t.state.phase = 'defeat';
    t.state.outcome = 'deadline';
    delete t.state.pendingConvalescence;
    t.events.push({ type: 'deadline', week: totalWeeks });
  }
}

function retreat(input: CampaignState, action: PilgrimageAction, config: RulesConfig): ActionResult {
  requireStage(input, action, 'continue_or_retreat');
  const t = new Transition(structuredClone(input), config);
  const road = t.road;
  t.events.push({ type: 'retreat', week: t.week, segmentIndex: road.segmentIndex });

  // Only earned loot is reduced; Coin carried from home is protected (tech §7).
  // Penalties spend earned Coin first. Historical earnings can exceed what is
  // still in the purse, so do not forfeit already-spent loot a second time.
  const remainingEarned = Math.max(0, road.carriedCoin - road.departureCarriedCoin);
  const kept = applyIntegerPercent(remainingEarned, config.failure.retreatLootRetentionPct);
  const forfeit = remainingEarned - kept;
  road.carriedCoin -= forfeit;
  t.coin('carried', -forfeit, 'retreat_loot_forfeit');

  // Q7: the toll comes from carried Coin first, then the treasury, never below 0.
  const toll = config.failure.retreatToll;
  const fromCarried = Math.min(toll, road.carriedCoin);
  road.carriedCoin -= fromCarried;
  t.coin('carried', -fromCarried, 'retreat_toll');
  const fromTreasury = Math.min(toll - fromCarried, t.state.treasury);
  t.state.treasury -= fromTreasury;
  t.coin('treasury', -fromTreasury, 'retreat_toll');

  t.bank(road.carriedCoin, 'bank_carried');
  goHome(t, false);
  checkDeadline(t);
  return t.result();
}

function returnHome(input: CampaignState, action: PilgrimageAction, config: RulesConfig): ActionResult {
  requireStage(input, action, 'waystation_decision');
  const t = new Transition(structuredClone(input), config);
  t.bank(t.road.carriedCoin, 'bank_carried');
  goHome(t, false);
  checkDeadline(t);
  return t.result();
}

function continueSegment(input: CampaignState, action: PilgrimageAction, config: RulesConfig): ActionResult {
  const road = requireStage(input, action, 'waystation_decision');
  requireWeek(input, config);
  // The final gauntlet has no waystation, so the next segment is at most the final one.
  const next = road.segmentIndex + 1;
  const t = new Transition(structuredClone(input), config);
  enterSegment(t, next);
  return t.result();
}

/**
 * Wipeout (tech §7): Purse Protection keeps a share of the pre-lethal carried
 * Coin, the rest and the unused consumable are lost, equipment comes home,
 * the medical fee is min(max, treasury), burdens reset per config, and one
 * convalescence week is spent if any remains. With `{ recovery }` each
 * convalescence week lowers both burdens by that amount instead of a reset.
 */
function wipeout(t: Transition, cause: 'fatigue' | 'melancholy' | 'both' | 'coin'): void {
  const { config } = t;
  const state = t.state;
  const road = t.road;
  t.events.push({ type: 'wipeout', week: t.week, cause });

  const retained = applyIntegerPercent(road.carriedCoin, purseProtectionPct(state.stats));
  const lost = road.carriedCoin - retained;
  road.carriedCoin -= lost;
  t.coin('carried', -lost, 'wipeout_lost');
  t.bank(retained, 'wipeout_retained');

  const fee = Math.min(config.failure.wipeoutMedicalFeeMax, state.treasury);
  state.treasury -= fee;
  t.coin('treasury', -fee, 'medical_fee');

  goHome(t, true);

  const reset = config.failure.wipeoutBurdenReset;
  if (reset === 'zero') {
    for (const burden of ['fatigue', 'melancholy'] as const) {
      if (state[burden] !== 0) {
        t.events.push({ type: 'burden_changed', week: t.week, burden, amount: -state[burden], source: 'wipeout_reset' });
        state[burden] = 0;
      }
    }
  }

  for (let i = 0; i < config.failure.wipeoutConvalescenceWeeks; i++) {
    if (state.elapsedWeeks >= config.calendar.totalWeeks) break; // bounded by the deadline
    t.events.push({ type: 'convalescence', week: t.week, cause: 'wipeout' });
    // Q13: bounded recovery belongs to an actual convalescence week, so none is
    // granted when no week remains. No Waning bonus applies.
    if (typeof reset === 'object') {
      for (const burden of ['fatigue', 'melancholy'] as const) {
        const next = Math.max(0, state[burden] - reset.recovery);
        if (next !== state[burden]) {
          t.events.push({ type: 'burden_changed', week: t.week, burden, amount: next - state[burden], source: 'convalescence' });
          state[burden] = next;
        }
      }
    }
    t.spendWeek('convalescence');
  }
  // With 'unchanged' or a bounded recovery a burden can still be at its ceiling:
  // the C1 reducer then allows only REST at home (homeCollapse.recovery per week,
  // no physician fee) until it recovers.
  if (collapseCause(state) !== null) state.pendingConvalescence = 'wipeout';
  checkDeadline(t);
}

// ---------------------------------------------------------------------------
// Public entry points
// ---------------------------------------------------------------------------

/** Applies BEGIN_PILGRIMAGE (from home) or an in-pilgrimage action. */
export function applyPilgrimageAction(
  input: CampaignState,
  action: PilgrimageAction,
  config: RulesConfig,
): ActionResult {
  if (input.phase === 'victory' || input.phase === 'defeat') {
    throw new RuleError('CAMPAIGN_FINISHED', `the campaign has ended (${input.phase})`);
  }
  switch (action.type) {
    case 'BEGIN_PILGRIMAGE':
      return begin(input, action, config);
    case 'CHOOSE_APPROACH':
      return chooseApproach(input, action, config);
    case 'ACCEPT_RESULT':
      return acceptResult(input, action, config);
    case 'CONTINUE_ENCOUNTER':
      return continueEncounter(input, action, config);
    case 'RETREAT':
      return retreat(input, action, config);
    case 'RETURN_HOME':
      return returnHome(input, action, config);
    case 'CONTINUE_SEGMENT':
      return continueSegment(input, action, config);
    case 'USE_CONSUMABLE':
      return useConsumable(input, action, config);
    case 'SKIP_ENCOUNTER':
      return skipEncounter(input, action, config);
    default:
      throw new RuleError('INVALID_ACTION', `not a pilgrimage action: ${JSON.stringify((action as { type?: unknown }).type)}`);
  }
}

/** The home-phase departure descriptor, or null when departure is impossible. */
export function beginPilgrimageDescriptor(state: CampaignState, config: RulesConfig): AvailableAction | null {
  const fee = config.route.departureFee;
  if (state.phase !== 'home' || state.pendingConvalescence !== undefined
    || state.elapsedWeeks >= config.calendar.totalWeeks || state.treasury < fee) return null;
  const carriable = (kind: 'equipment' | 'consumable', max: number): string[] =>
    max < 1 ? [] : Object.keys(state.inventory)
      .filter((id) => (state.inventory[id] ?? 0) > 0 && getItem(id, config).kind === kind)
      .sort();
  return {
    type: 'BEGIN_PILGRIMAGE',
    minCarry: 0,
    maxCarry: state.treasury - fee,
    fee,
    isFinal: isFinalSegment(state.furthestWaystation, config),
    equipmentIds: carriable('equipment', config.items.maxEquipment),
    consumableIds: carriable('consumable', config.items.maxConsumables),
  };
}

/** Legal actions at the current pilgrimage stage ([] outside a pilgrimage). */
export function pilgrimageActions(state: CampaignState, config: RulesConfig): AvailableAction[] {
  const road = state.pilgrimage;
  if (state.phase !== 'pilgrimage' || road === undefined) return [];
  switch (road.stage) {
    case 'encounter_reveal':
      return [];
    case 'choose_approach': {
      const actions: AvailableAction[] = (['bellatores', 'oratores', 'laboratores'] as const)
        .map((estate) => ({ type: 'CHOOSE_APPROACH', estate }));
      const fee = config.astrology.newMoon.skipFee;
      if (skipBlocker(state, config) === null && !road.skipUsed && fee !== null && road.carriedCoin >= fee) {
        actions.push({ type: 'SKIP_ENCOUNTER' });
      }
      return actions;
    }
    case 'reroll_or_accept':
      return [{ type: 'ACCEPT_RESULT' }, ...consumableActions(road, config)];
    case 'continue_or_retreat':
      return [{ type: 'CONTINUE_ENCOUNTER' }, { type: 'RETREAT' }, ...consumableActions(road, config)];
    case 'waystation_decision': {
      const actions: AvailableAction[] = [{ type: 'RETURN_HOME' }, ...consumableActions(road, config)];
      if (state.elapsedWeeks < config.calendar.totalWeeks) {
        actions.push({ type: 'CONTINUE_SEGMENT' });
      }
      return actions;
    }
  }
}

/** USE_CONSUMABLE for the slot consumable when it is unused and usable at this stage. */
function consumableActions(road: PilgrimageState, config: RulesConfig): AvailableAction[] {
  const itemId = road.consumableId;
  if (itemId === undefined || road.consumableUsed || !canUseConsumable(itemId, road.stage, config)) return [];
  return [{ type: 'USE_CONSUMABLE', itemId }];
}
