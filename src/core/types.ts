/** Shared, JSON-compatible contracts for the Hidden Scion rules engine. */
import type { RngStreams } from './rng.js';
export type { RngStreams } from './rng.js';

export type Estate = 'bellatores' | 'oratores' | 'laboratores';

export type Phase = 'home' | 'pilgrimage' | 'victory' | 'defeat';

export type PilgrimageStage =
  | 'encounter_reveal'
  | 'choose_approach'
  | 'reroll_or_accept'
  | 'continue_or_retreat'
  | 'waystation_decision';

export type ZodiacSign =
  | 'aries'
  | 'taurus'
  | 'gemini'
  | 'cancer'
  | 'leo'
  | 'virgo'
  | 'libra'
  | 'scorpio'
  | 'sagittarius'
  | 'capricorn'
  | 'aquarius'
  | 'pisces';

export type ActivityId =
  | 'hedge_knight'
  | 'hermit'
  | 'smuggler'
  | 'stables'
  | 'alehouse'
  | 'village_watch'
  | 'scriptorium'
  | 'rest_home'
  | 'bathhouse'
  | 'shrine'
  | 'banquet';

export type TutorId = 'hedge_knight' | 'hermit' | 'smuggler';
export type JobId = 'stables' | 'alehouse' | 'village_watch' | 'scriptorium';
export type RestId = 'rest_home' | 'bathhouse' | 'shrine' | 'banquet';

export type SolarAspect = 'return' | 'opposition' | 'trine' | 'square' | 'none';
export type LunarPhase = 'new' | 'waxing' | 'full' | 'waning';

export interface PilgrimageState {
  stage: PilgrimageStage;
  segmentIndex: number;
  encounterIndex: number;
  carriedCoin: number;
  departureCarriedCoin: number;
  earnedCoin: number;
  skipUsed: boolean;
  consumableUsed: boolean;
  isFinal: boolean;
  /** Elapsed week at entry; astrology remains locked to this week for the segment. */
  segmentEntryWeek: number;
  equipmentId?: string;
  consumableId?: string;
  currentThreat?: Estate;
  currentApproach?: Estate;
  lastRoll?: number;
  lastProbability?: number;
  pendingFailure?: boolean;
}

export interface CampaignState {
  version: 1;
  seed: number;
  rng: RngStreams;
  playerName: { first: string; last: string };
  scionName: string;
  birthSign: ZodiacSign;
  elapsedWeeks: number;
  stats: Record<Estate, number>;
  fatigue: number;
  melancholy: number;
  treasury: number;
  inventory: Record<string, number>;
  furthestWaystation: number;
  phase: Phase;
  pilgrimage?: PilgrimageState;
  lastWeeklyActivityId?: ActivityId;
  /** Consecutive repeated activities, reserved for an optional compounding Waxing rule. */
  waxingStreak: number;
  pendingConvalescence?: 'home_collapse' | 'wipeout';
  outcome?: 'victory' | 'deadline';
}

export type GameAction =
  | { type: 'TRAIN'; tutor: TutorId }
  | { type: 'WORK'; job: JobId }
  | { type: 'REST'; rest: RestId }
  | {
      type: 'BEGIN_PILGRIMAGE';
      carry: number;
      equipmentId?: string;
      consumableId?: string;
    }
  | { type: 'CHOOSE_APPROACH'; estate: Estate }
  | { type: 'SKIP_ENCOUNTER' }
  | { type: 'USE_CONSUMABLE'; itemId: string }
  | { type: 'ACCEPT_RESULT' }
  | { type: 'CONTINUE_ENCOUNTER' }
  | { type: 'RETREAT' }
  | { type: 'RETURN_HOME' }
  | { type: 'CONTINUE_SEGMENT' };

/**
 * What `getAvailableActions` returns. Identical to `GameAction` except that
 * `BEGIN_PILGRIMAGE` is a descriptor: the caller picks `carry` within
 * `[minCarry, maxCarry]` (and optional item ids) to build the concrete action.
 */
export type AvailableAction =
  | Exclude<GameAction, { type: 'BEGIN_PILGRIMAGE' }>
  | {
      type: 'BEGIN_PILGRIMAGE';
      minCarry: number;
      maxCarry: number;
      /** Departure fee that will be charged in addition to `carry`. */
      fee: number;
      isFinal: boolean;
      equipmentIds: string[];
      consumableIds: string[];
    };

interface EventBase {
  week: number;
}

export type CoinAccount = 'treasury' | 'carried';

/** Why a week elapsed. */
export type WeekReason =
  | 'tutor'
  | 'job'
  | 'rest'
  | 'segment_entry'
  | 'convalescence';

/** Attribution tag for every Coin movement (tech §12: earned/spent/lost by source). */
export type CoinSource =
  | 'job_payout'
  | 'tutor_fee'
  | 'rest_fee'
  | 'departure_fee'
  /** Treasury -> carried transfer at departure (paired treasury/carried events). */
  | 'carry_out'
  | 'encounter_reward'
  | 'laboratores_penalty'
  | 'skip_fee'
  /** Carried -> treasury transfer when banking at home (retreat or waystation return). */
  | 'bank_carried'
  | 'retreat_loot_forfeit'
  | 'retreat_toll'
  | 'wipeout_retained'
  | 'wipeout_lost'
  | 'medical_fee';

export type StatSource = 'tutor' | 'tutor_opposing' | 'job' | 'zodiac' | 'item';

export type BurdenSource =
  | 'tutor'
  | 'job'
  | 'rest'
  | 'convalescence'
  | 'encounter_penalty'
  | 'consumable'
  | 'wipeout_reset';

export type ItemSource =
  | 'starting_inventory'
  | 'reward'
  | 'pilgrimage_slot_out'
  | 'pilgrimage_slot_returned'
  | 'consumed'
  | 'wipeout_lost';

export type GameEvent =
  | (EventBase & { type: 'week_spent'; reason: WeekReason })
  | (EventBase & { type: 'stat_changed'; estate: Estate; amount: number; source: StatSource })
  | (EventBase & {
      type: 'burden_changed';
      burden: 'fatigue' | 'melancholy';
      amount: number;
      source: BurdenSource;
    })
  | (EventBase & {
      type: 'coin_changed';
      account: CoinAccount;
      amount: number;
      source: CoinSource;
    })
  | (EventBase & { type: 'item_changed'; itemId: string; amount: number; source: ItemSource })
  | (EventBase & {
      type: 'job_resolved';
      job: JobId;
      success: boolean;
      probability: number;
      /** Absent when the job resolves without a draw (Stables is automatic). */
      roll?: number;
      automatic: boolean;
    })
  | (EventBase & { type: 'collapse'; cause: 'fatigue' | 'melancholy' | 'both' })
  | (EventBase & { type: 'convalescence'; cause: 'home_collapse' | 'wipeout' })
  | (EventBase & { type: 'pilgrimage_started'; segmentIndex: number; isFinal: boolean })
  | (EventBase & { type: 'encounter_drawn'; threat: Estate; encounterIndex: number })
  | (EventBase & { type: 'encounter_skipped'; encounterIndex: number; source: 'new_moon_bribe' })
  | (EventBase & {
      type: 'encounter_resolved';
      segmentIndex: number;
      isFinal: boolean;
      encounterIndex: number;
      threat: Estate;
      approach: Estate;
      success: boolean;
      probability: number;
      roll: number;
    })
  | (EventBase & { type: 'reroll_used'; itemId: string; roll: number })
  | (EventBase & { type: 'consumable_used'; itemId: string })
  | (EventBase & { type: 'waystation_reached'; waystation: number })
  | (EventBase & { type: 'retreat'; segmentIndex: number })
  | (EventBase & {
      type: 'wipeout';
      /** Use both when both burdens have reached their ceilings. */
      cause: 'fatigue' | 'melancholy' | 'both' | 'coin';
    })
  | (EventBase & { type: 'victory' })
  | (EventBase & { type: 'deadline' });

export type RuleErrorCode =
  | 'INVALID_ACTION'
  | 'INVALID_PHASE'
  | 'INVALID_STAGE'
  | 'INSUFFICIENT_FUNDS'
  | 'INVALID_ITEM'
  | 'ITEM_UNAVAILABLE'
  | 'CONSUMABLE_ALREADY_USED'
  | 'SKIP_ALREADY_USED'
  | 'DEADLINE_REACHED'
  | 'CAMPAIGN_FINISHED';

export class RuleError extends Error {
  readonly code: RuleErrorCode;

  constructor(code: RuleErrorCode, message: string) {
    super(message);
    this.name = 'RuleError';
    this.code = code;
  }
}

export interface ModifierContext {
  activityId: ActivityId;
  kind: 'tutor' | 'job' | 'rest';
  solar: SolarAspect;
  lunar: LunarPhase;
  previousActivityId?: ActivityId;
  /** Prior consecutive repeats; used only by experimental compounding Waxing. */
  waxingStreak?: number;
}

export type ModifierQuantity =
  | 'statGainPct' | 'payoutPct' | 'costPct' | 'fatiguePct'
  | 'melancholyPct' | 'recoveryPct';

/** All multipliers are integer percentages; 100 means x1.0. */
export interface ModifierSet {
  successBonusPts: number;
  statGainPct: number;
  payoutPct: number;
  costPct: number;
  fatiguePct: number;
  melancholyPct: number;
  recoveryPct: number;
  sources: string[];
  /** Exact integer factors for floor-once arithmetic; scalar fields are floored summaries. */
  factors?: Partial<Record<ModifierQuantity, number[]>>;
}

export interface CalendarInfo {
  monthOffset: number;
  weekOfMonth: number;
  currentMonth: number;
  displayYear: number;
  age: number;
  lunarPhase: LunarPhase;
  solarDistance: number;
  weeksRemaining: number;
  isDeadline: boolean;
}

export interface CriticalSolarPeriod {
  aspect: Exclude<SolarAspect, 'trine' | 'none'>;
  startsInWeeks: number;
}

export interface DerivedStats {
  fatigueCeiling: number;
  melancholyCeiling: number;
  purseProtectionPct: number;
  solarAspect: SolarAspect;
  lunarPhase: LunarPhase;
  nextCriticalSolarPeriod?: CriticalSolarPeriod;
}

export interface CreateCampaignOptions {
  seed: number;
  birthSign: ZodiacSign;
  playerName: { first: string; last: string };
  scionName: string;
}

/** Marker contract extended by the concrete RulesConfig in config.ts. */
export interface RulesConfigContract {
  readonly calendar: unknown;
  readonly startingState: unknown;
}

export interface ActionResult {
  state: CampaignState;
  events: GameEvent[];
}

/*
 * Signatures are generic over the concrete config so implementations typed
 * against `RulesConfig` (config.ts) are assignable, e.g.
 * `export const applyAction: ApplyAction<RulesConfig> = ...`.
 */
export type CreateCampaign<C extends RulesConfigContract = RulesConfigContract> = (
  options: CreateCampaignOptions,
  rulesConfig: C,
) => CampaignState;
export type GetAvailableActions<C extends RulesConfigContract = RulesConfigContract> = (
  state: CampaignState,
  rulesConfig: C,
) => AvailableAction[];
export type ApplyAction<C extends RulesConfigContract = RulesConfigContract> = (
  state: CampaignState,
  action: GameAction,
  rulesConfig: C,
) => ActionResult;
export type GetDerivedStats<C extends RulesConfigContract = RulesConfigContract> = (
  state: CampaignState,
  rulesConfig: C,
) => DerivedStats;
/** Takes the config so calendar length, month size and lunar phases follow variants (A1 review). */
export type GetCalendar<C extends RulesConfigContract = RulesConfigContract> = (
  state: CampaignState,
  rulesConfig: C,
) => CalendarInfo;
