/**
 * Turns the events of one `applyAction` call into a result panel
 * (docs/ui-technical-plan.md §5.4). Pure; no React.
 */
import type { Estate, GameAction, GameEvent, WeekReason } from '../../core/index.js';
import {
  ACTIVITY_LABEL, BURDEN_SOURCE_LABEL, COIN_SOURCE_LABEL, ESTATE_LABEL, STAT_SOURCE_LABEL, WEEK_REASON_LABEL,
} from '../text/labels.js';

export type Quantity = Estate | 'fatigue' | 'melancholy' | 'treasury' | 'carried';
export type Tone = 'good' | 'bad' | 'neutral';

export interface ResultRow {
  quantity: Quantity;
  label: string;
  /** Net change across all events. */
  amount: number;
  /** Display sources in first-seen order, e.g. ['lesson', 'neglect']. */
  sources: string[];
  /** For Fatigue/Melancholy/Coin, whether a rise is good. */
  tone: Tone;
}

export interface ResultSummary {
  title: string;
  detail?: string;
  tone: Tone;
  rows: ResultRow[];
  weeks: { count: number; reasons: WeekReason[] };
  /** Extra lines such as a collapse or the deadline. */
  notes: string[];
}

const ROW_ORDER: readonly Quantity[] = ['bellatores', 'oratores', 'laboratores', 'fatigue', 'melancholy', 'treasury', 'carried'];

const QUANTITY_LABEL: Record<Quantity, string> = {
  ...ESTATE_LABEL,
  fatigue: 'Fatigue',
  melancholy: 'Melancholy',
  treasury: 'Treasury',
  carried: 'Carried Coin',
};

function rowTone(quantity: Quantity, amount: number): Tone {
  if (amount === 0) return 'neutral';
  const risingIsGood = quantity !== 'fatigue' && quantity !== 'melancholy';
  return (amount > 0) === risingIsGood ? 'good' : 'bad';
}

function collectRows(events: readonly GameEvent[]): ResultRow[] {
  const rows = new Map<Quantity, { amount: number; sources: string[] }>();
  const add = (quantity: Quantity, amount: number, source: string): void => {
    const row = rows.get(quantity) ?? { amount: 0, sources: [] };
    row.amount += amount;
    if (!row.sources.includes(source)) row.sources.push(source);
    rows.set(quantity, row);
  };
  for (const event of events) {
    if (event.type === 'stat_changed') add(event.estate, event.amount, STAT_SOURCE_LABEL[event.source]);
    else if (event.type === 'burden_changed') add(event.burden, event.amount, BURDEN_SOURCE_LABEL[event.source]);
    else if (event.type === 'coin_changed') add(event.account, event.amount, COIN_SOURCE_LABEL[event.source]);
  }
  return ROW_ORDER.flatMap((quantity) => {
    const row = rows.get(quantity);
    if (row === undefined) return [];
    return [{ quantity, label: QUANTITY_LABEL[quantity], amount: row.amount, sources: row.sources,
      tone: rowTone(quantity, row.amount) }];
  });
}

function headline(action: GameAction, events: readonly GameEvent[]): Pick<ResultSummary, 'title' | 'detail' | 'tone'> {
  const job = events.find((e): e is Extract<GameEvent, { type: 'job_resolved' }> => e.type === 'job_resolved');
  if (job !== undefined) {
    const name = ACTIVITY_LABEL[job.job];
    if (job.automatic) return { title: `${name}: done`, detail: 'Guaranteed work, no roll needed.', tone: 'good' };
    const detail = `Rolled ${job.roll ?? '?'} against ${job.probability}%.`;
    return job.success
      ? { title: `${name}: success`, detail, tone: 'good' }
      : { title: `${name}: failure`, detail, tone: 'bad' };
  }
  switch (action.type) {
    case 'TRAIN':
      return { title: `Lessons with ${ACTIVITY_LABEL[action.tutor]}`, tone: 'good' };
    case 'REST':
      if (events.some((e) => e.type === 'week_spent' && e.reason === 'convalescence')) {
        return { title: 'Convalescence', detail: 'A forced week abed to recover.', tone: 'neutral' };
      }
      return { title: ACTIVITY_LABEL[action.rest], tone: 'good' };
    default:
      return { title: 'Done', tone: 'neutral' };
  }
}

/** Builds the result panel for one action. Returns null when there is nothing worth a panel. */
export function summarize(action: GameAction, events: readonly GameEvent[]): ResultSummary | null {
  if (events.length === 0) return null;
  const reasons = events.flatMap((e) => (e.type === 'week_spent' ? [e.reason] : []));
  const notes: string[] = [];
  let { title, detail, tone } = headline(action, events);

  const collapse = events.find((e): e is Extract<GameEvent, { type: 'collapse' }> => e.type === 'collapse');
  if (collapse !== undefined) {
    const cause = collapse.cause === 'both' ? 'Fatigue and Melancholy' : collapse.cause === 'fatigue' ? 'Fatigue' : 'Melancholy';
    notes.push(`She collapsed from ${cause}. Next week is spent recovering.`);
    if (collapse.fee !== undefined) {
      const shortfall = collapse.fee.paid < collapse.fee.nominal ? ` (could only pay ${collapse.fee.paid})` : '';
      notes.push(`The physician charged ${collapse.fee.nominal} Coin${shortfall}.`);
    }
    title = `${title} — collapse!`;
    tone = 'bad';
  }
  if (events.some((e) => e.type === 'deadline')) {
    notes.push('Her sixteenth birthday has come. The Conjunction is upon the realm.');
    tone = 'bad';
  }
  return {
    title,
    ...(detail === undefined ? {} : { detail }),
    tone,
    rows: collectRows(events),
    weeks: { count: reasons.length, reasons },
    notes,
  };
}

/** "2 weeks passed: work, convalescence". */
export function weeksLine(weeks: ResultSummary['weeks']): string {
  if (weeks.count === 0) return 'No time passed.';
  const what = weeks.reasons.map((r) => WEEK_REASON_LABEL[r]).join(', ');
  return weeks.count === 1 ? `1 week passed: ${what}.` : `${weeks.count} weeks passed: ${what}.`;
}
