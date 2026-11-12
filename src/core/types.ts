/** Shared, JSON-compatible contracts for the Hidden Scion rules engine. */

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

export interface RngStreams {
  jobs: number;
  encounters: number;
  rewards: number;
}

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

interface EventBase {
  week: number;
}

export type CoinAccount = 'treasury' | 'carried';

export type GameEvent =
  | (EventBase & { type: 'week_spent'; reason: string })
  | (EventBase & { type: 'stat_changed'; estate: Estate; amount: number; source: string })
  | (EventBase & {
      type: 'burden_changed';
      burden: 'fatigue' | 'melancholy';
      amount: number;
      source: string;
    })
  | (EventBase & {
      type: 'coin_changed';
      account: CoinAccount;
      amount: number;
      source: string;
    })
  | (EventBase & {
      type: 'job_resolved';
      job: JobId;
      success: boolean;
      probability: number;
      roll: number;
    })
  | (EventBase & { type: 'collapse'; cause: 'fatigue' | 'melancholy' })
  | (EventBase & { type: 'convalescence'; cause: 'home_collapse' | 'wipeout' })
  | (EventBase & { type: 'pilgrimage_started'; segmentIndex: number; isFinal: boolean })
  | (EventBase & { type: 'encounter_drawn'; threat: Estate; encounterIndex: number })
  | (EventBase & { type: 'encounter_skipped'; encounterIndex: number; source: string })
  | (EventBase & {
      type: 'encounter_resolved';
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
      cause: 'fatigue' | 'melancholy' | 'insufficient_carried_coin';
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
}

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

export type CreateCampaign = (
  options: CreateCampaignOptions,
  rulesConfig: RulesConfigContract,
) => CampaignState;
export type GetAvailableActions = (
  state: CampaignState,
  rulesConfig: RulesConfigContract,
) => GameAction[];
export type ApplyAction = (
  state: CampaignState,
  action: GameAction,
  rulesConfig: RulesConfigContract,
) => ActionResult;
export type GetDerivedStats = (
  state: CampaignState,
  rulesConfig: RulesConfigContract,
) => DerivedStats;
export type GetCalendar = (state: CampaignState) => CalendarInfo;

/**
 * Multiply integer percentage modifiers and floor once at the end.
 * Callers should pass each applicable percentage separately.
 */
export function applyIntegerPercent(base: number, ...percentages: number[]): number {
  const numerator = percentages.reduce((value, percentage) => value * percentage, base);
  return Math.floor(numerator / 100 ** percentages.length);
}
