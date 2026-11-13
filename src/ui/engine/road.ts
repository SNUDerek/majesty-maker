/**
 * Pilgrimage helpers for the Prep / Encounter / Waystation screens. Pure;
 * every number comes from the engine.
 */
import {
  applyAction,
  getAvailableActions,
  getCalendar,
  type AvailableAction,
  type CampaignState,
  type GameAction,
  type LunarPhase,
  type RulesConfig,
} from '../../core/index.js';
import { summarize, type ResultSummary } from './summarize.js';

export type Departure = Extract<AvailableAction, { type: 'BEGIN_PILGRIMAGE' }>;

export interface SegmentInfo {
  segmentIndex: number;
  isFinal: boolean;
  /** "Road to Waystation 3" or "The Final Gauntlet". */
  name: string;
  /** Encounters in the segment. */
  length: number;
  /** Road bonus added to every check in the segment (percentage points). */
  roadBonus: number;
}

export function segmentName(segmentIndex: number, isFinal: boolean): string {
  return isFinal ? 'The Final Gauntlet' : `Road to Waystation ${segmentIndex + 1}`;
}

export function segmentInfo(segmentIndex: number, config: RulesConfig): SegmentInfo {
  const { regularSegments, encountersPerSegment, finalEncounters, roadBonus, finalRoadBonus } = config.route;
  const isFinal = segmentIndex >= regularSegments;
  return {
    segmentIndex,
    isFinal,
    name: segmentName(segmentIndex, isFinal),
    length: isFinal ? finalEncounters : encountersPerSegment,
    roadBonus: isFinal ? finalRoadBonus : roadBonus[segmentIndex] ?? 0,
  };
}

/** The departure descriptor from `getAvailableActions`, or null when she can't leave. */
export function departureOption(state: CampaignState, config: RulesConfig): Departure | null {
  return getAvailableActions(state, config).find((a): a is Departure => a.type === 'BEGIN_PILGRIMAGE') ?? null;
}

/** Why departure is unavailable (for the disabled Pilgrimage button). */
export function departureBlocker(state: CampaignState, config: RulesConfig): string | null {
  if (departureOption(state, config) !== null) return null;
  if (state.elapsedWeeks >= config.calendar.totalWeeks) return 'No weeks remain';
  if (state.pendingConvalescence !== undefined) return 'She must rest first';
  if (state.treasury < config.route.departureFee) {
    return `Departure fee ${config.route.departureFee}, treasury ${state.treasury}`;
  }
  return 'Not available now';
}

/** Builds a concrete BEGIN_PILGRIMAGE, clamping `carry` to the descriptor's range. */
export function departureAction(
  option: Departure, carry: number, equipmentId?: string, consumableId?: string,
): Extract<GameAction, { type: 'BEGIN_PILGRIMAGE' }> {
  const clamped = Math.max(option.minCarry, Math.min(option.maxCarry, Math.round(carry)));
  return {
    type: 'BEGIN_PILGRIMAGE',
    carry: clamped,
    ...(equipmentId !== undefined && option.equipmentIds.includes(equipmentId) ? { equipmentId } : {}),
    ...(consumableId !== undefined && option.consumableIds.includes(consumableId) ? { consumableId } : {}),
  };
}

/** Quick carry amounts: none, a quarter, half, everything. */
export function carryPresets(option: Departure): { label: string; carry: number }[] {
  const { minCarry: lo, maxCarry: hi } = option;
  return [
    { label: 'None', carry: lo },
    { label: '¼', carry: lo + Math.floor((hi - lo) / 4) },
    { label: '½', carry: lo + Math.floor((hi - lo) / 2) },
    { label: 'All', carry: hi },
  ];
}

/** The lunar phase locked when the current segment was entered. */
export function segmentMoon(state: CampaignState, config: RulesConfig): LunarPhase {
  const road = state.pilgrimage;
  if (road === undefined) throw new RangeError('segmentMoon: not on a pilgrimage');
  return getCalendar({ ...state, elapsedWeeks: road.segmentEntryWeek }, config).lunarPhase;
}

/**
 * Dry-runs a leave action. RETREAT and RETURN_HOME draw no RNG, so this
 * reveals nothing; other actions are refused so a roll can never leak.
 */
export function previewLeave(
  state: CampaignState, action: Extract<GameAction, { type: 'RETREAT' | 'RETURN_HOME' }>, config: RulesConfig,
): ResultSummary {
  if (action.type !== 'RETREAT' && action.type !== 'RETURN_HOME') throw new Error('previewLeave: only RETREAT / RETURN_HOME');
  const { events } = applyAction(state, action, config);
  return summarize(action, events)!;
}
