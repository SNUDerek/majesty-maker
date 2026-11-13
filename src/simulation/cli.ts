/**
 * E4: command-line simulation runner.
 *
 *   npm run sim -- --policy pragmatic --birth-sign aries --seed 123 --trace
 *   npm run sim -- --all-policies --all-signs --runs 1000 --out reports/baseline
 *
 * `--seed` is the batch base seed; each run's campaign seed is
 * `deriveBatchSeed(seed, sign, runIndex)`, shared by every policy (paired
 * seeds). `--trace-seed S` instead runs one traced campaign per policy × sign
 * with the literal campaign seed S, e.g. to replay a run from a batch.
 * `--out` writes raw run records and aggregates; E5 adds the report formats.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { ConfigError, hashConfig, loadConfig, withOverrides, type RulesConfig } from '../core/config.js';
import {
  getCalendar, getDerivedStats, type CampaignState, type GameAction, type GameEvent, type ZodiacSign,
} from '../core/index.js';
import { aggregate, runMetaFromConfig, runRecord, type Aggregate, type RunRecord } from './metrics.js';
import { segmentLunarPhase } from '../core/pilgrimage.js';
import { POLICIES, type PolicyFactory } from './policies.js';
import { deriveBatchSeed, runCampaign, type CampaignResult } from './runner.js';

const CONTENT_DIR = fileURLToPath(new URL('../../content/', import.meta.url));

export const USAGE = `Usage: npm run sim -- [options]

Policies and signs (one of each pair is required):
  --policy <id>         policy to run (repeatable)
  --all-policies        run every registered policy
  --birth-sign <sign>   birth sign to run (repeatable)
  --all-signs           run all twelve signs

Runs:
  --runs <n>            campaigns per policy × sign (default 1)
  --seed <n>            batch base seed (default 1)
  --trace               print a week-by-week log of every run
  --trace-seed <n>      run one traced campaign with this literal seed
  --strict              assert state invariants after every action

Rules:
  --config <path>       rules JSON over defaults (full config or overlay)
  --variant <name>      overlay content/variants/<name>.json, or a path (repeatable)
  --weeks <n>           override calendar length (sensitivity runs only)

Output:
  --out <dir>           write runs.ndjson and aggregates.json to <dir>
  --help                show this message`;

export class UsageError extends Error {
  override name = 'UsageError';
}

export interface CliOptions {
  policies: string[] | 'all';
  signs: string[] | 'all';
  runs: number;
  seed: number;
  trace: boolean;
  traceSeed?: number;
  strict: boolean;
  config?: string;
  variants: string[];
  weeks?: number;
  out?: string;
  help: boolean;
}

function integer(flag: string, value: string | undefined, min: number): number | undefined {
  if (value === undefined) return undefined;
  const n = Number(value);
  if (!/^-?\d+$/.test(value.trim()) || !Number.isSafeInteger(n) || n < min) {
    throw new UsageError(`--${flag} must be an integer ≥ ${min}, got "${value}"`);
  }
  return n;
}

/** Parses argv (without node/script) into options; throws UsageError on bad input. */
export function parseCliArgs(argv: readonly string[]): CliOptions {
  let values;
  try {
    ({ values } = parseArgs({
      args: [...argv],
      strict: true,
      allowPositionals: false,
      options: {
        policy: { type: 'string', multiple: true },
        'all-policies': { type: 'boolean' },
        'birth-sign': { type: 'string', multiple: true },
        'all-signs': { type: 'boolean' },
        runs: { type: 'string' },
        seed: { type: 'string' },
        trace: { type: 'boolean' },
        'trace-seed': { type: 'string' },
        config: { type: 'string' },
        variant: { type: 'string', multiple: true },
        out: { type: 'string' },
        strict: { type: 'boolean' },
        weeks: { type: 'string' },
        help: { type: 'boolean', short: 'h' },
      },
    }));
  } catch (error) {
    throw new UsageError(error instanceof Error ? error.message : String(error));
  }
  const help = values.help ?? false;
  const pick = (list: string[] | undefined, all: boolean | undefined, name: string): string[] | 'all' => {
    if (list && all) throw new UsageError(`use either --${name} or --all-${name === 'policy' ? 'policies' : 'signs'}, not both`);
    if (all) return 'all';
    if (!list && !help) throw new UsageError(`--${name} or --all-${name === 'policy' ? 'policies' : 'signs'} is required`);
    return [...new Set((list ?? []).map((v) => v.toLowerCase()))];
  };
  const options: CliOptions = {
    policies: pick(values.policy, values['all-policies'], 'policy'),
    signs: pick(values['birth-sign'], values['all-signs'], 'birth-sign'),
    runs: integer('runs', values.runs, 1) ?? 1,
    seed: integer('seed', values.seed, Number.MIN_SAFE_INTEGER) ?? 1,
    trace: values.trace ?? false,
    strict: values.strict ?? false,
    variants: values.variant ?? [],
    help,
  };
  const traceSeed = integer('trace-seed', values['trace-seed'], 0);
  if (traceSeed !== undefined) {
    if (traceSeed > 0xffffffff) throw new UsageError('--trace-seed must be a uint32 campaign seed');
    if (values.runs !== undefined || values.seed !== undefined) {
      throw new UsageError('--trace-seed runs a single literal seed; drop --runs/--seed');
    }
    options.traceSeed = traceSeed;
  }
  const weeks = integer('weeks', values.weeks, 1);
  if (weeks !== undefined) options.weeks = weeks;
  if (values.config !== undefined) options.config = values.config;
  if (values.out !== undefined) options.out = values.out;
  return options;
}

function readJson(path: string): unknown {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    throw new UsageError(`cannot read ${path}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/** A bare variant name maps to content/variants/<name>.json; anything path-like is used as given. */
export function variantPath(variant: string, cwd: string): string {
  return /[\\/]|\.json$/i.test(variant) ? resolve(cwd, variant) : resolve(CONTENT_DIR, 'variants', `${variant}.json`);
}

export function loadCliConfig(options: CliOptions, cwd = process.cwd()): RulesConfig {
  try {
    const config = loadConfig({
      rules: readJson(resolve(CONTENT_DIR, 'rules.default.json')),
      items: readJson(resolve(CONTENT_DIR, 'items.json')),
      variants: [
        ...(options.config ? [readJson(resolve(cwd, options.config))] : []),
        ...options.variants.map((v) => readJson(variantPath(v, cwd))),
      ],
    });
    return options.weeks === undefined ? config : withOverrides(config, { calendar: { totalWeeks: options.weeks } });
  } catch (error) {
    if (error instanceof ConfigError) throw new UsageError(error.message);
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Trace formatting
// ---------------------------------------------------------------------------

const SHORT: Record<string, string> = {
  bellatores: 'Bel', oratores: 'Ora', laboratores: 'Lab', fatigue: 'Fat', melancholy: 'Mel',
  treasury: 'Coin', carried: 'Carry',
};

function signed(n: number): string {
  return n >= 0 ? `+${n}` : String(n);
}

function describeAction(action: GameAction): string {
  switch (action.type) {
    case 'TRAIN': return `train ${action.tutor}`;
    case 'WORK': return `work ${action.job}`;
    case 'REST': return `rest ${action.rest}`;
    case 'BEGIN_PILGRIMAGE':
      return [`depart carry=${action.carry}`,
        action.equipmentId && `equip=${action.equipmentId}`,
        action.consumableId && `consumable=${action.consumableId}`].filter(Boolean).join(' ');
    case 'CHOOSE_APPROACH': return `approach ${action.estate}`;
    case 'USE_CONSUMABLE': return `use ${action.itemId}`;
    default: return action.type.toLowerCase().replaceAll('_', ' ');
  }
}

/** Check, deltas and notable events produced by one action. */
function describeEvents(events: readonly GameEvent[]): string {
  const parts: string[] = [];
  const deltas = new Map<string, number>();
  const add = (key: string, amount: number): void => { deltas.set(key, (deltas.get(key) ?? 0) + amount); };
  for (const e of events) {
    switch (e.type) {
      case 'job_resolved':
        parts.push(`p=${e.probability}% ${e.roll === undefined ? 'auto' : `roll=${e.roll}`} ${e.success ? 'ok' : 'FAIL'}`);
        break;
      case 'encounter_drawn': parts.push(`#${e.encounterIndex + 1} threat=${e.threat}`); break;
      case 'encounter_resolved':
        parts.push(`${e.approach} vs ${e.threat} p=${e.probability}% roll=${e.roll} ${e.success ? 'ok' : 'FAIL'}`);
        break;
      case 'encounter_skipped': parts.push(`#${e.encounterIndex + 1} skipped (${e.source})`); break;
      case 'reroll_used': parts.push(`reroll ${e.itemId}`); break;
      case 'stat_changed': add(e.estate, e.amount); break;
      case 'burden_changed': add(e.burden, e.amount); break;
      case 'coin_changed': add(e.account, e.amount); break;
      case 'item_changed':
        if (e.amount === 0) parts.push(`${e.itemId} ${e.source === 'consumed' ? 'consumed' : 'lost'}`);
        else if (e.source === 'starting_inventory' || e.source === 'reward') parts.push(`${signed(e.amount)} ${e.itemId}`);
        break;
      case 'pilgrimage_started': parts.push(`${e.isFinal ? 'final gauntlet' : `segment ${e.segmentIndex + 1}`} begins`); break;
      case 'waystation_reached': parts.push(`waystation ${e.waystation}`); break;
      case 'collapse': parts.push(`COLLAPSE (${e.cause})`); break;
      case 'convalescence': parts.push(`convalescence (${e.cause})`); break;
      case 'retreat': parts.push('retreat'); break;
      case 'wipeout': parts.push(`WIPEOUT (${e.cause})`); break;
      case 'victory': parts.push('VICTORY'); break;
      case 'deadline': parts.push('DEADLINE'); break;
      case 'week_spent':
      case 'consumable_used':
        break;
    }
  }
  const deltaText = [...deltas].filter(([, n]) => n !== 0).map(([k, n]) => `${SHORT[k] ?? k} ${signed(n)}`);
  return [...parts, ...(deltaText.length ? [deltaText.join(' ')] : [])].join(' | ');
}

function statusLine(state: CampaignState): string {
  const { stats } = state;
  return `Bel ${stats.bellatores} Ora ${stats.oratores} Lab ${stats.laboratores} · `
    + `Fat ${state.fatigue} Mel ${state.melancholy} · Coin ${state.treasury}`;
}

/** Week-by-week log of a traced run (decisions must carry before/after snapshots). */
export function formatTrace(result: CampaignResult, config: RulesConfig, label: string): string {
  const lines = [`=== ${label} ===`];
  let week = -1;
  for (const d of result.decisions) {
    const before = d.before;
    if (!before) throw new Error('formatTrace needs a run made with trace: true');
    if (d.week !== week) {
      week = d.week;
      const cal = getCalendar(before, config);
      const derived = getDerivedStats(before, config);
      lines.push(`Week ${week + 1} · year ${cal.displayYear} month ${cal.currentMonth + 1} week ${cal.weekOfMonth + 1} · `
        + `age ${cal.age} · ${derived.lunarPhase} moon, solar ${derived.solarAspect} · ${statusLine(before)}`);
    }
    const segment = before.pilgrimage;
    const context = segment ? `segment moon=${segmentLunarPhase(before, config)} (entry week ${segment.segmentEntryWeek + 1})` : '';
    const detail = [context, describeEvents(result.events.slice(d.eventStart, d.eventEnd))].filter(Boolean).join(' | ');
    lines.push(`  ${describeAction(d.action)}${detail ? ` — ${detail}` : ''}`);
  }
  const final = result.finalState;
  lines.push(`Result: ${final.outcome ?? final.phase} after ${final.elapsedWeeks} weeks · `
    + `waystation ${final.furthestWaystation} · ${statusLine(final)}`);
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

function pct(n: number | null): string {
  return n === null ? '–' : `${(n * 100).toFixed(1)}%`;
}

function num(n: number | null, digits = 1): string {
  return n === null ? '–' : n.toFixed(digits);
}

export function formatSummary(rows: readonly Aggregate[]): string {
  const header = ['policy', 'sign', 'runs', 'victory', '95% CI', 'win wk (med)', 'wipeouts/run', 'retreats/run', 'convalesce wk'];
  const body = rows.map((a) => [
    a.policy, a.birthSign, String(a.runs), pct(a.victoryRate.estimate),
    `${pct(a.victoryRate.low)}–${pct(a.victoryRate.high)}`, num(a.victoryWeek.median, 0),
    num(a.wipeoutsPerRun.mean, 2), num(a.retreatsPerRun.mean, 2), num(a.convalescenceWeeks.mean, 1),
  ]);
  const widths = header.map((h, i) => Math.max(h.length, ...body.map((r) => r[i]!.length)));
  const line = (cells: readonly string[]): string => cells.map((c, i) => c.padEnd(widths[i]!)).join('  ').trimEnd();
  return [line(header), line(widths.map((w) => '-'.repeat(w))), ...body.map(line)].join('\n');
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export interface CliIo {
  stdout: (text: string) => void;
  stderr: (text: string) => void;
  cwd?: string;
  /** Defaults to the shared registry; tests inject stubs. */
  policies?: Readonly<Record<string, PolicyFactory>>;
}

/** Runs the CLI and returns the exit code (0 ok, 1 runtime error, 2 usage error). */
export function runCli(argv: readonly string[], io: CliIo): number {
  const cwd = io.cwd ?? process.cwd();
  const registry = io.policies ?? POLICIES;
  try {
    const options = parseCliArgs(argv);
    if (options.help) {
      io.stdout(USAGE);
      return 0;
    }
    const config = loadCliConfig(options, cwd);
    const configId = hashConfig(config);
    const knownSigns = Object.keys(config.startingState.zodiacEstate) as ZodiacSign[];
    const signs = options.signs === 'all' ? knownSigns : options.signs as ZodiacSign[];
    for (const sign of signs) {
      if (!knownSigns.includes(sign)) throw new UsageError(`unknown birth sign "${sign}"; expected one of ${knownSigns.join(', ')}`);
    }
    const knownPolicies = Object.keys(registry).sort();
    const policyIds = options.policies === 'all' ? knownPolicies : options.policies;
    if (policyIds.length === 0) throw new UsageError('no policies are registered');
    for (const id of policyIds) {
      if (!Object.hasOwn(registry, id)) {
        throw new UsageError(`unknown policy "${id}"; registered: ${knownPolicies.join(', ') || '(none)'}`);
      }
    }

    const traceSeed = options.traceSeed;
    const trace = options.trace || traceSeed !== undefined;
    const runs = traceSeed === undefined ? options.runs : 1;
    const records: RunRecord[] = [];
    for (const policyId of policyIds) {
      for (const sign of signs) {
        for (let runIndex = 0; runIndex < runs; runIndex++) {
          const seed = traceSeed ?? deriveBatchSeed(options.seed, sign, runIndex);
          const policy = registry[policyId]!();
          const result = runCampaign({ seed, sign, policy, config, trace, strict: options.strict });
          if (trace) {
            io.stdout(formatTrace(result, config, `policy=${policyId} sign=${sign} seed=${seed}`
              + (traceSeed === undefined ? ` (base ${options.seed}, run ${runIndex})` : '')));
            io.stdout('');
          }
          records.push(runRecord(result.events, result.finalState,
            runMetaFromConfig(result.finalState, config, { policy: policyId, seed, configId })));
        }
      }
    }
    const rows = aggregate(records, { includeAllSigns: signs.length > 1 });
    io.stdout(`config ${configId}${options.variants.length ? ` (variants: ${options.variants.join(', ')})` : ''}`
      + `${options.weeks === undefined ? '' : ` · weeks ${options.weeks}`}`);
    io.stdout(formatSummary(rows));
    if (options.out !== undefined) {
      const dir = resolve(cwd, options.out);
      mkdirSync(dir, { recursive: true });
      writeFileSync(resolve(dir, 'runs.ndjson'), records.map((r) => JSON.stringify(r)).join('\n') + '\n');
      writeFileSync(resolve(dir, 'aggregates.json'), JSON.stringify({ configId, args: argv, aggregates: rows }, null, 2) + '\n');
      io.stderr(`wrote ${records.length} run records to ${dir}`);
    }
    return 0;
  } catch (error) {
    if (error instanceof UsageError) {
      io.stderr(`error: ${error.message}\n\n${USAGE}`);
      return 2;
    }
    io.stderr(`error: ${error instanceof Error ? error.message : String(error)}`);
    return 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  process.exitCode = runCli(process.argv.slice(2), {
    stdout: (text) => process.stdout.write(`${text}\n`),
    stderr: (text) => process.stderr.write(`${text}\n`),
  });
}
