import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { hashConfig, withOverrides } from '../core/config.js';
import {
  buildSummary, readGitCommit, renderEventsNdjson, renderRunsCsv, renderSummaryMarkdown,
  writeReport, type ReportInput,
} from '../simulation/report.js';
import { runMetaFromConfig, runRecord } from '../simulation/metrics.js';
import { deriveBatchSeed, runCampaign, type Policy } from '../simulation/runner.js';
import { loadContentConfig } from './support/config.js';

const rules = withOverrides(loadContentConfig(), {
  calendar: { totalWeeks: 12 }, route: { regularSegments: 1, roadBonus: [20], encountersPerSegment: 3, finalEncounters: 8 },
  startingState: { baseStat: 35, treasury: 30, startingInventory: { saints_relic: 1, metheglin: 1 } },
});
const policy: Policy = {
  id: 'fixture-pilgrim', params: { carry: 'maximum' },
  decide(state, available) {
    const departure = available.find((a) => a.type === 'BEGIN_PILGRIMAGE');
    if (departure?.type === 'BEGIN_PILGRIMAGE') return {
      type: 'BEGIN_PILGRIMAGE', carry: departure.maxCarry,
      ...(departure.equipmentIds.includes('saints_relic') ? { equipmentId: 'saints_relic' } : {}),
      ...(departure.consumableIds.includes('metheglin') ? { consumableId: 'metheglin' } : {}),
    };
    for (const type of ['USE_CONSUMABLE', 'CHOOSE_APPROACH', 'ACCEPT_RESULT', 'CONTINUE_ENCOUNTER', 'CONTINUE_SEGMENT', 'RETURN_HOME', 'WORK', 'REST'] as const) {
      const action = available.find((a) => a.type === type && (a.type !== 'CHOOSE_APPROACH'
        || a.estate === (state.pilgrimage!.carriedCoin >= 15 ? 'laboratores' : 'bellatores')));
      if (action && action.type !== 'BEGIN_PILGRIMAGE') return action;
    }
    throw new Error('Fixture has no action');
  },
};
const results = Array.from({ length: 5 }, (_, index) => runCampaign({
  seed: deriveBatchSeed(123, 'aries', index), sign: 'aries', policy, config: rules, strict: true,
}));
const records = results.map((result) => runRecord(result.events, result.finalState,
  runMetaFromConfig(result.finalState, rules, { policy: policy.id })));
const input: ReportInput = {
  records, config: rules, gitCommit: '1111111111111111111111111111111111111111',
  args: ['--policy', policy.id, '--birth-sign', 'aries', '--runs', '5', '--seed', '123', '--strict', '--out', 'reports/golden'],
  policies: [{ id: policy.id, params: policy.params }],
};
const trace = { policy: policy.id, birthSign: 'aries' as const, seed: records[0]!.seed, events: results[0]!.events };
const fixtures = fileURLToPath(new URL('./fixtures/report/', import.meta.url));
const directories: string[] = [];
function temporaryDirectory() {
  const dir = mkdtempSync(join(tmpdir(), 'report-'));
  directories.push(dir);
  return dir;
}
afterEach(() => { for (const dir of directories.splice(0)) rmSync(dir, { recursive: true, force: true }); });

/** Small RFC-style parser verifies quoted JSON cells and embedded CR/LF intact. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let value = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (c === '"') {
      if (quoted && text[i + 1] === '"') { value += '"'; i++; }
      else quoted = !quoted;
    } else if (!quoted && (c === ',' || c === '\r' || c === '\n')) {
      row.push(value); value = '';
      if (c !== ',') { rows.push(row); row = []; if (c === '\r' && text[i + 1] === '\n') i++; }
    } else value += c;
  }
  return rows;
}

describe('E5 golden exports', () => {
  it('matches all three report files for a fixed five-run batch byte for byte', async () => {
    const dir = temporaryDirectory();
    writeReport(dir, input);
    expect(readdirSync(dir).sort()).toEqual(['runs.csv', 'summary.json', 'summary.md']);
    for (const name of ['runs.csv', 'summary.json', 'summary.md']) {
      await expect(readFileSync(join(dir, name), 'utf8')).toMatchFileSnapshot(join(fixtures, name));
    }
    expect(parseCsv(readFileSync(join(dir, 'runs.csv'), 'utf8'))).toHaveLength(6);
    const summary = JSON.parse(readFileSync(join(dir, 'summary.json'), 'utf8'));
    expect(summary.runCount).toBe(5);
    expect(summary.configId).toBe(hashConfig(rules));
    expect(summary.config).toEqual(rules);
    expect(summary.policies).toEqual(input.policies);
    expect(summary.unresolved.find((p: { path: string }) => p.path === 'classes.tutorBurden').value)
      .toEqual(rules.classes.tutorBurden);
  });

  it('matches tagged events for a literal debug seed and preserves event order', async () => {
    const dir = temporaryDirectory();
    writeReport(dir, { ...input, traces: [trace] });
    const events = readFileSync(join(dir, 'events.ndjson'), 'utf8');
    await expect(events).toMatchFileSnapshot(join(fixtures, 'events.ndjson'));
    const lines = events.trim().split('\n').map((line) => JSON.parse(line));
    expect(lines.map((line) => line.event)).toEqual(trace.events);
    expect(lines.map((line) => line.eventIndex)).toEqual(trace.events.map((_, index) => index));
    expect(lines[0]).toMatchObject({ policy: policy.id, birthSign: 'aries', seed: trace.seed, configId: hashConfig(rules) });
    const summary = JSON.parse(readFileSync(join(dir, 'summary.json'), 'utf8'));
    expect(summary.traces).toEqual([{ policy: policy.id, birthSign: 'aries', seed: trace.seed, eventCount: trace.events.length }]);
  });
});

describe('E5 format and metadata boundaries', () => {
  it('quotes commas, quotes, CR/LF and Unicode and preserves every per-run field', () => {
    const record = { ...records[0]!, policy: 'a,"b"\r\nScion 王女' };
    const [header, row] = parseCsv(renderRunsCsv([record]));
    expect(row).toHaveLength(header!.length);
    const cells = Object.fromEntries(header!.map((key, index) => [key, row![index]]));
    expect(cells.policy).toBe(record.policy);
    expect(JSON.parse(cells.jobs!)).toEqual(record.jobs);
    expect(JSON.parse(cells.treasuryByWeek!)).toEqual(record.treasuryByWeek);
    expect(cells['finalStats.bellatores']).toBe(String(record.finalStats.bellatores));
    expect(cells['weeks.segment_entry']).toBe(String(record.weeks.segment_entry));
    expect(cells.victoryWeek).toBe(record.victoryWeek === null ? '' : String(record.victoryWeek));
    expect(new Set(header!.map((column) => column.split('.')[0]))).toEqual(new Set(Object.keys(record)));
  });

  it('handles empty batches with a stable CSV schema and no flags', () => {
    const summary = buildSummary({ ...input, records: [] });
    expect(summary.runCount).toBe(0);
    expect(summary.aggregates).toEqual([]);
    expect(summary.flags).toEqual([]);
    expect(renderSummaryMarkdown(summary)).toContain('No diagnostic flags triggered.');
    expect(parseCsv(renderRunsCsv([]))).toHaveLength(1);
    expect(parseCsv(renderRunsCsv([]))[0]).toEqual(parseCsv(renderRunsCsv(records))[0]);
  });

  it('labels astrology from the effective settings, not provenance status (T4)', () => {
    const disabled = ['astrology.fullMoon.surge', 'astrology.newMoon.activityBonus', 'astrology.newMoon.skipFee'];
    const summary = buildSummary(input);
    expect(summary.astrology.label).toBe('partial astrology');
    expect(summary.astrology.disabledParameters).toEqual(disabled);
    // Legacy field: the defaults no longer mark these controls tbd.
    expect(summary.astrology.disabledTbdParameters).toEqual([]);
    expect(renderSummaryMarkdown(summary)).toContain('**partial astrology**');
    const tbd = withOverrides(rules, { provenance: Object.fromEntries(disabled.map((p) => [p, { status: 'tbd', note: 'x' }])) });
    expect(buildSummary({ ...input, records: [], config: tbd }).astrology.disabledTbdParameters).toEqual(disabled);
    const enabled = withOverrides(rules, { astrology: { fullMoon: { surge: 5 }, newMoon: { activityBonus: 5, skipFee: 5 } } });
    expect(buildSummary({ ...input, records: [], config: enabled }).astrology).toMatchObject({
      label: 'configured astrology', disabledParameters: [], disabledTbdParameters: [],
    });
    // Confirming a disabled control's status must not make it look configured.
    const confirmed = withOverrides(rules, { provenance: {
      'astrology.fullMoon.surge': { status: 'confirmed' },
      'astrology.newMoon.activityBonus': { status: 'confirmed' },
      'astrology.newMoon.skipFee': { status: 'confirmed' },
    } });
    expect(buildSummary({ ...input, records: [], config: confirmed }).astrology).toMatchObject({
      label: 'partial astrology', disabledParameters: disabled,
    });
    const onlySkip = withOverrides(rules, { astrology: { fullMoon: { surge: 5 }, newMoon: { activityBonus: 5 } } });
    expect(buildSummary({ ...input, records: [], config: onlySkip }).astrology.disabledParameters)
      .toEqual(['astrology.newMoon.skipFee']);
  });

  it('flags affected runs per policy × sign, without double-counting pooled rows', () => {
    const anomalous = { ...records[0]!, outcome: 'unfinished' as const, zeroTreasuryWeeks: 1, homeCollapses: 2,
      medicalFeeShortfalls: 1, physicianFeeShortfalls: 1, wipeouts: 2, failedDepartureAttempts: 3, failureAttribution: 'resource_loop' as const };
    const summary = buildSummary({ ...input, records: [anomalous, { ...anomalous, birthSign: 'gemini' },
      { ...records[1]!, policy: 'other' }] });
    expect(summary.aggregates.map((r) => `${r.policy}:${r.birthSign}`))
      .toEqual(['fixture-pilgrim:aries', 'fixture-pilgrim:gemini', 'fixture-pilgrim:all', 'other:aries', 'other:all']);
    expect(summary.flags.filter((f) => f.code === 'home_collapse')).toEqual([
      expect.objectContaining({ birthSign: 'aries', runs: 1 }), expect.objectContaining({ birthSign: 'gemini', runs: 1 }),
    ]);
    for (const code of ['unfinished', 'zero_treasury', 'medical_fee_shortfall', 'physician_fee_shortfall', 'resource_loop', 'failed_departure']) {
      expect(summary.flags.some((flag) => flag.code === code)).toBe(true);
    }
    expect(summary.flags.every((flag) => flag.birthSign !== ('all' as string))).toBe(true);
  });

  it('escapes table cells and quotes the original CLI args in the reproduction command', () => {
    const summary = buildSummary({ ...input, records: [{ ...records[0]!, policy: 'pipe|policy\nnext' }],
      args: ['--config', "config path/it's.json"] });
    const markdown = renderSummaryMarkdown(summary);
    expect(markdown).toContain('pipe\\|policy<br>next');
    expect(markdown).toContain("npm run sim -- --config 'config path/it'\\''s.json'");
    expect(summary.args).toEqual(['--config', "config path/it's.json"]);
  });

  it('discovers Git when available and handles source archives without it', () => {
    expect(readGitCommit(dirname(fileURLToPath(import.meta.url)))).toMatch(/^[a-f0-9]{40,64}$/);
    const dir = temporaryDirectory();
    expect(readGitCommit(dir)).toBeNull();
    writeReport('output', { ...input, gitCommit: null }, dir);
    const summary = JSON.parse(readFileSync(join(dir, 'output/summary.json'), 'utf8'));
    expect(summary.gitCommit).toBeNull();
    expect(renderSummaryMarkdown(summary)).toContain('Git commit: unavailable.');
    writeReport('discovered', { ...input, gitCommit: undefined }, dir);
    const discovered = JSON.parse(readFileSync(join(dir, 'discovered/summary.json'), 'utf8'));
    expect(discovered.gitCommit).toBe(readGitCommit(dirname(fileURLToPath(import.meta.url))));
  });

  it('rejects config mismatches before writing files', () => {
    const dir = temporaryDirectory();
    expect(() => writeReport(dir, { ...input, records: [{ ...records[0]!, configId: 'wrong' }] }))
      .toThrow('effective config');
    expect(readdirSync(dir)).toEqual([]);
  });

  it('distinguishes shared debug seeds and removes stale events from reused directories', () => {
    const dir = temporaryDirectory();
    const traces = [trace, { ...trace, policy: 'other', birthSign: 'gemini' as const }];
    const lines = renderEventsNdjson(traces, hashConfig(rules)).trim().split('\n').map((line) => JSON.parse(line));
    expect(lines[trace.events.length]).toMatchObject({ policy: 'other', birthSign: 'gemini', seed: trace.seed, eventIndex: 0 });
    expect(renderEventsNdjson([], hashConfig(rules))).toBe('');
    writeReport(dir, { ...input, traces });
    expect(readdirSync(dir)).toContain('events.ndjson');
    writeReport(dir, input);
    expect(readdirSync(dir)).not.toContain('events.ndjson');
  });
});
