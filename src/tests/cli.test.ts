import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { AvailableAction, GameAction } from '../core/index.js';
import { hashConfig } from '../core/config.js';
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

  it('reports usage errors with exit code 2', () => {
    for (const argv of [
      ['--policy', 'nope', '--birth-sign', 'aries'],
      ['--policy', 'pragmatic', '--birth-sign', 'ophiuchus'],
      ['--policy', 'pragmatic', '--birth-sign', 'aries', '--variant', 'missing-variant'],
    ]) {
      const r = run(argv);
      expect(r.code).toBe(2);
      expect(r.stderr).toMatch(/^error: .*\n\nUsage:/);
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
