/** E5: reproducible CSV/JSON/Markdown exports for one effective rules config. */
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getUnresolved, hashConfig, type RulesConfig } from '../core/config.js';
import type { GameEvent, ZodiacSign } from '../core/types.js';
import { aggregate, type Aggregate, type RunRecord } from './metrics.js';

const SOURCE_ROOT = fileURLToPath(new URL('../../', import.meta.url));

export interface TraceRun {
  policy: string;
  birthSign: ZodiacSign;
  seed: number;
  events: readonly GameEvent[];
}
export interface ReportInput {
  records: readonly RunRecord[];
  config: RulesConfig;
  /** Exact argv without node/script. */
  args: readonly string[];
  policies?: readonly { id: string; params: Readonly<Record<string, unknown>> }[];
  /** Null when unavailable; writeReport discovers HEAD if omitted. */
  gitCommit?: string | null;
  traces?: readonly TraceRun[];
}
export interface ReportFlag {
  policy: string;
  birthSign: ZodiacSign;
  code: 'unfinished' | 'zero_treasury' | 'medical_fee_shortfall' | 'physician_fee_shortfall' | 'resource_loop'
    | 'home_collapse' | 'failed_departure';
  runs: number;
  description: string;
}

const RUN_FIELDS = [
  'seed', 'birthSign', 'policy', 'configId', 'outcome', 'victoryWeek', 'finalWeek', 'finalAge',
  'finalStats', 'finalFatigue', 'finalMelancholy', 'finalCeilings', 'finalTreasury',
  'furthestWaystation', 'firstReachWeek', 'finalEncountersCompleted', 'finalAttempts', 'weeks',
  'segmentStarts', 'retreats', 'wipeouts', 'wipeoutCauses', 'homeCollapses', 'medicalFeeShortfalls',
  'physicianFeeShortfalls', 'failedDepartureAttempts', 'jobs', 'encounters', 'encountersByMatchup', 'encounterRolls',
  'encountersSkipped', 'rerolls', 'coinBySource', 'coinEarned', 'coinSpent', 'coinLost', 'items',
  'zeroPurseWeeks', 'zeroTreasuryWeeks', 'fatigueByWeek', 'melancholyByWeek', 'treasuryByWeek',
  'failureAttribution',
] as const satisfies readonly (keyof RunRecord)[];
const FLATTEN = {
  finalStats: ['bellatores', 'oratores', 'laboratores'],
  finalCeilings: ['fatigue', 'melancholy'],
  weeks: ['tutor', 'job', 'rest', 'segment_entry', 'convalescence', 'unused'],
  wipeoutCauses: ['fatigue', 'melancholy', 'both', 'coin'],
} as const;
const COLUMNS = RUN_FIELDS.flatMap((field) => Object.hasOwn(FLATTEN, field)
  ? FLATTEN[field as keyof typeof FLATTEN].map((key) => `${field}.${key}`) : [field]);

function csvCell(value: unknown): string {
  const text = value === null || value === undefined ? ''
    : typeof value === 'object' ? JSON.stringify(value) : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

/** Fixed schema; nulls are blank, variable maps and weekly arrays are JSON cells. */
export function renderRunsCsv(records: readonly RunRecord[]): string {
  const rows = records.map((record) => COLUMNS.map((column) => {
    const [field, key] = column.split('.') as [keyof RunRecord, string?];
    const value = record[field];
    return csvCell(key === undefined ? value : (value as unknown as Record<string, unknown>)[key]);
  }).join(','));
  return [COLUMNS.join(','), ...rows].join('\r\n') + '\r\n';
}

/** Missing Git/repository is normal for exported source archives. No shell invoked. */
export function readGitCommit(cwd: string): string | null {
  try {
    return execFileSync('git', ['rev-parse', '--verify', 'HEAD'], {
      cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
    }).trim() || null;
  } catch { return null; }
}

function reportFlags(records: readonly RunRecord[], rows: readonly Aggregate[]): ReportFlag[] {
  const rules: { code: ReportFlag['code']; test: (r: RunRecord) => boolean; description: string }[] = [
    { code: 'unfinished', test: (r) => r.outcome === 'unfinished', description: 'Campaign did not reach a terminal outcome.' },
    { code: 'zero_treasury', test: (r) => r.zeroTreasuryWeeks > 0, description: 'At least one spent week ended with empty treasury; carried Coin may remain.' },
    { code: 'medical_fee_shortfall', test: (r) => r.medicalFeeShortfalls > 0, description: 'At least one wipeout medical fee could not be paid in full.' },
    { code: 'physician_fee_shortfall', test: (r) => r.physicianFeeShortfalls > 0, description: 'At least one home-collapse physician fee could not be paid in full.' },
    { code: 'resource_loop', test: (r) => r.failureAttribution === 'resource_loop', description: 'Deadline attributed to a closing resource loop (metrics heuristic, default 24-week window).' },
    { code: 'home_collapse', test: (r) => r.homeCollapses > 0, description: 'At least one home activity caused collapse.' },
    { code: 'failed_departure', test: (r) => r.failedDepartureAttempts > 0, description: 'At least one rejected departure was recorded by the caller.' },
  ];
  return rows.filter((row): row is Aggregate & { birthSign: ZodiacSign } => row.birthSign !== 'all')
    .flatMap((row) => {
      const group = records.filter((r) => r.policy === row.policy && r.birthSign === row.birthSign);
      return rules.flatMap((rule) => {
        const runs = group.filter(rule.test).length;
        return runs ? [{ policy: row.policy, birthSign: row.birthSign, code: rule.code, runs, description: rule.description }] : [];
      });
    });
}

/** Lunar features that are off in this config (0 bonus or a null skip fee), sorted by path. */
export function disabledAstrologyParameters(config: RulesConfig): string[] {
  const { newMoon, fullMoon } = config.astrology;
  return [
    ['astrology.fullMoon.surge', fullMoon.surge === 0],
    ['astrology.newMoon.activityBonus', newMoon.activityBonus === 0],
    ['astrology.newMoon.skipFee', newMoon.skipFee === null],
  ].filter(([, off]) => off).map(([path]) => path as string);
}

export function buildSummary(input: ReportInput) {
  const configId = hashConfig(input.config);
  if (input.records.some((record) => record.configId !== configId)) {
    throw new Error('Report records must use the supplied effective config');
  }
  const unresolved = getUnresolved(input.config);
  // Completeness depends on the effective settings, not on provenance status:
  // confirming a field's status must not make a disabled bonus look configured.
  const disabledAstrology = disabledAstrologyParameters(input.config);
  const tbdPaths = new Set(unresolved.filter((p) => p.status === 'tbd').map((p) => p.path));
  const rows = aggregate(input.records, { includeAllSigns: new Set(input.records.map((r) => r.birthSign)).size > 1 });
  return {
    schemaVersion: 1,
    configId,
    config: input.config,
    unresolved,
    gitCommit: input.gitCommit ?? null,
    args: [...input.args],
    policies: input.policies ?? [],
    runCount: input.records.length,
    astrology: {
      label: disabledAstrology.length ? 'partial astrology' : 'configured astrology',
      /** Every lunar feature switched off in the effective config. */
      disabledParameters: disabledAstrology,
      /** Legacy field (schema 1): the disabled features whose provenance is still `tbd`. */
      disabledTbdParameters: disabledAstrology.filter((path) => tbdPaths.has(path)),
    },
    aggregates: rows,
    flags: reportFlags(input.records, rows),
    traces: (input.traces ?? []).map(({ events, ...meta }) => ({ ...meta, eventCount: events.length })),
  };
}
export type ReportSummary = ReturnType<typeof buildSummary>;

const pct = (value: number | null): string => value === null ? '—' : `${(value * 100).toFixed(1)}%`;
const num = (value: number | null, digits = 1): string => value === null ? '—' : value.toFixed(digits);
const cell = (value: unknown): string => String(value).replaceAll('\\', '\\\\').replaceAll('|', '\\|').replace(/\r?\n/g, '<br>');
function table(header: string[], rows: unknown[][]): string {
  return [header, header.map(() => '---'), ...rows].map((row) => `| ${row.map(cell).join(' | ')} |`).join('\n');
}
function shellQuote(value: string): string {
  return /^[a-zA-Z0-9_./:=@+-]+$/.test(value) ? value : `'${value.replaceAll("'", "'\\''")}'`;
}

export function renderSummaryMarkdown(summary: ReportSummary): string {
  const rows = summary.aggregates;
  const group = (row: Aggregate) => [row.policy, row.birthSign];
  const command = ['npm run sim --', ...summary.args.map(shellQuote)].join(' ');
  return [
    '# Simulation summary', '',
    `Config: \`${summary.configId}\`. Runs: ${summary.runCount}. Git commit: ${summary.gitCommit ? `\`${summary.gitCommit}\`` : 'unavailable'}.`, '',
    `Astrology: **${summary.astrology.label}**.${summary.astrology.disabledParameters.length
      ? ` Disabled parameters: ${summary.astrology.disabledParameters.map((p) => `\`${p}\``).join(', ')}.` : ''}`, '',
    'The full effective rules, unresolved assumptions, policy params and unrounded aggregates are in `summary.json`. Strategy comparisons require paired seeds and comparable configs; diagnostic flags indicate observations, not proven balance defects.', '',
    '## Reproduction', '', '```sh', command, '```', '',
    'Use the literal seed, policy and sign from a CSV row to inspect a run:', '',
    '`npm run sim -- --policy <policy> --birth-sign <sign> --trace-seed <seed> --out <directory>`', '',
    'Reuse the original `--config`, `--variant`, `--weeks` and policy parameters. If those inputs changed, restore the effective config snapshot from `summary.json` with `--config <snapshot.json>`.', '',
    '## Outcomes', '',
    table(['Policy', 'Sign', 'Runs', 'Victory', '95% Wilson CI', 'Win week median', 'Final cards mean', 'Deadline / resource loop / unfinished'], rows.map((r) => [
      ...group(r), r.runs, pct(r.victoryRate.estimate), `${pct(r.victoryRate.low)}–${pct(r.victoryRate.high)}`,
      num(r.victoryWeek.median, 0), num(r.finalEncountersCompleted.mean),
      `${r.failureAttribution.deadline} / ${r.failureAttribution.resource_loop} / ${r.outcomes.unfinished}`,
    ])), '',
    'Win weeks include winners only. Resource-loop attribution uses the metrics closing-window heuristic (default 24 weeks). An “all” row pools signs for that policy.', '',
    '## Checkpoints', '',
    table(['Policy', 'Sign', 'Furthest checkpoint (runs)', 'First reach: checkpoint / runs / median week'], rows.map((r) => [
      ...group(r), Object.entries(r.checkpoints).map(([k, v]) => `${k}: ${v}`).join('; '),
      Object.entries(r.firstReach).map(([k, v]) => `${k} / ${v.reached} / ${num(v.week.median, 0)}`).join('; ') || '—',
    ])), '',
    '## Risk and recovery', '',
    table(['Policy', 'Sign', 'Wipeouts/run', 'Causes F/M/both/Coin', 'Retreats/run', 'Home collapses/run', 'Convalescence weeks', 'Medical / physician fees paid per run', 'Empty treasury runs', 'Medical / physician shortfall', 'Skips/run', 'Failed departures/run'], rows.map((r) => [
      ...group(r), num(r.wipeoutsPerRun.mean, 2),
      `${r.wipeoutCauses.fatigue}/${r.wipeoutCauses.melancholy}/${r.wipeoutCauses.both}/${r.wipeoutCauses.coin}`,
      num(r.retreatsPerRun.mean, 2), num(r.homeCollapsesPerRun.mean, 2), num(r.convalescenceWeeks.mean),
      `${num(-(r.coinBySource.medical_fee ?? 0))} / ${num(-(r.coinBySource.physician_fee ?? 0))}`,
      pct(r.zeroTreasuryRunRate), `${pct(r.medicalFeeShortfallRate)} / ${pct(r.physicianFeeShortfallRate)}`,
      num(r.encountersSkippedPerRun.mean, 2), num(r.failedDepartureAttempts.mean, 2),
    ])), '',
    'Empty treasury includes runs with carried Coin remaining; medical shortfall is a fraction of wipeouts, physician shortfall a fraction of home collapses. Skips are New Moon bribes and are never counted as encounter rolls. Failed departures are only counted when the caller supplies rejected attempts to metrics; the standard runner records accepted actions.', '',
    '## Stats and economy', '',
    table(['Policy', 'Sign', 'Median B/O/L', 'Coin earned/spent/lost per run', 'Advantage/neutral/disadvantage share'], rows.map((r) => [
      ...group(r), `${num(r.finalStats.bellatores.median)}/${num(r.finalStats.oratores.median)}/${num(r.finalStats.laboratores.median)}`,
      `${num(r.coinPerRun.earned)}/${num(r.coinPerRun.spent)}/${num(r.coinPerRun.lost)}`,
      `${pct(r.matchupShare.advantage)}/${pct(r.matchupShare.neutral)}/${pct(r.matchupShare.disadvantage)}`,
    ])), '',
    '## Calendar utilization', '',
    table(['Policy', 'Sign', 'Training', 'Jobs', 'Rest', 'Adventure', 'Convalescence', 'Unused'], rows.map((r) => [
      ...group(r), ...(['tutor', 'job', 'rest', 'segment_entry', 'convalescence', 'unused'] as const)
        .map((key) => pct(r.calendarUtilization[key])),
    ])), '',
    '## Flagged anomalies', '',
    ...(summary.flags.length ? [table(['Policy', 'Sign', 'Flag', 'Affected runs', 'Observation'], summary.flags.map((f) => [
      f.policy, f.birthSign, f.code, f.runs, f.description,
    ]))] : ['No diagnostic flags triggered.']), '',
  ].join('\n');
}

/** Each event is tagged so policies/signs sharing a literal seed stay distinguishable. */
export function renderEventsNdjson(traces: readonly TraceRun[], configId: string): string {
  const lines = traces.flatMap((trace) => trace.events.map((event, eventIndex) => JSON.stringify({
    policy: trace.policy, birthSign: trace.birthSign, seed: trace.seed, configId, eventIndex, event,
  })));
  return lines.length ? lines.join('\n') + '\n' : '';
}

/** Writes one report set, including optional literal-seed debug events. */
export function writeReport(directory: string, input: ReportInput, cwd = process.cwd()): void {
  const summary = buildSummary({ ...input, gitCommit: input.gitCommit === undefined ? readGitCommit(SOURCE_ROOT) : input.gitCommit });
  const csv = renderRunsCsv(input.records);
  const markdown = renderSummaryMarkdown(summary);
  const dir = resolve(cwd, directory);
  mkdirSync(dir, { recursive: true });
  writeFileSync(resolve(dir, 'runs.csv'), csv);
  writeFileSync(resolve(dir, 'summary.json'), JSON.stringify(summary, null, 2) + '\n');
  writeFileSync(resolve(dir, 'summary.md'), markdown);
  if (input.traces?.length) writeFileSync(resolve(dir, 'events.ndjson'), renderEventsNdjson(input.traces, summary.configId));
  else rmSync(resolve(dir, 'events.ndjson'), { force: true });
}
