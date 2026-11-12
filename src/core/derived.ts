/**
 * Derived (never stored) character values (implementation task A2).
 *
 * Solar distance is relative to the birth month, so aspects do not require
 * a zodiac-to-display-month mapping.
 */

import { fatigueCeiling, melancholyCeiling, purseProtectionPct, type ConditionState } from './conditions.js';
import type { RulesConfig } from './config.js';
import { getCalendar } from './calendar.js';
import { solarAspect, upcomingCriticalPeriods } from './astrology.js';
import type { DerivedStats, GetDerivedStats } from './types.js';

export type ConditionStats = Pick<DerivedStats, 'fatigueCeiling' | 'melancholyCeiling' | 'purseProtectionPct'>;

export function getConditionStats(state: Pick<ConditionState, 'stats'>): ConditionStats {
  return {
    fatigueCeiling: fatigueCeiling(state.stats),
    melancholyCeiling: melancholyCeiling(state.stats),
    purseProtectionPct: purseProtectionPct(state.stats),
  };
}

/**
 * Current aspects use elapsedWeeks. Pilgrimage resolution separately uses
 * segmentEntryWeek for its locked lunar phase. Reminders exclude the active
 * period and periods starting at or after the deadline.
 */
export const getDerivedStats: GetDerivedStats<RulesConfig> = (state, config) => {
  const calendar = getCalendar(state, config);
  const result: DerivedStats = {
    ...getConditionStats(state),
    solarAspect: solarAspect(calendar.solarDistance, config),
    lunarPhase: calendar.lunarPhase,
  };
  const next = upcomingCriticalPeriods(state, calendar.weeksRemaining, config)[0];
  if (next) result.nextCriticalSolarPeriod = next;
  return result;
};
