import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { AvailableAction, GameAction } from '../core/index.js';
import { hashConfig } from '../core/config.js';
import { segmentLunarPhase } from '../core/pilgrimage.js';
import { formatTrace, loadCliConfig, parseCliArgs, runCli, UsageError, variantPath } from '../simulation/cli.js';
import type { Policy } from '../simulation/runner.js';
import { deriveBatchSeed, runCampaign } from '../simulation/runner.js';
import { loadContentConfig } from './support/config.js';

/** Deterministic stand-in until E3 policies land: rotates through whatever is offered. */
function rotatingPolicy(id: string): Policy {
  let turn = 0;
  return {
    id,
    params: {},
    decide(_state, available: readonly AvailableAction[]): GameAction {
      const choice = available[turn++ % available.length]!;
      return choice.type === 'BEGIN_PILGRIMAGE' ? { type: 'BEGIN_PILGRIMAGE', carry: choice.minCarry } : choice;
    },
  };
}

const policies = { pragmatic: () => rotatingPolicy('pragmatic'), rotating: () => rotatingPolicy('rotating') };

function run(argv: string[], cwd?: string) {
  const out: string[] = [];
  const err: string[] = [];
  const code = runCli(argv, { stdout: (t) => out.push(t), stderr: (t) => err.push(t), policies, ...(cwd ? { cwd } : {}) });
  return { code, stdout: out.join('\n'), stderr: err.join('\n') };
}

describe('parseCliArgs', () => {
  it('applies defaults and accepts repeated flags', () => {
    const o = parseCliArgs(['--policy', 'a', '--policy', 'B', '--birth-sign', 'aries']);
    expect(o).toMatchObject({ policies: ['a', 'b'], signs: ['aries'], runs: 1, seed: 1, trace: false, strict: false, variants: [] });
    expect(parseCliArgs(['--all-policies', '--all-signs', '--runs', '5', '--seed=-3', '--weeks', '48', '--strict']))
      .toMatchObject({ policies: 'all', signs: 'all', runs: 5, seed: -3, weeks: 48, strict: true });
  });

  it.each([
    [['--birth-sign', 'aries']],
    [['--policy', 'a']],
    [['--policy', 'a', '--all-policies', '--all-signs']],
    [['--policy', 'a', '--all-signs', '--runs', '0']],
    [['--policy', 'a', '--all-signs', '--runs', '1.5']],
    [['--policy', 'a', '--all-signs', '--bogus']],
    [['--policy', 'a', '--all-signs', 'positional']],
    [['--policy', 'a', '--all-signs', '--trace-seed', '5', '--runs', '3']],
    [['--policy', 'a', '--all-signs', '--trace-seed', '4294967296']],
  ])('rejects %j', (argv) => {
    expect(() => parseCliArgs(argv)).toThrow(UsageError);
  });

  it('allows --help without other flags', () => {
    expect(parseCliArgs(['--help']).help).toBe(true);
  });
});

describe('config loading', () => {
  it('loads the default rules and resolves named variants', () => {
    const base = loadContentConfig();
    expect(hashConfig(loadCliConfig(parseCliArgs(['--all-policies', '--all-signs'])))).toBe(hashConfig(base));
    expect(hashConfig(loadCliConfig(parseCliArgs(['--all-policies', '--all-signs', '--variant', 'items-test-table']))))
      .toBe(hashConfig(loadContentConfig('variants/items-test-table.json')));
    expect(variantPath('x/y.json', '/w')).toBe('/w/x/y.json');
  });

  it('loads the experimental config overlay before additional variants', () => {
    const options = parseCliArgs(['--all-policies', '--all-signs',
      '--config', 'content/rules.experimental.json', '--variant', 'items-test-table']);
    expect(hashConfig(loadCliConfig(options)))
      .toBe(hashConfig(loadContentConfig('rules.experimental.json', 'variants/items-test-table.json')));
  });

  it('overrides the calendar length with --weeks', () => {
    expect(loadCliConfig(parseCliArgs(['--all-policies', '--all-signs', '--weeks', '48'])).calendar.totalWeeks).toBe(48);
  });
});

describe('runCli', () => {
  let dir: string | undefined;
  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
    dir = undefined;
  });

  it('runs the single-run trace command from tech §14', () => {
    const r = run(['--policy', 'pragmatic', '--birth-sign', 'aries', '--seed', '123', '--trace']);
    expect(r.code, r.stderr).toBe(0);
    const seed = deriveBatchSeed(123, 'aries', 0);
    expect(r.stdout).toContain(`=== policy=pragmatic sign=aries seed=${seed} (base 123, run 0) ===`);
    expect(r.stdout).toMatch(/^Week 1 · year \d+ month \d+ week 1 · age 14 · \w+ moon, solar \w+ · Bel \d+/m);
    expect(r.stdout).toMatch(/^ {2}(train|work|rest) \S+/m);
    expect(r.stdout).toMatch(/p=\d+% (roll=\d+|auto) (ok|FAIL)/);
    expect(r.stdout).toMatch(/^Result: (victory|deadline) after \d+ weeks/m);
    expect(r.stdout).toMatch(/^pragmatic\s+aries\s+1\s/m);
  });

  it('runs the batch command from tech §14 and writes records', () => {
    dir = mkdtempSync(join(tmpdir(), 'cli-'));
    const r = run(['--all-policies', '--all-signs', '--runs', '2', '--out', 'reports/baseline'], dir);
    expect(r.code, r.stderr).toBe(0);
    expect(r.stdout).not.toContain('===');
    expect(r.stdout).toMatch(/^pragmatic\s+all\s+24\s/m);
    expect(r.stdout).toMatch(/^rotating\s+pisces\s+2\s/m);
    const lines = readFileSync(join(dir, 'reports/baseline/runs.ndjson'), 'utf8').trim().split('\n');
    expect(lines).toHaveLength(2 * 12 * 2);
    const first = JSON.parse(lines[0]!);
    expect(first).toMatchObject({ policy: 'pragmatic', birthSign: 'aries', seed: deriveBatchSeed(1, 'aries', 0) });
    const summary = JSON.parse(readFileSync(join(dir, 'reports/baseline/aggregates.json'), 'utf8'));
    expect(summary.args).toContain('--all-policies');
    expect(summary.aggregates).toHaveLength(2 * 13);
    const formal = JSON.parse(readFileSync(join(dir, 'reports/baseline/summary.json'), 'utf8'));
    expect(formal).toMatchObject({ runCount: 48, configId: summary.configId,
      policies: [{ id: 'pragmatic', params: {} }, { id: 'rotating', params: {} }] });
    expect(formal.aggregates).toEqual(summary.aggregates);
    expect(formal.args).toEqual(summary.args);
    expect(readFileSync(join(dir, 'reports/baseline/runs.csv'), 'utf8').split('\r\n')).toHaveLength(50);
    expect(readFileSync(join(dir, 'reports/baseline/summary.md'), 'utf8')).toContain('partial astrology');
    expect(existsSync(join(dir, 'reports/baseline/events.ndjson'))).toBe(false);
  });

  it('pairs seeds across policies and is deterministic', () => {
    const argv = ['--all-policies', '--birth-sign', 'leo', '--runs', '3', '--seed', '9', '--strict'];
    const a = run(argv);
    expect(a.code, a.stderr).toBe(0);
    expect(run(argv).stdout).toBe(a.stdout);
  });

  it('replays a literal campaign seed with --trace-seed', () => {
    const r = run(['--policy', 'rotating', '--birth-sign', 'virgo', '--trace-seed', '777']);
    expect(r.code, r.stderr).toBe(0);
    expect(r.stdout).toContain('=== policy=rotating sign=virgo seed=777 ===');
    const config = loadContentConfig();
    const result = runCampaign({ seed: 777, sign: 'virgo', policy: rotatingPolicy('rotating'), config, trace: true });
    expect(r.stdout).toContain(formatTrace(result, config, 'policy=rotating sign=virgo seed=777'));
  });

  it('exports literal-seed events for each policy/sign, then clears stale events for --trace batches', () => {
    dir = mkdtempSync(join(tmpdir(), 'cli-'));
    const r = run(['--all-policies', '--birth-sign', 'virgo', '--birth-sign', 'aries',
      '--trace-seed', '777', '--out', 'reports'], dir);
    expect(r.code, r.stderr).toBe(0);
    const lines = readFileSync(join(dir, 'reports/events.ndjson'), 'utf8').trim().split('\n').map((line) => JSON.parse(line));
    expect(new Set(lines.map((line) => `${line.policy}:${line.birthSign}`)))
      .toEqual(new Set(['pragmatic:virgo', 'pragmatic:aries', 'rotating:virgo', 'rotating:aries']));
    const result = runCampaign({ seed: 777, sign: 'virgo', policy: rotatingPolicy('rotating'), config: loadContentConfig() });
    expect(lines.filter((line) => line.policy === 'rotating' && line.birthSign === 'virgo').map((line) => line.event))
      .toEqual(result.events);
    expect(lines.every((line) => line.seed === 777)).toBe(true);
    const plain = run(['--policy', 'rotating', '--birth-sign', 'virgo', '--trace', '--out', 'reports'], dir);
    expect(plain.code, plain.stderr).toBe(0);
    expect(existsSync(join(dir, 'reports/events.ndjson'))).toBe(false);
  });

  it('reports output failures with exit code 1', () => {
    dir = mkdtempSync(join(tmpdir(), 'cli-'));
    writeFileSync(join(dir, 'blocked'), 'existing file');
    const r = run(['--policy', 'rotating', '--birth-sign', 'aries', '--out', 'blocked'], dir);
    expect(r.code).toBe(1);
    expect(r.stderr).toContain('error:');
    expect(readFileSync(join(dir, 'blocked'), 'utf8')).toBe('existing file');
  });

  it('reports usage errors with exit code 2', () => {
    for (const argv of [
      ['--policy', 'nope', '--birth-sign', 'aries'],
      ['--policy', 'pragmatic', '--birth-sign', 'ophiuchus'],
      ['--policy', 'pragmatic', '--birth-sign', 'aries', '--variant', 'missing-variant'],
      ['--policy', 'pragmatic', '--birth-sign', 'aries', '--weeks', '3'],
    ]) {
      const r = run(argv);
      expect(r.code).toBe(2);
      expect(r.stderr).toMatch(/^error: [\s\S]*\n\nUsage:/);
    }
    expect(run(['--help']).stdout).toMatch(/^Usage:/);
  });

  it('fails clearly when no policies are registered', () => {
    const r = runCli(['--all-policies', '--birth-sign', 'aries'], { stdout: () => {}, stderr: () => {}, policies: {} });
    expect(r).toBe(2);
  });

  it('reports campaign errors with exit code 1', () => {
    const broken = { broken: (): Policy => ({ id: 'broken', params: {}, decide: () => ({ type: 'RETREAT' }) }) };
    const err: string[] = [];
    const code = runCli(['--policy', 'broken', '--birth-sign', 'aries'], { stdout: () => {}, stderr: (t) => err.push(t), policies: broken });
    expect(code).toBe(1);
    expect(err.join('\n')).toMatch(/Campaign policy=broken seed=\d+ sign=aries/);
  });
});

describe('pilgrimage trace', () => {
  it('labels each encounter with its locked segment moon across calendar boundaries', () => {
    const config = loadContentConfig();
    const result = runCampaign({ seed: 123, sign: 'aries', policy: rotatingPolicy('rotating'), config, trace: true });
    const encounters = result.decisions.filter((d) => d.action.type === 'CHOOSE_APPROACH');
    expect(encounters.length).toBeGreaterThan(0);
    for (const d of encounters) {
      const before = d.before!;
      const trace = formatTrace({ ...result, decisions: [d] }, config, 'encounter');
      expect(trace).toContain(`segment moon=${segmentLunarPhase(before, config)} (entry week ${before.pilgrimage!.segmentEntryWeek + 1})`);
    }
  });
});
