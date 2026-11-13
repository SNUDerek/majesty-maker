/**
 * Options for the Tutor / Work / Rest screens: every activity of a kind with
 * its preview and, when disabled, the reason. Enablement comes only from
 * `getAvailableActions`; the preview supplies the numbers.
 */
import {
  getAvailableActions,
  getDerivedStats,
  previewHomeActivity,
  type ActivityOutcome,
  type AvailableAction,
  type CampaignState,
  type Estate,
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

/** One fact of a previewed outcome, for colour-coded display. */
export type OutcomePart =
  | { kind: 'estate'; estate: Estate; amount: number }
  | { kind: 'condition'; condition: 'fatigue' | 'melancholy'; amount: number }
  | { kind: 'coin'; min: number; max: number };

/** Non-zero facts in display order: Estates, then conditions, then Coin. */
export function outcomeParts(outcome: ActivityOutcome): OutcomePart[] {
  const parts: OutcomePart[] = ESTATES.filter((e) => outcome.stats[e] !== 0)
    .map((estate) => ({ kind: 'estate', estate, amount: outcome.stats[estate] }));
  for (const condition of ['fatigue', 'melancholy'] as const) {
    if (outcome[condition] !== 0) parts.push({ kind: 'condition', condition, amount: outcome[condition] });
  }
  const { min, max } = outcome.coin;
  if (min !== 0 || max !== 0) parts.push({ kind: 'coin', min, max });
  return parts;
}

/** Plain text for one part: 'Bellatores +5', 'Fatigue +5', 'Coin +11 to +20'. */
export function partText(part: OutcomePart): string {
  switch (part.kind) {
    case 'estate': return `${ESTATE_LABEL[part.estate]} ${signed(part.amount)}`;
    case 'condition': return `${part.condition === 'fatigue' ? 'Fatigue' : 'Melancholy'} ${signed(part.amount)}`;
    case 'coin': return `Coin ${part.min === part.max ? signed(part.min) : `${signed(part.min)} to ${signed(part.max)}`}`;
  }
}

/** The non-zero lines of a previewed outcome, e.g. ['Bellatores +5', 'Fatigue +5', 'Coin −20']. */
export function outcomeLines(outcome: ActivityOutcome): string[] {
  const lines = outcomeParts(outcome).map(partText);
  return lines.length > 0 ? lines : ['No change'];
}

/** Project each branch against its own post-activity ceilings, then show the greater risk. */
export function projectedConditions(state: CampaignState, preview: HomePreview, config: RulesConfig) {
  const branches = [preview.success, ...(preview.failure === undefined ? [] : [preview.failure])].map((outcome) => {
    const stats = { ...state.stats };
    for (const estate of ESTATES) stats[estate] += outcome.stats[estate];
    const derived = getDerivedStats({ ...state, stats }, config);
    return {
      fatigue: { value: state.fatigue + outcome.fatigue, ceiling: derived.fatigueCeiling },
      melancholy: { value: state.melancholy + outcome.melancholy, ceiling: derived.melancholyCeiling },
    };
  });
  const riskiest = (kind: 'fatigue' | 'melancholy') => branches.map((branch) => branch[kind])
    .reduce((a, b) => b.value / b.ceiling > a.value / a.ceiling ? b : a);
  return { fatigue: riskiest('fatigue'), melancholy: riskiest('melancholy') };
}
