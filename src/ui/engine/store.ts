/**
 * GameStore (docs/archive/ui-technical-plan.md §5.3): the single owner of the
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
import { chronicleEntry, type ChronicleEntry } from './chronicle.js';
import { resultFlavor } from './flavor.js';
import { SLOTS, deleteSave, readSlot, writeSave, type SaveStorage, type SlotId, type SlotInfo } from './persistence.js';
import type { UiState } from './screen.js';
import { actionActivity, beatReward, nextBeat, type Beat } from './story.js';
import { summarize } from './summarize.js';

export interface GameSnapshot {
  readonly state: CampaignState | null;
  readonly ui: UiState;
  readonly lastEvents: readonly GameEvent[];
  readonly error: string | null;
  /** The Chronicle: one entry per applied action, saved with the game. */
  readonly log: readonly ChronicleEntry[];
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
  /** Story beats from content/story (empty in tests that don't load them). */
  readonly beats: readonly Beat[];
  private snapshot: GameSnapshot = { state: null, ui: INITIAL_UI, lastEvents: [], error: null, log: [] };
  private readonly listeners = new Set<() => void>();

  constructor(config: RulesConfig, storage: SaveStorage | null, now: () => Date = () => new Date(), beats: readonly Beat[] = []) {
    this.config = config;
    this.storage = storage;
    this.now = now;
    this.beats = beats;
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
      writeSave(this.storage, 'auto', state, this.config, this.now(), this.snapshot.log);
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
    this.set({ state, ui: { menu: 'game', homeView: 'hub', ...(devSeed === undefined ? {} : { devSeed }) }, lastEvents: [], error: null, log: [] });
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
    this.set({ state: info.save.state, ui: { menu: 'game', homeView: 'hub' }, lastEvents: [], error: null, log: info.save.log ?? [] });
    return true;
  }

  save(slot: SlotId): void {
    const { state } = this.snapshot;
    if (state === null || this.storage === null) return;
    try {
      writeSave(this.storage, slot, state, this.config, this.now(), this.snapshot.log);
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
    try {
      deleteSave(this.storage, slot);
      this.set({});
    } catch {
      this.set({ error: 'Deleting failed (storage blocked).' });
    }
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
    // The player hasn't seen the last result (or scene) yet.
    if (ui.pendingResult !== undefined || ui.pendingDialog !== undefined || ui.overlay !== undefined) return;
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
    const summary = summarize(action, result.events, result.state);
    const isHomeActivity = action.type === 'TRAIN' || action.type === 'WORK' || action.type === 'REST'
      || action.type === 'BEGIN_PILGRIMAGE';
    const nextUi: UiState = { ...ui, ...(isHomeActivity ? { homeView: 'hub' as const } : {}) };
    delete nextUi.pendingResult;
    if (summary !== null) {
      const flavor = resultFlavor(state, action, result.events);
      nextUi.pendingResult = flavor === undefined ? summary : { ...summary, flavor };
    }
    const beat = this.beatAfter(state, action, result.state, result.events);
    if (beat !== undefined) nextUi.pendingDialog = { beatId: beat.id, activity: actionActivity(action)! };
    const entry = chronicleEntry(state, action, result.events, result.state, this.config);
    this.set({ state: result.state, ui: nextUi, lastEvents: result.events, error: null, log: [...this.snapshot.log, entry] });
    this.autosave(result.state);
  }

  /**
   * The beat triggered by a home activity (§6.3), skipped after the forced
   * recovery rest, a collapse, or when the campaign has left the home phase.
   */
  private beatAfter(before: CampaignState, action: GameAction, after: CampaignState, events: readonly GameEvent[]): Beat | undefined {
    const activity = actionActivity(action);
    if (activity === undefined || before.pendingConvalescence !== undefined || after.phase !== 'home'
      || events.some((e) => e.type === 'collapse')) return undefined;
    return nextBeat(this.beats, after, activity, this.config);
  }

  /** The father–daughter talk the "Talk with her" button would start, if any (§6.4). */
  socialBeat(): Beat | undefined {
    const { state } = this.snapshot;
    if (state === null || state.phase !== 'home' || state.pendingConvalescence !== undefined) return undefined;
    return nextBeat(this.beats, state, 'socialize', this.config);
  }

  /** Opens the "Talk with her" talk. Free: it spends no week and shows no result panel. */
  startTalk(): void {
    const { ui } = this.snapshot;
    const beat = this.socialBeat();
    if (beat === undefined || ui.pendingResult !== undefined || ui.pendingDialog !== undefined || ui.overlay !== undefined) return;
    this.setUi({ pendingDialog: { beatId: beat.id, activity: 'socialize' } });
  }

  beat(id: string): Beat | undefined {
    return this.beats.find((b) => b.id === id);
  }

  /**
   * Called when the dialog scene ends: records the beat and grants its reward
   * through the engine (STORY_BEAT), then lets the waiting result panel show.
   */
  finishBeat(): void {
    const { state, ui } = this.snapshot;
    const { pendingDialog, ...rest } = ui;
    if (state === null || pendingDialog === undefined) return;
    const beat = this.beat(pendingDialog.beatId);
    if (beat === undefined) {
      this.set({ ui: rest });
      return;
    }
    const reward = beatReward(beat);
    const action: GameAction = { type: 'STORY_BEAT', beatId: beat.id, ...(reward === undefined ? {} : { reward }) };
    let result;
    try {
      result = applyAction(state, action, this.config);
    } catch (error) {
      if (error instanceof RuleError) {
        this.set({ ui: rest, error: error.message });
        return;
      }
      throw error;
    }
    const entry = { ...chronicleEntry(state, action, result.events, result.state, this.config), title: `A story: ${beat.title}` };
    this.set({ state: result.state, ui: rest, lastEvents: result.events, error: null, log: [...this.snapshot.log, entry] });
    this.autosave(result.state);
  }

  /** Back to the title screen; the autosave keeps the campaign. */
  quitToTitle(): void {
    this.set({ state: null, ui: INITIAL_UI, lastEvents: [], error: null, log: [] });
  }
}
