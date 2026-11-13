/**
 * Options for the Tutor / Work / Rest screens: every activity of a kind with
 * its preview and, when disabled, the reason. Enablement comes only from
 * `getAvailableActions`; the preview supplies the numbers.
 */
import {
  getAvailableActions,
  previewHomeActivity,
  type ActivityOutcome,
  type AvailableAction,
  type CampaignState,
  type GameAction,
  type HomePreview,
  type RulesConfig,
} from '../../core/index.js';
import { ESTATES, ESTATE_LABEL, JOBS, RESTS, TUTORS, signed } from '../text/labels.js';

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

/** The non-zero lines of a previewed outcome, e.g. ['Bellatores +5', 'Fatigue +5', 'Coin −20']. */
export function outcomeLines(outcome: ActivityOutcome): string[] {
  const lines = ESTATES.filter((e) => outcome.stats[e] !== 0).map((e) => `${ESTATE_LABEL[e]} ${signed(outcome.stats[e])}`);
  if (outcome.fatigue !== 0) lines.push(`Fatigue ${signed(outcome.fatigue)}`);
  if (outcome.melancholy !== 0) lines.push(`Melancholy ${signed(outcome.melancholy)}`);
  const { min, max } = outcome.coin;
  if (min !== 0 || max !== 0) lines.push(`Coin ${min === max ? signed(min) : `${signed(min)} to ${signed(max)}`}`);
  return lines.length > 0 ? lines : ['No change'];
}
