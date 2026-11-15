/**
 * Story beats (docs/dialog-and-story-beats-plan.md §6). Pure TS: reads beat
 * triggers from ink knot tags and decides which beat, if any, plays next.
 * Persistent state lives in `CampaignState.storyBeats` (beat id -> week).
 */
import { Story } from 'inkjs';
import { getCalendar, type ActivityId, type CampaignState, type Estate, type RulesConfig } from '../../core/index.js';

/** `socialize` is the "Talk with her" button (father–daughter talks). */
export type BeatActivity = ActivityId | 'socialize';
export type Reward = { kind: 'coin'; amount: number } | { kind: 'item'; id: string };

export interface Beat {
  /** `<file>/<knot>`, e.g. `knight/knight_2`. */
  id: string;
  /** The file name without `.ink`. */
  thread: string;
  knot: string;
  /** `# title:`; defaults to the knot name. Shown in the Chronicle. */
  title: string;
  order: number;
  activities: BeatActivity[];
  /** Earliest campaign month, 1-based. */
  month: number;
  stats: [Estate, number][];
  rewards: Reward[];
  bg?: string;
  left?: string;
  /** The thread's `# cooldown:` in weeks. */
  cooldown: number;
  /** Compiled ink JSON of the whole thread, for the dialog player. */
  json: string;
}

const ESTATES: readonly string[] = ['bellatores', 'oratores', 'laboratores'];
export const DEFAULT_COOLDOWN = 2;

function tagMap(tags: readonly string[] | null): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const tag of tags ?? []) {
    const match = /^\s*([a-z_]+)\s*:\s*(.*?)\s*$/.exec(tag);
    if (match === null) continue;
    map.set(match[1]!, [...(map.get(match[1]!) ?? []), match[2]!]);
  }
  return map;
}

function wholeNumber(text: string | undefined): number | undefined {
  if (text === undefined || !/^\d+$/.test(text)) return undefined;
  const value = Number(text);
  return Number.isSafeInteger(value) ? value : undefined;
}

/**
 * Reads every knot with an `# order:` tag as a beat. `stories` maps a file
 * path (or name) to compiled ink JSON. Malformed tags are reported in
 * `errors` and the beat is skipped.
 */
export function loadBeats(stories: Readonly<Record<string, string>>): { beats: Beat[]; errors: string[] } {
  const beats: Beat[] = [];
  const errors: string[] = [];
  for (const [path, json] of Object.entries(stories).sort(([a], [b]) => a.localeCompare(b))) {
    const thread = path.split('/').pop()!.replace(/\.(ink|json)$/, '');
    const story = new Story(json);
    const global = tagMap(story.globalTags);
    const cooldownText = global.get('cooldown')?.[0];
    const cooldown = cooldownText === undefined ? DEFAULT_COOLDOWN : wholeNumber(cooldownText);
    if (cooldown === undefined) errors.push(`${thread}: bad cooldown ${JSON.stringify(cooldownText)}`);
    for (const knot of story.mainContentContainer.namedContent.keys()) {
      const tags = tagMap(story.TagsForContentAtPath(knot));
      if (!tags.has('order')) continue;
      const id = `${thread}/${knot}`;
      const problems: string[] = [];
      const order = wholeNumber(tags.get('order')![0]);
      if (order === undefined) problems.push(`bad order ${JSON.stringify(tags.get('order')![0])}`);
      const activities = (tags.get('activity') ?? []).flatMap((a) => a.split(/\s+/)).filter(Boolean) as BeatActivity[];
      if (activities.length === 0) problems.push('missing activity');
      const monthText = tags.get('month')?.[0];
      const month = monthText === undefined ? 1 : wholeNumber(monthText);
      if (month === undefined || month < 1) problems.push(`bad month ${JSON.stringify(monthText)}`);
      const stats: [Estate, number][] = [];
      for (const text of tags.get('stat') ?? []) {
        const [estate, value, ...rest] = text.split(/\s+/);
        const min = wholeNumber(value);
        if (estate === undefined || !ESTATES.includes(estate) || min === undefined || rest.length > 0) problems.push(`bad stat ${JSON.stringify(text)}`);
        else stats.push([estate as Estate, min]);
      }
      const rewards: Reward[] = [];
      for (const text of tags.get('reward') ?? []) {
        const [kind, value, ...rest] = text.split(/\s+/);
        const amount = wholeNumber(value);
        if (kind === 'coin' && amount !== undefined && amount > 0 && rest.length === 0) rewards.push({ kind: 'coin', amount });
        else if (kind === 'item' && value !== undefined && rest.length === 0) rewards.push({ kind: 'item', id: value });
        else problems.push(`bad reward ${JSON.stringify(text)}`);
      }
      if (!Number.isSafeInteger(rewards.reduce((sum, reward) => sum + (reward.kind === 'coin' ? reward.amount : 0), 0))) {
        problems.push('total coin reward exceeds safe integer range');
      }
      if (problems.length > 0 || cooldown === undefined) {
        errors.push(...problems.map((p) => `${id}: ${p}`));
        continue;
      }
      const bg = tags.get('bg')?.[0];
      const left = tags.get('left')?.[0];
      beats.push({
        id, thread, knot, title: tags.get('title')?.[0] ?? knot, order: order!, activities, month: month!, stats, rewards,
        ...(bg === undefined ? {} : { bg }), ...(left === undefined ? {} : { left }), cooldown, json,
      });
    }
  }
  beats.sort((a, b) => a.thread.localeCompare(b.thread) || a.order - b.order);
  return { beats, errors };
}

export interface KnownIds {
  activities: Iterable<string>;
  items: Iterable<string>;
  backgrounds: Iterable<string>;
  characters: Iterable<string>;
}

/** Content errors: unknown ids in knot tags and duplicate orders within a thread. */
export function validateBeats(beats: readonly Beat[], known: KnownIds): string[] {
  const activities = new Set([...known.activities, 'socialize']);
  const items = new Set(known.items);
  const backgrounds = new Set(known.backgrounds);
  const characters = new Set(known.characters);
  const errors: string[] = [];
  const orders = new Set<string>();
  for (const beat of beats) {
    for (const activity of beat.activities) if (!activities.has(activity)) errors.push(`${beat.id}: unknown activity ${activity}`);
    for (const reward of beat.rewards) if (reward.kind === 'item' && !items.has(reward.id)) errors.push(`${beat.id}: unknown item ${reward.id}`);
    if (beat.bg !== undefined && !backgrounds.has(beat.bg)) errors.push(`${beat.id}: unknown background ${beat.bg}`);
    if (beat.left !== undefined && !characters.has(beat.left)) errors.push(`${beat.id}: unknown character ${beat.left}`);
    const key = `${beat.thread}:${beat.order}`;
    if (orders.has(key)) errors.push(`${beat.id}: duplicate order ${beat.order} in ${beat.thread}`);
    orders.add(key);
  }
  return errors;
}

/**
 * The beat to play after `activity` (§6.2), or undefined. Each thread offers
 * its first unplayed beat, plus the activity's intro (the thread's first beat
 * for that activity) if unplayed, so e.g. a job's first scene isn't locked
 * behind a tutor's. Stats are read from `state`, which is the state after the
 * activity. At most one beat plays per week.
 */
export function nextBeat(beats: readonly Beat[], state: CampaignState, activity: BeatActivity, config: RulesConfig): Beat | undefined {
  const played = state.storyBeats ?? {};
  const week = state.elapsedWeeks;
  if (Object.values(played).some((w) => w === week)) return undefined;
  const month = getCalendar(state, config).monthOffset + 1;
  const threads = new Map<string, Beat[]>();
  for (const beat of beats) threads.set(beat.thread, [...(threads.get(beat.thread) ?? []), beat]);
  for (const thread of [...threads.keys()].sort()) {
    const chain = threads.get(thread)!;
    const first = chain.find((b) => !Object.hasOwn(played, b.id));
    if (first === undefined) continue;
    const intro = chain.find((b) => b.activities.includes(activity));
    const lastPlayed = Math.max(-Infinity, ...chain.filter((b) => Object.hasOwn(played, b.id)).map((b) => played[b.id]!));
    for (const next of [first, intro]) {
      if (next !== undefined && !Object.hasOwn(played, next.id) && next.activities.includes(activity) && month >= next.month
        && next.stats.every(([estate, min]) => state.stats[estate] >= min)
        && week - lastPlayed >= next.cooldown) return next;
    }
  }
  return undefined;
}

/** The activity a home action trains, works or rests at. */
export function actionActivity(action: { type: string; tutor?: ActivityId; job?: ActivityId; rest?: ActivityId }): ActivityId | undefined {
  return action.type === 'TRAIN' ? action.tutor : action.type === 'WORK' ? action.job : action.type === 'REST' ? action.rest : undefined;
}

/** Display lines for a beat's rewards, e.g. "25 Coin", "Gambeson". */
export function rewardLines(beat: Beat, config: RulesConfig): string[] {
  return beat.rewards.map((r) => (r.kind === 'coin' ? `${r.amount} Coin` : config.items.catalog[r.id]?.name ?? r.id));
}

/** The core STORY_BEAT reward for a beat. */
export function beatReward(beat: Beat): { coin?: number; items?: string[] } | undefined {
  const coin = beat.rewards.reduce((sum, r) => sum + (r.kind === 'coin' ? r.amount : 0), 0);
  const items = beat.rewards.flatMap((r) => (r.kind === 'item' ? [r.id] : []));
  if (coin === 0 && items.length === 0) return undefined;
  return { ...(coin > 0 ? { coin } : {}), ...(items.length > 0 ? { items } : {}) };
}
