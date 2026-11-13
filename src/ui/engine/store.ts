/**
 * GameStore (docs/ui-technical-plan.md §5.3): the single owner of the
 * campaign state, consumed by React through `useSyncExternalStore`.
 * Plain TS so it can be driven in Node tests.
 */
import {
  RuleError,
  applyAction,
  createCampaign,
  getAvailableActions,
  type CampaignState,
  type CreateCampaignOptions,
  type GameAction,
  type GameEvent,
  type RulesConfig,
} from '../../core/index.js';
import { sameAction } from './activities.js';
import { SLOTS, deleteSave, readSlot, writeSave, type SaveStorage, type SlotId, type SlotInfo } from './persistence.js';
import type { UiState } from './screen.js';
import { summarize } from './summarize.js';

export interface GameSnapshot {
  readonly state: CampaignState | null;
  readonly ui: UiState;
  readonly lastEvents: readonly GameEvent[];
  readonly error: string | null;
}

const INITIAL_UI: UiState = { menu: 'title', homeView: 'hub' };

/** A BEGIN_PILGRIMAGE descriptor matches any concrete departure; the engine validates the carry. */
function isAvailable(state: CampaignState, action: GameAction, config: RulesConfig): boolean {
  return getAvailableActions(state, config).some((a) =>
    a.type === 'BEGIN_PILGRIMAGE' ? action.type === 'BEGIN_PILGRIMAGE' : sameAction(a, action));
}

export class GameStore {
  readonly config: RulesConfig;
  private readonly storage: SaveStorage | null;
  private readonly now: () => Date;
  private snapshot: GameSnapshot = { state: null, ui: INITIAL_UI, lastEvents: [], error: null };
  private readonly listeners = new Set<() => void>();

  constructor(config: RulesConfig, storage: SaveStorage | null, now: () => Date = () => new Date()) {
    this.config = config;
    this.storage = storage;
    this.now = now;
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = (): GameSnapshot => this.snapshot;

  private set(patch: Partial<GameSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...patch };
    for (const listener of this.listeners) listener();
  }

  private autosave(state: CampaignState): void {
    if (this.storage === null) return;
    try {
      writeSave(this.storage, 'auto', state, this.config, this.now());
    } catch {
      this.set({ error: 'Autosave failed (storage full or blocked).' });
    }
  }

  setUi(patch: Partial<UiState>): void {
    this.set({ ui: { ...this.snapshot.ui, ...patch } });
  }

  dismissResult(): void {
    const { pendingResult: _dismissed, ...ui } = this.snapshot.ui;
    this.set({ ui });
  }

  clearError(): void {
    this.set({ error: null });
  }

  newGame(options: CreateCampaignOptions): void {
    const state = createCampaign(options, this.config);
    const { devSeed } = this.snapshot.ui;
    this.set({ state, ui: { menu: 'game', homeView: 'hub', ...(devSeed === undefined ? {} : { devSeed }) }, lastEvents: [], error: null });
    this.autosave(state);
  }

  /** Loads a slot. Returns false (and sets `error`) when the slot is empty or corrupt. */
  load(slot: SlotId): boolean {
    if (this.storage === null) return false;
    const info = readSlot(this.storage, slot, this.config);
    if (info.status !== 'ok') {
      this.set({ error: info.status === 'empty' ? 'That slot is empty.' : 'That save is corrupt.' });
      return false;
    }
    this.set({ state: info.save.state, ui: { menu: 'game', homeView: 'hub' }, lastEvents: [], error: null });
    return true;
  }

  save(slot: SlotId): void {
    const { state } = this.snapshot;
    if (state === null || this.storage === null) return;
    try {
      writeSave(this.storage, slot, state, this.config, this.now());
      this.set({}); // slot listings changed
    } catch {
      this.set({ error: 'Saving failed (storage full or blocked).' });
    }
  }

  /** Every slot's status, autosave first. Empty when storage is unavailable. */
  slots(): SlotInfo[] {
    const storage = this.storage;
    if (storage === null) return [];
    return SLOTS.map((slot) => readSlot(storage, slot, this.config));
  }

  deleteSlot(slot: SlotId): void {
    if (this.storage === null) return;
    deleteSave(this.storage, slot);
    this.set({});
  }

  closeOverlay(): void {
    const { overlay: _closed, ...ui } = this.snapshot.ui;
    this.set({ ui });
  }

  /** Dev panel only: replaces the state without going through the engine. Clearly not a game action. */
  devReplaceState(state: CampaignState): void {
    this.set({ state, lastEvents: [] });
    this.autosave(state);
  }

  /** Validates against `getAvailableActions`, applies, shows the result and autosaves. */
  dispatch(action: GameAction): void {
    const { state, ui } = this.snapshot;
    if (state === null) return;
    if (ui.pendingResult !== undefined) return; // the player hasn't seen the last result yet
    if (!isAvailable(state, action, this.config)) {
      this.set({ error: 'That action is not available now.' });
      return;
    }
    let result;
    try {
      result = applyAction(state, action, this.config);
    } catch (error) {
      if (error instanceof RuleError) {
        this.set({ error: error.message });
        return;
      }
      throw error;
    }
    const summary = summarize(action, result.events);
    const isHomeActivity = action.type === 'TRAIN' || action.type === 'WORK' || action.type === 'REST'
      || action.type === 'BEGIN_PILGRIMAGE';
    const nextUi: UiState = { ...ui, ...(isHomeActivity ? { homeView: 'hub' as const } : {}) };
    delete nextUi.pendingResult;
    if (summary !== null) nextUi.pendingResult = summary;
    this.set({ state: result.state, ui: nextUi, lastEvents: result.events, error: null });
    this.autosave(result.state);
  }

  /** Back to the title screen; the autosave keeps the campaign. */
  quitToTitle(): void {
    this.set({ state: null, ui: INITIAL_UI, lastEvents: [], error: null });
  }
}
