/**
 * The Chronicle: one entry per action, kept with the save so the player can
 * look back over past weeks (docs/archive/ui-playtest-plan.md §4). Pure; the UI layer
 * owns it, the engine keeps no history.
 */
import type { CampaignState, Estate, GameAction, GameEvent, RulesConfig } from '../../core/index.js';
import { ESTATE_LABEL, threatLabel } from '../text/labels.js';
import { segmentInfo } from './road.js';
import { collectRows, summarize, type Quantity } from './summarize.js';

export interface ChronicleEntry {
  /** elapsedWeeks before the action. */
  week: number;
  action: GameAction;
  /** "The Alehouse: failure", "Set out for Road to Waystation 2", "A Bellatores threat". */
  title: string;
  /** "Rolled 72 against 50%." */
  detail?: string;
  /** Net changes, in display order. */
  rows: { quantity: Quantity; amount: number }[];
  notes: string[];
}

function itemName(id: string, config: RulesConfig): string {
  return config.items.catalog[id]?.name ?? id;
}

function threatLine(events: readonly GameEvent[]): string | undefined {
  const drawn = events.find((e): e is Extract<GameEvent, { type: 'encounter_drawn' }> => e.type === 'encounter_drawn');
  return drawn === undefined ? undefined : threatLabel(drawn.threat);
}

/** Title and detail for actions that show no result panel. */
function silentHeadline(before: CampaignState, action: GameAction, events: readonly GameEvent[], config: RulesConfig) {
  const threat = threatLine(events);
  switch (action.type) {
    case 'BEGIN_PILGRIMAGE': {
      const info = segmentInfo(before.furthestWaystation, config);
      const items = [action.equipmentId, action.consumableId].filter((id): id is string => id !== undefined)
        .map((id) => itemName(id, config));
      const detail = `Carrying ${action.carry} Coin${items.length > 0 ? ` and ${items.join(', ')}` : ''}.`;
      return { title: `Set out on ${info.name}`, detail: threat === undefined ? detail : `${detail} ${threat}.` };
    }
    case 'CONTINUE_SEGMENT': {
      const info = segmentInfo((before.pilgrimage?.segmentIndex ?? 0) + 1, config);
      return { title: `Pressed on to ${info.name}`, ...(threat === undefined ? {} : { detail: `${threat}.` }) };
    }
    case 'CONTINUE_ENCOUNTER':
      return { title: threat ?? 'Pressed on' };
    case 'USE_CONSUMABLE':
      return { title: `Used ${itemName(action.itemId, config)}` };
    case 'STORY_BEAT': {
      const items = (action.reward?.items ?? []).map((id) => itemName(id, config));
      return { title: `A story: ${action.beatId}`, ...(items.length === 0 ? {} : { detail: `Received ${items.join(', ')}.` }) };
    }
    default:
      return { title: 'Done' };
  }
}

/** Builds the Chronicle entry for one applied action. */
export function chronicleEntry(
  before: CampaignState, action: GameAction, events: readonly GameEvent[], after: CampaignState, config: RulesConfig,
): ChronicleEntry {
  const summary = summarize(action, events, after);
  const head = summary ?? silentHeadline(before, action, events, config);
  // Name the matchup on encounter results, so an entry reads on its own.
  const resolved = events.find((e): e is Extract<GameEvent, { type: 'encounter_resolved' }> => e.type === 'encounter_resolved');
  const matchup = resolved === undefined ? undefined : `${threatLabel(resolved.threat)}, met with ${ESTATE_LABEL[resolved.approach]}.`;
  const detail = [matchup, head.detail].filter((s): s is string => s !== undefined).join(' ') || undefined;
  const rows = (summary?.rows ?? collectRows(events)).map(({ quantity, amount }) => ({ quantity, amount }));
  return {
    week: before.elapsedWeeks,
    action,
    title: head.title,
    ...(detail === undefined ? {} : { detail }),
    rows,
    notes: summary?.notes ?? [],
  };
}

/** Entries grouped by elapsed week, newest first throughout (latest week, and latest entry within it). */
export function chronicleByWeek(log: readonly ChronicleEntry[]): { week: number; entries: ChronicleEntry[] }[] {
  const weeks = new Map<number, ChronicleEntry[]>();
  for (const entry of log) weeks.set(entry.week, [entry, ...(weeks.get(entry.week) ?? [])]);
  return [...weeks].sort(([a], [b]) => b - a).map(([week, entries]) => ({ week, entries }));
}
