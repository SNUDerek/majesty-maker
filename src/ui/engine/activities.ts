/**
 * Options for the Tutor / Work / Rest screens: every activity of a kind with
 * its preview and, when disabled, the reason. Enablement comes only from
 * `getAvailableActions`; the preview supplies the numbers.
 */
import {
  getAvailableActions,
  previewHomeActivity,
  type AvailableAction,
  type CampaignState,
  type GameAction,
  type HomePreview,
  type RulesConfig,
} from '../../core/index.js';
import { JOBS, RESTS, TUTORS } from '../text/labels.js';

export type ActivityKind = 'tutor' | 'job' | 'rest';
export type HomeAction = Extract<GameAction, { type: 'TRAIN' | 'WORK' | 'REST' }>;

export interface ActivityOption {
  action: HomeAction;
  preview: HomePreview;
  enabled: boolean;
  /** Why the option is disabled; absent when enabled. */
  reason?: string;
}

export function homeActions(kind: ActivityKind): HomeAction[] {
  switch (kind) {
    case 'tutor': return TUTORS.map((tutor) => ({ type: 'TRAIN', tutor }));
    case 'job': return JOBS.map((job) => ({ type: 'WORK', job }));
    case 'rest': return RESTS.map((rest) => ({ type: 'REST', rest }));
  }
}

export function sameAction(a: AvailableAction | GameAction, b: GameAction): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function activityOptions(state: CampaignState, kind: ActivityKind, config: RulesConfig): ActivityOption[] {
  const available = getAvailableActions(state, config);
  const deadline = state.elapsedWeeks >= config.calendar.totalWeeks;
  return homeActions(kind).map((action) => {
    const preview = previewHomeActivity(state, action, config);
    if (available.some((a) => sameAction(a, action))) return { action, preview, enabled: true };
    let reason = 'Not available this week';
    if (deadline) reason = 'No weeks remain';
    else if (state.pendingConvalescence !== undefined) reason = 'She must rest at home this week';
    else if (!preview.affordable) reason = `Costs ${preview.cost}, treasury ${state.treasury}`;
    return { action, preview, enabled: false, reason };
  });
}
