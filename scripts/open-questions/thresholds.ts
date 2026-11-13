// T6 policy-threshold sensitivity: pragmatic/balanced with trainingReserve 60, paired seeds.
import { readFileSync } from 'node:fs';
import { loadConfig } from '../../src/core/config.ts';
import { createPolicy } from '../../src/simulation/policies.ts';
import { deriveBatchSeed, runCampaign } from '../../src/simulation/runner.ts';
const j = (p: string) => JSON.parse(readFileSync(new URL('../../' + p, import.meta.url), 'utf8'));
const base = { rules: j('content/rules.default.json'), items: j('content/items.json') };
const configs: Record<string, string[]> = {
  control: [], 'q4-waxing': ['content/experiments/open-questions/q4-waxing.json'],
  'q12-home-20': ['content/experiments/open-questions/q12-home-20.json'],
  candidate: ['content/variants/open-questions-decisions.json'],
  'cand-n10-road30': ['content/variants/open-questions-decisions.json', 'content/variants/final-n10.json', 'content/variants/final-road-30.json'],
};
const SIGNS = ['aries','taurus','gemini','cancer','leo','virgo','libra','scorpio','sagittarius','capricorn','aquarius','pisces'] as const;
const RUNS = Number(process.argv[2] ?? 1000);
if (!Number.isSafeInteger(RUNS) || RUNS < 2) throw new RangeError('runs must be an integer >= 2');
const wins: Record<string, Record<string, boolean[]>> = {};
for (const [name, variants] of Object.entries(configs)) {
  const config = loadConfig({ ...base, variants: variants.map(j) });
  for (const id of ['pragmatic', 'balanced'] as const) {
    const policy = createPolicy(id, config, { trainingReserve: 60 });
    const out: boolean[] = [];
    let weeks = 0, wipe = 0;
    for (const sign of SIGNS) for (let i = 0; i < RUNS; i++) {
      const r = runCampaign({ seed: deriveBatchSeed(20261113, sign, i), sign, policy, config, strict: true });
      out.push(r.finalState.outcome === 'victory');
      if (r.finalState.outcome === 'victory') weeks += r.finalState.elapsedWeeks;
      wipe += r.events.filter((e) => e.type === 'wipeout').length;
    }
    (wins[name] ??= {})[id] = out;
    const w = out.filter(Boolean).length;
    let diff = '';
    if (name !== 'control') {
      const c = wins.control![id]!; const d = out.map((v, k) => Number(v) - Number(c[k]));
      const m = d.reduce((a, b) => a + b, 0) / d.length;
      const sd = Math.sqrt(d.reduce((a, b) => a + (b - m) ** 2, 0) / (d.length - 1));
      const h = 1.96 * sd / Math.sqrt(d.length);
      diff = ` diff ${(m*100).toFixed(1)}pp [${((m-h)*100).toFixed(1)}, ${((m+h)*100).toFixed(1)}]`;
    }
    console.log(`| ${name} | ${id} | ${(100*w/out.length).toFixed(1)}% | ${w ? (weeks/w).toFixed(1) : '-'} | ${(wipe/out.length).toFixed(2)} |${diff}`);
  }
}
