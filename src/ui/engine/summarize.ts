/**
 * Turns the events of one `applyAction` call into a result panel
 * (docs/archive/ui-technical-plan.md §5.4). Pure; no React.
 */
import type { CampaignState, Estate, GameAction, GameEvent, WeekReason } from '../../core/index.js';
import {
  ACTIVITY_LABEL, signed, BURDEN_SOURCE_LABEL, COIN_SOURCE_LABEL, ESTATE_LABEL, STAT_SOURCE_LABEL, WEEK_REASON_LABEL,
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
  /** Net amount per source, in the same order (useful when a row mixes sources). */
  parts: { source: string; amount: number }[];
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

export const QUANTITY_LABEL: Record<Quantity, string> = {
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

/** Net change per quantity across the events, with sources (also used by the Chronicle). */
export function collectRows(events: readonly GameEvent[]): ResultRow[] {
  const rows = new Map<Quantity, { amount: number; parts: Map<string, number> }>();
  const add = (quantity: Quantity, amount: number, source: string): void => {
    const row = rows.get(quantity) ?? { amount: 0, parts: new Map<string, number>() };
    row.amount += amount;
    row.parts.set(source, (row.parts.get(source) ?? 0) + amount);
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
    const parts = [...row.parts].map(([source, amount]) => ({ source, amount }));
    return [{ quantity, label: QUANTITY_LABEL[quantity], amount: row.amount, sources: parts.map((p) => p.source),
      parts, tone: rowTone(quantity, row.amount) }];
  });
}

function lastOf<T extends GameEvent['type']>(events: readonly GameEvent[], type: T): Extract<GameEvent, { type: T }> | undefined {
  for (let i = events.length - 1; i >= 0; i--) {
    const event = events[i]!;
    if (event.type === type) return event as Extract<GameEvent, { type: T }>;
  }
  return undefined;
}

type Headline = Pick<ResultSummary, 'title' | 'detail' | 'tone'>;

const WIPEOUT_DETAIL = {
  coin: 'She could not pay what the road demanded.',
  fatigue: 'Exhausted, she collapsed on the road.',
  melancholy: 'Despairing, she collapsed on the road.',
  both: 'Body and spirit gave out on the road.',
} as const;

/** Headline for pilgrimage results, or null when the action isn't a road event. */
function roadHeadline(action: GameAction, events: readonly GameEvent[]): Headline | null {
  const find = <T extends GameEvent['type']>(type: T) => lastOf(events, type);
  const resolved = find('encounter_resolved');
  const reroll = find('reroll_used');
  const roll = resolved === undefined ? undefined
    : `${reroll === undefined ? 'Rolled' : 'Metheglin reroll: rolled'} ${resolved.roll} against ${resolved.probability}%.`;
  if (find('victory') !== undefined) return { title: 'Victory!', detail: 'The Final Gauntlet is won.', tone: 'good' };
  const wipeout = find('wipeout');
  if (wipeout !== undefined) {
    return { title: 'Wipeout', detail: [roll, WIPEOUT_DETAIL[wipeout.cause]].filter(Boolean).join(' '), tone: 'bad' };
  }
  const waystation = find('waystation_reached');
  const reached = waystation === undefined ? '' : ` — Waystation ${waystation.waystation} reached`;
  if (find('encounter_skipped') !== undefined) {
    return { title: `Slipped past under the New Moon${reached}`, tone: 'good' };
  }
  if (resolved !== undefined) {
    return resolved.success
      ? { title: `Encounter won${reached}`, ...(roll === undefined ? {} : { detail: roll }), tone: 'good' }
      : { title: `Encounter lost${reached}`, ...(roll === undefined ? {} : { detail: roll }), tone: 'bad' };
  }
  switch (action.type) {
    case 'ACCEPT_RESULT': return { title: `Failure accepted${reached}`, tone: 'bad' };
    case 'RETREAT': return { title: 'Retreat', detail: 'She turns for home.', tone: 'neutral' };
    case 'RETURN_HOME': return { title: 'Home from the road', detail: 'The waystation is secured; she returns home.', tone: 'good' };
    default: return null;
  }
}

/** Actions that only reveal the next threat (or use a remedy in place): no result panel. */
function isSilent(action: GameAction, events: readonly GameEvent[]): boolean {
  switch (action.type) {
    case 'BEGIN_PILGRIMAGE':
    case 'CONTINUE_ENCOUNTER':
    case 'CONTINUE_SEGMENT':
      return true;
    case 'USE_CONSUMABLE':
      return !events.some((e) => e.type === 'reroll_used');
    default:
      return false;
  }
}

function headline(action: GameAction, events: readonly GameEvent[]): Headline {
  const road = roadHeadline(action, events);
  if (road !== null) return road;
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
export function summarize(action: GameAction, events: readonly GameEvent[], after?: CampaignState): ResultSummary | null {
  if (events.length === 0 || isSilent(action, events)) return null;
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
  if (action.type === 'CHOOSE_APPROACH' && after?.pilgrimage?.stage === 'reroll_or_accept') {
    // Metheglin in the slot: the failure is pending until rerolled or accepted.
    notes.push('The failure is not yet charged: drink Metheglin to reroll, or accept it.');
  }
  const waystation = events.find((e) => e.type === 'waystation_reached');
  if (waystation?.type === 'waystation_reached') notes.push(`Waystation ${waystation.waystation} is secured: future pilgrimages start beyond it.`);
  if (events.some((e) => e.type === 'convalescence' && e.cause === 'wipeout')) notes.push('She was carried home to convalesce.');
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

/** "lesson" for one source; "loot forfeited −1 · retreat toll −10" for several. */
export function sourcesLine(row: ResultRow): string {
  if (row.parts.length <= 1) return row.sources.join(', ');
  return row.parts.map((p) => `${p.source} ${signed(p.amount)}`).join(' · ');
}

/** "2 weeks passed: work, convalescence". */
export function weeksLine(weeks: ResultSummary['weeks']): string {
  if (weeks.count === 0) return 'No time passed.';
  const what = weeks.reasons.map((r) => WEEK_REASON_LABEL[r]).join(', ');
  return weeks.count === 1 ? `1 week passed: ${what}.` : `${weeks.count} weeks passed: ${what}.`;
}
