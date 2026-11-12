/**
 * Derived (never stored) character values (implementation task A2).
 *
 * Solar distance is relative to the birth month, so aspects do not require
 * a zodiac-to-display-month mapping.
 */

import { fatigueCeiling, melancholyCeiling, purseProtectionPct, type ConditionState } from './conditions.js';
import type { RulesConfig } from './config.js';
import type { DerivedStats, GetDerivedStats, SolarAspect } from './types.js';

export type ConditionStats = Pick<DerivedStats, 'fatigueCeiling' | 'melancholyCeiling' | 'purseProtectionPct'>;

export function getConditionStats(state: Pick<ConditionState, 'stats'>): ConditionStats {
  return {
    fatigueCeiling: fatigueCeiling(state.stats),
    melancholyCeiling: melancholyCeiling(state.stats),
    purseProtectionPct: purseProtectionPct(state.stats),
  };
}

function aspectAtWeek(week: number, config: RulesConfig): SolarAspect {
  const distance = Math.floor(week / config.calendar.weeksPerMonth) % config.calendar.monthsPerYear;
  for (const aspect of ['return', 'opposition', 'trine', 'square'] as const) {
    if (config.astrology.solar.distances[aspect].includes(distance)) return aspect;
  }
  return 'none';
}

/**
 * Current aspects use elapsedWeeks. Pilgrimage resolution separately uses
 * segmentEntryWeek for its locked lunar phase. Reminders exclude the active
 * period and periods starting at or after the deadline.
 */
export const getDerivedStats: GetDerivedStats<RulesConfig> = (state, config) => {
  const week = state.elapsedWeeks;
  const lunarPhase = config.astrology.lunarPhaseByWeek[week % config.calendar.weeksPerMonth];
  if (lunarPhase === undefined) throw new RangeError('Calendar week has no configured lunar phase');
  const result: DerivedStats = {
    ...getConditionStats(state),
    solarAspect: aspectAtWeek(week, config),
    lunarPhase,
  };
  for (let next = week + 1; next < config.calendar.totalWeeks; next++) {
    const aspect = aspectAtWeek(next, config);
    if (aspect !== aspectAtWeek(next - 1, config) &&
        (aspect === 'return' || aspect === 'opposition' || aspect === 'square')) {
      result.nextCriticalSolarPeriod = { aspect, startsInWeeks: next - week };
      break;
    }
  }
  return result;
};
