/**
 * localStorage saves (docs/archive/ui-technical-plan.md §7). Storage is injected so
 * this runs under Node tests with an in-memory map.
 */
import { getAvailableActions, getCalendar, getDerivedStats, hashConfig, previewApproaches, type CampaignState, type RulesConfig } from '../../core/index.js';

import type { ChronicleEntry } from './chronicle.js';

export type SlotId = 'auto' | 'slot1' | 'slot2' | 'slot3';
export const SLOTS: readonly SlotId[] = ['auto', 'slot1', 'slot2', 'slot3'];

export interface SaveFile {
  format: 1;
  /** ISO timestamp. */
  savedAt: string;
  configId: string;
  configHash: string;
  state: CampaignState;
  /** The Chronicle (absent in older saves, which then load with an empty log). */
  log?: ChronicleEntry[];
}

export type SlotInfo =
  | { slot: SlotId; status: 'empty' }
  | { slot: SlotId; status: 'corrupt' }
  | { slot: SlotId; status: 'ok'; save: SaveFile; compatible: boolean };

/** The subset of `Storage` the saves need. */
export type SaveStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export function slotKey(slot: SlotId): string {
  return `hidden-scion:${slot}`;
}

export function writeSave(
  storage: SaveStorage, slot: SlotId, state: CampaignState, config: RulesConfig, now: Date,
  log: readonly ChronicleEntry[] = [],
): SaveFile {
  const save: SaveFile = {
    format: 1,
    savedAt: now.toISOString(),
    configId: config.id,
    configHash: hashConfig(config),
    state,
    log: [...log],
  };
  storage.setItem(slotKey(slot), JSON.stringify(save));
  return save;
}

/** The saved Chronicle, keeping only well-formed entries; anything else reads as an empty log. */
function readLog(value: unknown): ChronicleEntry[] {
  if (!Array.isArray(value)) return [];
  return value.filter((e): e is ChronicleEntry => typeof e === 'object' && e !== null
    && Number.isSafeInteger((e as ChronicleEntry).week) && typeof (e as ChronicleEntry).title === 'string'
    && Array.isArray((e as ChronicleEntry).rows) && Array.isArray((e as ChronicleEntry).notes));
}

function isSaveFile(value: unknown): value is SaveFile {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Partial<SaveFile>;
  return v.format === 1 && typeof v.savedAt === 'string' && typeof v.configHash === 'string'
    && typeof v.state === 'object' && v.state !== null && v.state.version === 1;
}

/** Engine query helpers are not validators: they do not read inventory or RNG, for example. */
function hasPlayableState(state: CampaignState): boolean {
  const record = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);
  const natural = (value: unknown): boolean => Number.isSafeInteger(value) && (value as number) >= 0;
  return ['home', 'pilgrimage', 'victory', 'defeat'].includes(state.phase)
    && typeof state.scionName === 'string' && record(state.playerName)
    && typeof state.playerName.first === 'string' && typeof state.playerName.last === 'string'
    && Number.isSafeInteger(state.seed)
    && [state.elapsedWeeks, state.fatigue, state.melancholy, state.treasury,
      state.furthestWaystation, state.waxingStreak].every(natural)
    && record(state.stats) && ['bellatores', 'oratores', 'laboratores'].every((key) => natural(state.stats[key as keyof typeof state.stats]))
    && record(state.inventory) && Object.values(state.inventory).every(natural)
    && record(state.rng) && ['jobs', 'encounters', 'rewards'].every((key) => {
      const value = state.rng[key as keyof typeof state.rng];
      return natural(value) && value <= 0xffff_ffff;
    });
}

export function readSlot(storage: SaveStorage, slot: SlotId, config: RulesConfig): SlotInfo {
  try {
    const raw = storage.getItem(slotKey(slot));
    if (raw === null) return { slot, status: 'empty' };
    const parsed: unknown = JSON.parse(raw);
    if (!isSaveFile(parsed)) return { slot, status: 'corrupt' };
    const { state } = parsed;
    if (!hasPlayableState(state)) return { slot, status: 'corrupt' };
    if (state.phase === 'pilgrimage') {
      const road = state.pilgrimage;
      if (road === undefined || road === null
        || !['choose_approach', 'reroll_or_accept', 'continue_or_retreat', 'waystation_decision'].includes(road.stage)
        || ![road.segmentIndex, road.encounterIndex, road.segmentEntryWeek, road.carriedCoin,
          road.departureCarriedCoin, road.earnedCoin].every((n) => Number.isSafeInteger(n) && n >= 0)
        || ![road.isFinal, road.skipUsed, road.consumableUsed].every((v) => typeof v === 'boolean')) {
        return { slot, status: 'corrupt' };
      }
      if (road.stage === 'choose_approach' || road.stage === 'reroll_or_accept') previewApproaches(state, config);
    }
    // Each throws on states the engine can't read (bad week, sign, phase).
    getCalendar(state, config);
    getDerivedStats(state, config);
    getAvailableActions(state, config);
    return { slot, status: 'ok', save: { ...parsed, log: readLog(parsed.log) }, compatible: parsed.configHash === hashConfig(config) };
  } catch {
    return { slot, status: 'corrupt' };
  }
}

export function deleteSave(storage: SaveStorage, slot: SlotId): void {
  storage.removeItem(slotKey(slot));
}
