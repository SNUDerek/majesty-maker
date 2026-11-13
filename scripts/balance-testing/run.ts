/**
 * B3 stage runner. Runs every config × policy task of a stage in parallel child
 * processes and writes <out>/<config>/<policy>.ndjson (one BalanceRecord per line)
 * plus <out>/manifest.json.
 *
 *   npx tsx scripts/balance-testing/run.ts --stage 0 --out reports/balance/stage0 [--runs 1000] [--jobs 15]
 *   npx tsx scripts/balance-testing/run.ts --stage 1 --out reports/balance/stage1
 *
 * Strict invariants are on unless --no-strict is given.
 */
import { execFileSync, spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { availableParallelism } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { configIds, findTask, runTask, SEARCH_SEED, stagePlan } from './stages.js';

const { values } = parseArgs({ options: {
  stage: { type: 'string' }, out: { type: 'string' }, runs: { type: 'string' }, seed: { type: 'string' },
  jobs: { type: 'string' }, task: { type: 'string', multiple: true }, 'no-strict': { type: 'boolean' },
} });
const stage = Number(values.stage) as 0 | 1;
if (stage !== 0 && stage !== 1) throw new Error('--stage must be 0 or 1');
const out = resolve(values.out ?? `reports/balance/stage${stage}`);
const runs = Number(values.runs ?? 1000);
const seed = Number(values.seed ?? SEARCH_SEED);
const strict = !values['no-strict'];
if (!Number.isSafeInteger(runs) || runs < 2 || !Number.isSafeInteger(seed)) throw new Error('bad --runs or --seed');

if (values.task) {
  // Worker: --task <config> --task <policy>
  const [configName, policyName] = values.task as [string, string];
  const records = runTask(findTask(stage, configName, policyName), { runs, seed, strict });
  mkdirSync(join(out, configName), { recursive: true });
  writeFileSync(join(out, configName, `${policyName}.ndjson`), records.map((r) => JSON.stringify(r)).join('\n') + '\n');
} else {
  const tasks = stagePlan(stage);
  const jobs = Number(values.jobs ?? Math.max(1, availableParallelism() - 1));
  if (!Number.isSafeInteger(jobs) || jobs < 1) throw new Error('--jobs must be a positive integer');
  mkdirSync(out, { recursive: true });
  let git: string | null = null;
  let dirty: boolean | null = null;
  try {
    git = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
    dirty = execFileSync('git', ['status', '--porcelain', '--', 'src', 'scripts', 'content'], { encoding: 'utf8' }).trim() !== '';
  } catch { /* not a checkout */ }
  const manifest = {
    stage, runs, seed, strict, git, dirty, configIds: configIds(stage), startedAt: new Date().toISOString(),
    tasks: tasks.map((t) => ({ config: t.config.name, overlays: t.config.overlays, policy: t.policy })),
  };
  const writeManifest = (status: 'running' | 'complete' | 'failed') =>
    writeFileSync(join(out, 'manifest.json'), JSON.stringify({ ...manifest, status }, null, 2) + '\n');
  writeManifest('running');
  const script = fileURLToPath(import.meta.url);
  let next = 0, done = 0, failed = 0;
  const started = Date.now();
  await new Promise<void>((finish) => {
    const launch = (): void => {
      if (next >= tasks.length) {
        if (done === tasks.length) finish();
        return;
      }
      const t = tasks[next++]!;
      const args = ['--import', 'tsx', script, '--stage', String(stage), '--out', out, '--runs', String(runs),
        '--seed', String(seed), '--task', t.config.name, '--task', t.policy.name, ...(strict ? [] : ['--no-strict'])];
      const child = spawn(process.execPath, args, { stdio: ['ignore', 'inherit', 'inherit'] });
      child.on('exit', (code) => {
        done += 1;
        if (code !== 0) {
          failed += 1;
          console.error(`FAILED ${t.config.name}/${t.policy.name} (exit ${code})`);
        }
        console.log(`[${done}/${tasks.length}] ${t.config.name}/${t.policy.name} ${((Date.now() - started) / 1000).toFixed(0)}s`);
        launch();
      });
    };
    for (let i = 0; i < Math.min(jobs, tasks.length); i++) launch();
  });
  writeManifest(failed ? 'failed' : 'complete');
  if (failed) {
    console.error(`${failed} task(s) failed`);
    process.exitCode = 1;
  }
}
