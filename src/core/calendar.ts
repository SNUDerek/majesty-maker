import type { CalendarInfo, LunarPhase, CampaignState, ZodiacSign } from './types.js';

const WEEKS_PER_MONTH = 4;
const MONTHS_PER_YEAR = 12;
const TOTAL_WEEKS = 96;
const START_YEAR = 1450;
const START_AGE = 14;

/**
 * Western zodiac signs mapped to the month in which each sign begins.
 * Month numbers follow JavaScript's convention: January is 0 and December is 11.
 * In particular, Aries begins in March (2), rather than being treated as month 0.
 */
export const signToBirthMonth: Readonly<Record<ZodiacSign, number>> = {
  aries: 2,
  taurus: 3,
  gemini: 4,
  cancer: 5,
  leo: 6,
  virgo: 7,
  libra: 8,
  scorpio: 9,
  sagittarius: 10,
  capricorn: 11,
  aquarius: 0,
  pisces: 1,
};

const LUNAR_PHASES: readonly LunarPhase[] = ['new', 'waxing', 'full', 'waning'];

/** Returns calendar and astrology coordinates for the state's elapsed week. */
export function getCalendar(state: CampaignState): CalendarInfo {
  if (!Number.isSafeInteger(state.elapsedWeeks) || state.elapsedWeeks < 0) {
    throw new RangeError(
      `getCalendar: elapsedWeeks must be a non-negative safe integer, got ${state.elapsedWeeks}`,
    );
  }

  const monthOffset = Math.floor(state.elapsedWeeks / WEEKS_PER_MONTH);
  const weekOfMonth = state.elapsedWeeks % WEEKS_PER_MONTH;
  const birthMonth = signToBirthMonth[state.birthSign];
  const absoluteMonth = birthMonth + monthOffset;

  return {
    monthOffset,
    weekOfMonth,
    currentMonth: absoluteMonth % MONTHS_PER_YEAR,
    // The civil year rolls over at January, independently of the birthday.
    displayYear: START_YEAR + Math.floor(absoluteMonth / MONTHS_PER_YEAR),
    // Age changes only when a full twelve months have elapsed from the birth month.
    age: START_AGE + Math.floor(monthOffset / MONTHS_PER_YEAR),
    lunarPhase: LUNAR_PHASES[weekOfMonth] as LunarPhase,
    solarDistance: monthOffset % MONTHS_PER_YEAR,
    weeksRemaining: Math.max(0, TOTAL_WEEKS - state.elapsedWeeks),
    isDeadline: state.elapsedWeeks >= TOTAL_WEEKS,
  };
}
