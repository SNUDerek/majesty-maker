/**
 * Flavor text and the daughter's thoughts (docs/dialog-and-story-beats-plan.md §4).
 * Pure; no React. Lines are picked by hashing the seed and week, never from
 * the core's RNG streams, so they don't disturb simulations and survive reloads.
 */
import type { CampaignState, GameAction, GameEvent, JobId, TutorId } from '../../core/index.js';
import content from '../../../content/flavor.json';

export interface FlavorContent {
  tutor: Record<TutorId, string[]>;
  job: Record<JobId, { success: string[]; failure: string[] }>;
  thought: { idle: string[]; talk_ready: string[] };
}

export const FLAVOR: FlavorContent = content;

/** FNV-1a, 32-bit. */
function hash(key: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** A line chosen deterministically by `key`, or undefined for an empty list. */
export function pickLine(lines: readonly string[], key: string): string | undefined {
  return lines.length === 0 ? undefined : lines[hash(key) % lines.length];
}

/** Replaces `{scion}` and `{player}` with the daughter's name and the player's first name. */
export function fillNames(text: string, state: Pick<CampaignState, 'scionName' | 'playerName'>): string {
  return text.replace(/\{(scion|player)\}/g, (_, name: string) =>
    name === 'scion' ? state.scionName : state.playerName.first);
}

function lineFor(state: CampaignState, lines: readonly string[] | undefined, slot: string): string | undefined {
  const line = pickLine(lines ?? [], `${state.seed}:${state.elapsedWeeks}:${slot}`);
  return line === undefined ? undefined : fillNames(line, state);
}

/**
 * Flavor for a TRAIN or WORK result. `before` is the state the action was
 * applied to; job success or failure comes from the `job_resolved` event.
 */
export function resultFlavor(
  before: CampaignState, action: GameAction, events: readonly GameEvent[], flavor: FlavorContent = FLAVOR,
): string | undefined {
  if (action.type === 'TRAIN') return lineFor(before, flavor.tutor[action.tutor], `tutor:${action.tutor}`);
  if (action.type !== 'WORK') return undefined;
  const job = events.find((e): e is Extract<GameEvent, { type: 'job_resolved' }> => e.type === 'job_resolved');
  if (job === undefined) return undefined;
  const outcome = job.success ? 'success' : 'failure';
  return lineFor(before, flavor.job[job.job]?.[outcome], `job:${job.job}:${outcome}`);
}

/** The daughter's thought for the current week. */
export function thoughtLine(state: CampaignState, kind: keyof FlavorContent['thought'] = 'idle', flavor: FlavorContent = FLAVOR): string | undefined {
  return lineFor(state, flavor.thought[kind], `thought:${kind}`);
}
