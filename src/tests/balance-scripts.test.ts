import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { hashConfig } from '../core/config.js';
import {
  BASELINE, BUDGET_SPECS, configIds, FLOOR_SPECS, loadStageConfig, PRESET_SPECS, PUBLISHED_SPECS, runTask, STAGE1_CONFIGS,
  stagePlan,
} from '../../scripts/balance-testing/stages.js';
import { loadContentConfig } from './support/config.js';

const dir = mkdtempSync(join(tmpdir(), 'balance-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe('B3 stage scripts', () => {
  it('plans stage 0 on the baseline and the stage 1 S3 × S4 grid', () => {
    expect(hashConfig(loadStageConfig(BASELINE))).toBe(hashConfig(loadContentConfig('rules.experimental.json')));
    expect(STAGE1_CONFIGS.map((c) => c.name)).toEqual(['baseline', 'opp1-dis60', 'opp1-dis50', 'opp0-dis75', 'opp0-dis60',
      'opp0-dis50']);
    const grid = STAGE1_CONFIGS.map(loadStageConfig);
    expect(grid.map((c) => `${c.classes.tutors.hermit.opposingLoss}/${c.encounters.matchupPct.disadvantage}`))
      .toEqual(['1/75', '1/60', '1/50', '0/75', '0/60', '0/50']);
    expect(new Set(Object.values(configIds(1))).size).toBe(6);
    expect(stagePlan(0)).toHaveLength(PUBLISHED_SPECS.length + PRESET_SPECS.length + FLOOR_SPECS.length + BUDGET_SPECS.length);
    expect(stagePlan(1)).toHaveLength(5 * (PRESET_SPECS.length + BUDGET_SPECS.length));
    expect(FLOOR_SPECS).toHaveLength(27);
    // Budget shapes spend the same cap: lessons sum to budget / 20.
    for (const spec of BUDGET_SPECS) {
      const { mainTarget, secondaryTarget, thirdTarget, tutorBudget } = spec.overrides!;
      const lessons = [mainTarget!, secondaryTarget!, thirdTarget!].map((t) => (t ? (t - 15) / 5 : 0))
        .reduce((a: number, b: number) => a + b, 0);
      expect(lessons * 20, spec.name).toBe(tutorBudget);
    }
  });

  it('runs a task on paired seeds and the analysis renders every section at small N', () => {
    const records = runTask(stagePlan(0).find((t) => t.policy.name === 'hybrid-o@floor30')!,
      { runs: 2, seed: 1, strict: true, signs: ['leo', 'virgo'] });
    expect(records.map((r) => r.birthSign)).toEqual(['leo', 'leo', 'virgo', 'virgo']);
    expect(records.every((r) => r.policy === 'hybrid-o@floor30' && r.lead === 'oratores')).toBe(true);
    for (const r of records.filter((x) => x.outcome === 'victory')) expect(r.minFinalStat).toBeGreaterThanOrEqual(30);

    // A full stage 0 at 2 runs × 1 sign; pairs need n ≥ 2.
    const out = join(dir, 'stage0');
    mkdirSync(join(out, 'baseline'), { recursive: true });
    writeFileSync(join(out, 'manifest.json'), JSON.stringify({ stage: 0, runs: 2, seed: 1, strict: false, git: null,
      configIds: configIds(0) }));
    const config = loadStageConfig(BASELINE);
    for (const task of stagePlan(0)) {
      const rs = runTask(task, { runs: 2, seed: 1, strict: false, signs: ['aries'] }, config);
      writeFileSync(join(out, 'baseline', `${task.policy.name}.ndjson`), rs.map((r) => JSON.stringify(r)).join('\n') + '\n');
    }
    const md = execFileSync(process.execPath, ['--import', 'tsx', 'scripts/balance-testing/analyze.ts', '--stage0', out],
      { encoding: 'utf8' });
    for (const heading of ['## Stage 0: shapes on the baseline', '### Deliberate price', '## Stage 0: budget-matched builds',
      '## Stage 0: Coin loophole', '## Success criteria scorecard']) expect(md).toContain(heading);
    expect(md).toMatch(/^\| hybrid-b@?/m);
  }, 60_000);
});
