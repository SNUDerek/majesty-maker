/**
 * Display text for engine ids (docs/archive/ui-technical-plan.md §5.1). Pure: no
 * React, no assets, so it can be unit-tested and used by `summarize`.
 */
import type {
  ActivityId,
  BurdenSource,
  CoinSource,
  Estate,
  JobId,
  LunarPhase,
  RestId,
  RulesConfig,
  SolarAspect,
  StatSource,
  TutorId,
  WeekReason,
  ZodiacSign,
} from '../../core/index.js';

export const ESTATES: readonly Estate[] = ['bellatores', 'oratores', 'laboratores'];
export const TUTORS: readonly TutorId[] = ['hedge_knight', 'hermit', 'smuggler'];
export const JOBS: readonly JobId[] = ['stables', 'alehouse', 'village_watch', 'scriptorium'];
export const RESTS: readonly RestId[] = ['rest_home', 'bathhouse', 'shrine', 'banquet'];

export const ESTATE_LABEL: Record<Estate, string> = {
  bellatores: 'Bellatores',
  oratores: 'Oratores',
  laboratores: 'Laboratores',
};

/** Short gloss shown beside the Estate name. */
export const ESTATE_GLOSS: Record<Estate, string> = {
  bellatores: 'those who fight',
  oratores: 'those who pray',
  laboratores: 'those who work',
};

export const ACTIVITY_LABEL: Record<ActivityId, string> = {
  hedge_knight: 'The Hedge Knight',
  hermit: 'The Hermit',
  smuggler: 'The Smuggler',
  stables: 'The Stables',
  alehouse: 'The Alehouse',
  village_watch: 'The Village Watch',
  scriptorium: 'The Scriptorium',
  rest_home: 'Rest at Home',
  bathhouse: 'The Bathhouse',
  shrine: 'The Shrine',
  banquet: 'The Banquet',
};

export const ACTIVITY_BLURB: Record<ActivityId, string> = {
  hedge_knight: 'A scarred veteran teaching swordplay in the courtyard.',
  hermit: 'A secluded mystic teaching Latin, astrology and ancient rites.',
  smuggler: 'A pragmatic rogue teaching lockpicking, haggling and stealth.',
  stables: 'Mucking out the stalls. Honest, certain, poorly paid.',
  alehouse: 'Serving drinks and dodging brawls. Tips vary.',
  village_watch: 'Patrolling the woods for poachers. Hard on the body.',
  scriptorium: 'Copying manuscripts for the abbey. Hard on the spirit.',
  rest_home: 'A quiet week by the hearth.',
  bathhouse: 'Hot water and a scrubbing. Eases the body most.',
  shrine: 'A donation and an afternoon of prayer. Eases the spirit most.',
  banquet: 'A lavish feast at the high table. Eases both.',
};

export const SIGNS_IN_SHEET_ORDER: readonly ZodiacSign[] = [
  'aquarius', 'pisces', 'aries', 'taurus',
  'gemini', 'cancer', 'leo', 'virgo',
  'libra', 'scorpio', 'sagittarius', 'capricorn',
];

export const SIGN_LABEL: Record<ZodiacSign, string> = {
  aries: 'Aries', taurus: 'Taurus', gemini: 'Gemini', cancer: 'Cancer', leo: 'Leo', virgo: 'Virgo',
  libra: 'Libra', scorpio: 'Scorpio', sagittarius: 'Sagittarius', capricorn: 'Capricorn',
  aquarius: 'Aquarius', pisces: 'Pisces',
};

/** The sign that begins in each calendar month (0 = January), matching `core/calendar.ts`. */
export const MONTH_SIGN: readonly ZodiacSign[] = [
  'aquarius', 'pisces', 'aries', 'taurus', 'gemini', 'cancer',
  'leo', 'virgo', 'libra', 'scorpio', 'sagittarius', 'capricorn',
];

export const MONTHS: readonly string[] = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export const LUNAR_LABEL: Record<LunarPhase, string> = {
  new: 'New Moon',
  waxing: 'Waxing Moon',
  full: 'Full Moon',
  waning: 'Waning Moon',
};

export const SOLAR_LABEL: Record<SolarAspect, string> = {
  return: 'Solar Return',
  opposition: 'Opposition',
  trine: 'Trine',
  square: 'Square',
  none: '',
};

export const STAT_SOURCE_LABEL: Record<StatSource, string> = {
  tutor: 'lesson',
  tutor_opposing: 'neglect',
  job: 'work',
  zodiac: 'birth sign',
  item: 'item',
};

export const BURDEN_SOURCE_LABEL: Record<BurdenSource, string> = {
  tutor: 'lesson',
  job: 'work',
  rest: 'rest',
  convalescence: 'convalescence',
  encounter_penalty: 'failed encounter',
  consumable: 'remedy',
  wipeout_reset: 'recovery',
};

export const COIN_SOURCE_LABEL: Record<CoinSource, string> = {
  job_payout: 'wages',
  tutor_fee: 'tutor fee',
  rest_fee: 'rest fee',
  departure_fee: 'departure fee',
  carry_out: 'carried out',
  encounter_reward: 'reward',
  laboratores_penalty: 'lost on the road',
  skip_fee: 'bribe',
  bank_carried: 'banked',
  retreat_loot_forfeit: 'loot forfeited',
  retreat_toll: 'retreat toll',
  wipeout_retained: 'purse kept',
  wipeout_lost: 'purse lost',
  medical_fee: 'medical fee',
  physician_fee: 'physician fee',
};

export const WEEK_REASON_LABEL: Record<WeekReason, string> = {
  tutor: 'lessons',
  job: 'work',
  rest: 'rest',
  segment_entry: 'travel',
  convalescence: 'convalescence',
};

/** The daughter's full name: her name and your house, e.g. "Elaine Wyke". */
export function fullName(state: { scionName: string; playerName: { last: string } }): string {
  return [state.scionName, state.playerName.last].map((part) => part.trim()).filter(Boolean).join(' ');
}

/** `120` → `×1.2`. */
export function times(pct: number): string {
  return `×${(pct / 100).toString()}`;
}

/**
 * Plain-English text for a `ModifierSet.sources` entry, using the live config
 * numbers. `activityId` narrows Solar Return to the part that applies.
 */
export function modifierLabel(source: string, config: RulesConfig, activityId?: ActivityId): string {
  const { solar, newMoon, waxing, fullMoon, waning } = config.astrology;
  switch (source) {
    case 'solar:return':
      if (activityId === 'banquet') return `Solar Return: Banquet costs ${times(solar.returnBanquetCostPct)}`;
      if (activityId !== undefined) return `Solar Return: lessons ${times(solar.returnTutorGainPct)} gain`;
      return `Solar Return: lessons ${times(solar.returnTutorGainPct)} gain; Banquet costs ${times(solar.returnBanquetCostPct)}`;
    case 'solar:opposition':
      return `Opposition: work strain ${times(solar.oppositionJobBurdenPct)}`;
    case 'solar:trine':
      return `Trine: +${solar.trineJobSuccessPts}% job success`;
    case 'solar:square':
      return `Square: lessons ${times(solar.squareTutorGainPct)} gain, ${times(solar.squareTutorMelancholyPct)} strain`;
    case 'lunar:new':
      return `New Moon: +${newMoon.activityBonus}% gain and pay`;
    case 'lunar:waxing':
      return `Waxing Moon: repeating last week's activity, ${times(waxing.bonusPct)} gain and pay`;
    case 'lunar:full':
      return `Full Moon: +${fullMoon.surge}% gain and pay`;
    case 'lunar:waning':
      return `Waning Moon: paid rest recovers ${times(waning.paidRestRecoveryPct)}`;
    default:
      return source;
  }
}

/** One line for the Home header about the next critical solar period. */
export function criticalPeriodLabel(
  period: { aspect: 'return' | 'opposition' | 'square'; startsInWeeks: number },
  config: RulesConfig,
): string {
  const { solar } = config.astrology;
  const when = period.startsInWeeks === 1 ? 'next week' : `in ${period.startsInWeeks} weeks`;
  const effect = {
    return: `lessons ${times(solar.returnTutorGainPct)} gain, Banquet ${times(solar.returnBanquetCostPct)} cost`,
    opposition: `work strain ${times(solar.oppositionJobBurdenPct)}`,
    square: `lessons ${times(solar.squareTutorGainPct)} gain, ${times(solar.squareTutorMelancholyPct)} strain`,
  }[period.aspect];
  return `${SOLAR_LABEL[period.aspect]} ${when}: ${effect}`;
}

/** Signed number with a real minus sign: `+3`, `−5`, `0`. */
export function signed(n: number): string {
  if (n > 0) return `+${n}`;
  if (n < 0) return `−${Math.abs(n)}`;
  return '0';
}

// ---------------------------------------------------------------------------
// Pilgrimage
// ---------------------------------------------------------------------------

/** Three flavour lines per threat Estate, rotated by encounter index. */
export const THREAT_FLAVOUR: Record<Estate, readonly string[]> = {
  bellatores: ['Brigands block the road.', 'A robber knight demands a duel.', 'Deserters lie in ambush at the ford.'],
  oratores: ['A suspicious friar bars the abbey gate.', 'A heresy-hunter questions every traveller.', 'Pilgrims whisper of a cursed shrine ahead.'],
  laboratores: ['A toll-keeper wants more than his due.', 'A broken bridge needs mending.', 'A crafty pedlar offers a bargain too good to trust.'],
};

export const MATCHUP_LABEL: Record<'advantage' | 'neutral' | 'disadvantage', string> = {
  advantage: 'Advantage',
  neutral: 'Even',
  disadvantage: 'Disadvantage',
};

/** What the segment's (locked) moon does on the road. */
export function roadMoonLabel(phase: LunarPhase, config: RulesConfig): string {
  const { newMoon, fullMoon } = config.astrology;
  switch (phase) {
    case 'new':
      return newMoon.skipFee === null
        ? `${LUNAR_LABEL.new}: no effect on the road`
        : `${LUNAR_LABEL.new}: may bribe past one encounter for ${newMoon.skipFee} carried Coin`;
    case 'full':
      return `${LUNAR_LABEL.full}: advantage ${times(fullMoon.advantageMultiplierPct)}, failed Bellatores/Oratores strain ${times(fullMoon.pilgrimageBurdenPenaltyPct)}`;
    default:
      return `${LUNAR_LABEL[phase]}: no effect on the road`;
  }
}

/** `{resource:'fatigue', amount:15}` → `+15 Fatigue`; coin → `−7 carried Coin`. */
export function penaltyLabel(penalty: { resource: 'fatigue' | 'melancholy' | 'coin'; amount: number }): string {
  if (penalty.resource === 'coin') return `${signed(-penalty.amount)} carried Coin`;
  return `${signed(penalty.amount)} ${penalty.resource === 'fatigue' ? 'Fatigue' : 'Melancholy'}`;
}

/** Effect text for an item definition from the catalog. */
export function itemEffectLabel(item: { effect: string; amount: number; estate: Estate | null }): string {
  const estate = item.estate === null ? '' : ESTATE_LABEL[item.estate];
  switch (item.effect) {
    case 'reduce_fatigue': return `Removes ${item.amount} Fatigue on the road`;
    case 'reduce_melancholy': return `Removes ${item.amount} Melancholy on the road`;
    case 'reroll_failed_check': return 'Reroll one failed encounter';
    case 'reduce_failure_fatigue': return `Failed ${estate} approaches cost ${item.amount} less Fatigue`;
    case 'success_bonus_vs_threat': return `+${item.amount}% when facing ${estate} threats`;
    case 'coin_penalty_pct': return `Failed ${estate} approaches lose ${item.amount}% of the usual Coin`;
    default: return item.effect;
  }
}
