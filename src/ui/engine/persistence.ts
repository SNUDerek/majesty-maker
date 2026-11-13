/**
 * localStorage saves (docs/ui-technical-plan.md §7). Storage is injected so
 * this runs under Node tests with an in-memory map.
 */
import { getAvailableActions, getCalendar, getDerivedStats, hashConfig, type CampaignState, type RulesConfig } from '../../core/index.js';

export type SlotId = 'auto' | 'slot1' | 'slot2' | 'slot3';
export const SLOTS: readonly SlotId[] = ['auto', 'slot1', 'slot2', 'slot3'];

export interface SaveFile {
  format: 1;
  /** ISO timestamp. */
  savedAt: string;
  configId: string;
  configHash: string;
  state: CampaignState;
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

export function writeSave(storage: SaveStorage, slot: SlotId, state: CampaignState, config: RulesConfig, now: Date): SaveFile {
  const save: SaveFile = {
    format: 1,
    savedAt: now.toISOString(),
    configId: config.id,
    configHash: hashConfig(config),
    state,
  };
  storage.setItem(slotKey(slot), JSON.stringify(save));
  return save;
}

function isSaveFile(value: unknown): value is SaveFile {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Partial<SaveFile>;
  return v.format === 1 && typeof v.savedAt === 'string' && typeof v.configHash === 'string'
    && typeof v.state === 'object' && v.state !== null && v.state.version === 1;
}

export function readSlot(storage: SaveStorage, slot: SlotId, config: RulesConfig): SlotInfo {
  const raw = storage.getItem(slotKey(slot));
  if (raw === null) return { slot, status: 'empty' };
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isSaveFile(parsed)) return { slot, status: 'corrupt' };
    const { state } = parsed;
    if (state.phase === 'pilgrimage' && state.pilgrimage === undefined) return { slot, status: 'corrupt' };
    // Each throws on states the engine can't read (bad week, sign, phase).
    getCalendar(state, config);
    getDerivedStats(state, config);
    getAvailableActions(state, config);
    return { slot, status: 'ok', save: parsed, compatible: parsed.configHash === hashConfig(config) };
  } catch {
    return { slot, status: 'corrupt' };
  }
}

export function deleteSave(storage: SaveStorage, slot: SlotId): void {
  storage.removeItem(slotKey(slot));
}
