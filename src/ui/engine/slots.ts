/** One-line descriptions of save slots for the Save / Load overlay. Pure. */
import { getCalendar, type RulesConfig, type ZodiacSign } from '../../core/index.js';
import { MONTHS } from '../text/labels.js';
import type { SaveFile, SlotId } from './persistence.js';
import { segmentInfo } from './road.js';

export const SLOT_LABEL: Record<SlotId, string> = {
  auto: 'Autosave',
  slot1: 'Slot 1',
  slot2: 'Slot 2',
  slot3: 'Slot 3',
};

export interface SlotSummary {
  name: string;
  birthSign: ZodiacSign;
  /** "Week 2 of March, 1450". */
  date: string;
  /** "At home", "On the road: Road to Waystation 3, 2/5", "Victory", "Deadline". */
  where: string;
}

export function slotSummary(save: SaveFile, config: RulesConfig): SlotSummary {
  const { state } = save;
  const cal = getCalendar(state, config);
  let where = 'At home';
  if (state.phase === 'victory') where = 'Victory';
  else if (state.phase === 'defeat') where = 'Deadline';
  else if (state.phase === 'pilgrimage' && state.pilgrimage !== undefined) {
    const info = segmentInfo(state.pilgrimage.segmentIndex, config);
    where = state.pilgrimage.stage === 'waystation_decision'
      ? `At Waystation ${state.pilgrimage.segmentIndex + 1}`
      : `On the road: ${info.name}, ${Math.min(state.pilgrimage.encounterIndex + 1, info.length)}/${info.length}`;
  }
  return {
    name: state.scionName,
    birthSign: state.birthSign,
    date: `Week ${cal.weekOfMonth + 1} of ${MONTHS[cal.currentMonth]}, ${cal.displayYear}`,
    where,
  };
}
