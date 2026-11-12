import type { RulesConfig } from './config.js';
import type { GetCalendar, ZodiacSign } from './types.js';

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

/**
 * Returns calendar and astrology coordinates for the state's elapsed week.
 * Lengths, start year/age and lunar phases come from `config`, so calendar
 * variants (e.g. a 48-week campaign) apply here too.
 */
export const getCalendar: GetCalendar<RulesConfig> = (state, config) => {
  const { totalWeeks, weeksPerMonth, monthsPerYear, startYear, startAge, deadlineAge } = config.calendar;
  const week = state.elapsedWeeks;

  if (!Number.isSafeInteger(week) || week < 0 || week > totalWeeks) {
    throw new RangeError(`getCalendar: elapsedWeeks must be an integer in [0, ${totalWeeks}], got ${week}`);
  }
  if (!Object.hasOwn(signToBirthMonth, state.birthSign)) {
    throw new RangeError(`getCalendar: unknown birth sign ${JSON.stringify(state.birthSign)}`);
  }

  const monthOffset = Math.floor(week / weeksPerMonth);
  const weekOfMonth = week % weeksPerMonth;
  const absoluteMonth = signToBirthMonth[state.birthSign] + monthOffset;
  const lunarPhase = config.astrology.lunarPhaseByWeek[weekOfMonth];
  if (lunarPhase === undefined) {
    throw new RangeError(`getCalendar: no lunar phase configured for week ${weekOfMonth} of the month`);
  }
  const isDeadline = week >= totalWeeks;

  return {
    monthOffset,
    weekOfMonth,
    currentMonth: absoluteMonth % monthsPerYear,
    // The civil year rolls over at January, independently of the birthday.
    displayYear: startYear + Math.floor(absoluteMonth / monthsPerYear),
    // Age changes only when a full year has elapsed from the birth month. The
    // deadline is the deadline birthday, even in a shortened campaign variant.
    age: isDeadline ? deadlineAge : startAge + Math.floor(monthOffset / monthsPerYear),
    lunarPhase,
    solarDistance: monthOffset % monthsPerYear,
    weeksRemaining: totalWeeks - week,
    isDeadline,
  };
};
