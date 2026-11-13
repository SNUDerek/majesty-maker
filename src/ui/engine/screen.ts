/**
 * Screen routing (docs/ui-technical-plan.md §5.2): the screen is a pure
 * function of the engine state plus a little unsaved UI state.
 */
import type { CampaignState } from '../../core/index.js';
import type { ResultSummary } from './summarize.js';

export type HomeView = 'hub' | 'tutor' | 'job' | 'rest' | 'prep';
export type Menu = 'title' | 'game';

export interface UiState {
  menu: Menu;
  homeView: HomeView;
  /** Shown over the current scene until dismissed. */
  pendingResult?: ResultSummary;
}

export type Screen =
  | { kind: 'title' }
  | { kind: 'home'; view: HomeView; convalescence: boolean }
  | { kind: 'encounter' }
  | { kind: 'waystation' }
  | { kind: 'outcome'; outcome: 'victory' | 'deadline' };

/**
 * First match wins. `pendingResult` is drawn over whichever scene this
 * returns, so it isn't a screen of its own.
 */
export function deriveScreen(state: CampaignState | null, ui: UiState): Screen {
  if (ui.menu !== 'game' || state === null) return { kind: 'title' };
  if (state.phase === 'victory') return { kind: 'outcome', outcome: 'victory' };
  if (state.phase === 'defeat') return { kind: 'outcome', outcome: 'deadline' };
  if (state.phase === 'pilgrimage') {
    return state.pilgrimage?.stage === 'waystation_decision' ? { kind: 'waystation' } : { kind: 'encounter' };
  }
  if (state.pendingConvalescence !== undefined) return { kind: 'home', view: 'hub', convalescence: true };
  return { kind: 'home', view: ui.homeView, convalescence: false };
}
