/**
 * Derived (never stored) character values (implementation task A2).
 *
 * `getConditionStats` covers the condition part of `DerivedStats`. The full
 * `getDerivedStats` also needs the current solar/lunar aspects and the next
 * critical solar period, which come from the calendar (A1) and astrology (A3)
 * modules; it is composed from this function once those land.
 */

import { fatigueCeiling, melancholyCeiling, purseProtectionPct, type ConditionState } from './conditions.js';
import type { DerivedStats } from './types.js';

export type ConditionStats = Pick<DerivedStats, 'fatigueCeiling' | 'melancholyCeiling' | 'purseProtectionPct'>;

export function getConditionStats(state: Pick<ConditionState, 'stats'>): ConditionStats {
  return {
    fatigueCeiling: fatigueCeiling(state.stats),
    melancholyCeiling: melancholyCeiling(state.stats),
    purseProtectionPct: purseProtectionPct(state.stats),
  };
}
