import { readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { hashConfig, type RulesConfig } from '../core/config.js';
import type { AvailableAction, GameAction } from '../core/index.js';
import { loadCliConfig, parseCliArgs, UsageError } from '../simulation/cli.js';
import { runCampaign, type Policy } from '../simulation/runner.js';
import { loadContentConfig, readContentJson } from './support/config.js';

const names = readdirSync(new URL('../../content/variants/', import.meta.url))
  .filter((file) => file.endsWith('.json'))
  .map((file) => file.slice(0, -'.json'.length))
  .sort();
const base = loadContentConfig();
const load = (name: string): RulesConfig => loadContentConfig(`variants/${name}.json`);

/** Dotted paths of every leaf value that differs from the base config. */
function changedLeaves(a: unknown, b: unknown, path = ''): string[] {
  if (typeof a === 'object' && a !== null && typeof b === 'object' && b !== null && !Array.isArray(a)) {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    return [...keys].flatMap((k) =>
      changedLeaves((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k], path ? `${path}.${k}` : k));
  }
  return JSON.stringify(a) === JSON.stringify(b) ? [] : [path];
}

/** Deterministic smoke policy: rotates through whatever is offered. */
function rotating(): Policy {
  let turn = 0;
  return {
    id: 'rotating',
    params: {},
    decide(_state, available: readonly AvailableAction[]): GameAction {
      const choice = available[turn++ % available.length]!;
      return choice.type === 'BEGIN_PILGRIMAGE' ? { type: 'BEGIN_PILGRIMAGE', carry: choice.minCarry } : choice;
    },
  };
}

describe('E6 configuration variants', () => {
  it('ships every named variant', () => {
    expect(names).toEqual([
      'astrology-full', 'final-n10', 'final-n6', 'final-n8', 'final-road-10', 'final-road-20', 'final-road-30',
      'items-test-table', 'road-flat', 'road-steep', 'route-4', 'route-5', 'route-6', 'weeks-48',
    ]);
  });

  it('validates every variant, names it after its file, and gives each a distinct hash', () => {
    const hashes = new Map<string, string>([[hashConfig(base), 'default']]);
    for (const name of names) {
      const config = load(name);
      expect(config.id).toBe(name);
      const hash = hashConfig(config);
      expect(hashes.get(hash), `${name} collides with ${hashes.get(hash)}`).toBeUndefined();
      hashes.set(hash, name);
    }
  });

  it.each(names)('%s documents every value it changes in provenance as non-confirmed', (name) => {
    const overlay = readContentJson(`variants/${name}.json`) as { provenance?: Record<string, unknown> };
    const config = load(name);
    const changed = changedLeaves(base, config).filter((p) => p !== 'id' && !p.startsWith('provenance.'));
    for (const path of changed) {
      const documented = Object.keys(overlay.provenance ?? {}).find((p) => path === p || path.startsWith(`${p}.`));
      expect(documented, `${name}: ${path} lacks a provenance entry`).toBeDefined();
      expect(config.provenance[documented!]!.status).not.toBe('confirmed');
    }
  });

  it.each(names)('%s plays a full campaign under strict invariants', (name) => {
    const config = load(name);
    const { finalState } = runCampaign({ seed: 42, sign: 'aries', policy: rotating(), config, strict: true });
    expect(['victory', 'defeat']).toContain(finalState.phase);
  });

  it.each(names)('%s loads by name through the CLI over the experimental baseline', (name) => {
    const config = loadCliConfig(parseCliArgs(['--all-policies', '--all-signs',
      '--config', 'content/rules.experimental.json', '--variant', name]));
    expect(hashConfig(config)).toBe(hashConfig(loadContentConfig('rules.experimental.json', `variants/${name}.json`)));
  });

  it.each(['road-flat', 'road-steep'])('%s stacks with route variants in CLI argument order', (curve) => {
    for (const length of [4, 6]) {
      const args = ['--all-policies', '--all-signs'];
      expect(() => loadCliConfig(parseCliArgs([...args, '--variant', `route-${length}`, '--variant', curve])))
        .toThrow(UsageError);
      expect(() => loadCliConfig(parseCliArgs([...args, '--variant', `route-${length}`, '--variant', curve])))
        .toThrow(/roadBonus: has 5 entries/);
      const reversed = loadCliConfig(parseCliArgs([...args, '--variant', curve, '--variant', `route-${length}`]));
      expect(reversed.route).toEqual(load(`route-${length}`).route);
    }
    expect(loadContentConfig('variants/route-5.json', `variants/${curve}.json`).route.roadBonus)
      .toEqual(load(curve).route.roadBonus);
  });

  it('combines independent sensitivity settings through the CLI', () => {
    const variants = ['route-6', 'final-n10', 'final-road-30', 'items-test-table', 'astrology-full', 'weeks-48'];
    const config = loadCliConfig(parseCliArgs(['--all-policies', '--all-signs',
      ...variants.flatMap((name) => ['--variant', name])]));
    expect(config.route).toMatchObject({ regularSegments: 6, finalEncounters: 10, finalRoadBonus: -30 });
    expect(config.items.acquisition).toBe('test_table');
    expect(config.astrology.newMoon).toMatchObject({ activityBonus: 10, skipFee: 10 });
    expect(config.astrology.fullMoon.surge).toBe(10);
    expect(config.calendar.totalWeeks).toBe(48);
    const result = runCampaign({ seed: 42, sign: 'aries', policy: rotating(), config, strict: true });
    expect(['victory', 'defeat']).toContain(result.finalState.phase);
  });

  it('route lengths keep the linear +40 → +0 road bonus', () => {
    expect(load('route-4').route).toMatchObject({ regularSegments: 4, roadBonus: [40, 26, 13, 0] });
    expect(load('route-5').route).toMatchObject({ regularSegments: 5, roadBonus: base.route.roadBonus });
    expect(load('route-6').route).toMatchObject({ regularSegments: 6, roadBonus: [40, 32, 24, 16, 8, 0] });
  });

  it('flat and steep road curves keep the default mean and order', () => {
    const mean = (xs: readonly number[]): number => xs.reduce((a, b) => a + b, 0) / xs.length;
    const flat = load('road-flat').route.roadBonus;
    const steep = load('road-steep').route.roadBonus;
    expect(mean(flat)).toBe(mean(base.route.roadBonus));
    expect(mean(steep)).toBe(mean(base.route.roadBonus));
    expect(flat[0]! - flat.at(-1)!).toBeLessThan(base.route.roadBonus[0]!);
    expect(steep[0]! - steep.at(-1)!).toBeGreaterThan(base.route.roadBonus[0]!);
  });

  it('sets the final gauntlet sizes and road bonuses', () => {
    expect([6, 8, 10].map((n) => load(`final-n${n}`).route.finalEncounters)).toEqual([6, 8, 10]);
    expect([10, 20, 30].map((b) => load(`final-road-${b}`).route.finalRoadBonus)).toEqual([-10, -20, -30]);
  });

  it('astrology-full turns on every TBD lunar bonus; weeks-48 halves the calendar', () => {
    const { newMoon, fullMoon } = load('astrology-full').astrology;
    expect(newMoon.activityBonus).toBeGreaterThan(0);
    expect(newMoon.skipFee).not.toBeNull();
    expect(fullMoon.surge).toBeGreaterThan(0);
    expect(load('weeks-48').calendar.totalWeeks).toBe(48);
  });
});
