import { describe, expect, it } from 'vitest';
import { withOverrides } from '../core/index.js';
import {
  TUTORIAL_SEEN_KEY, markTutorialSeen, pilgrimageTutorial, tutorialSeen,
} from '../ui/engine/tutorial.js';
import type { SaveStorage } from '../ui/engine/persistence.js';
import { loadShippedConfig } from './support/config.js';

const config = loadShippedConfig();
const text = (pages: ReturnType<typeof pilgrimageTutorial>) => pages.map((p) => p.paragraphs.join(' '));

function memory(): SaveStorage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => { data.set(k, v); },
    removeItem: (k) => { data.delete(k); },
  };
}

const broken: SaveStorage = {
  getItem: () => { throw new Error('blocked'); },
  setItem: () => { throw new Error('blocked'); },
  removeItem: () => { throw new Error('blocked'); },
};

describe('pilgrimage tutorial pages', () => {
  it('has the four planned pages in order', () => {
    expect(pilgrimageTutorial(config).map((p) => p.title))
      .toEqual(['The road', 'The three orders', 'Failure', 'Moon and retreat']);
  });

  it('states the shipped numbers', () => {
    const [road, orders, failure, moon] = text(pilgrimageTutorial(config));
    expect(road).toContain('passes 5 waystations, then the Final Gauntlet');
    expect(road).toContain('holds 5 encounters; the Final Gauntlet holds 10');
    expect(road).toContain('10 Coin fee');
    expect(road).toContain('+40%, +30%, +20%, +10%, 0%');
    expect(road).toContain('−30% in the Final Gauntlet');
    expect(orders).toContain('counts ×1.5');
    expect(orders).toContain('Even (×1)');
    expect(orders).toContain('Disadvantage (×0.75)');
    expect(orders).toContain('between 5% and 95%');
    expect(orders).toContain('1–4 carried Coin');
    expect(failure).toContain('costs 15 of the burden');
    expect(failure).toContain('Bellatores → Fatigue, Oratores → Melancholy, Laboratores → carried Coin');
    expect(failure).toContain('medical fee of up to 50 Coin');
    expect(failure).toContain('convalesces for 1 week, recovering 35 of each burden per week');
    expect(failure).toContain('shrinks the Coin lost on failed Laboratores checks');
    expect(moon).toContain('bribe past one encounter for 10 carried Coin');
    expect(moon).toContain('advantage ×2');
    expect(moon).toContain('strain ×2');
    expect(moon).toContain('50% of the loot, pays a 10 Coin toll');
  });

  it('draws the triangle from encounters.beats', () => {
    expect(pilgrimageTutorial(config)[1]!.beats).toEqual([
      { winner: 'bellatores', loser: 'laboratores' },
      { winner: 'oratores', loser: 'bellatores' },
      { winner: 'laboratores', loser: 'oratores' },
    ]);
  });

  it('follows config overrides rather than hard-coded numbers', () => {
    const changed = withOverrides(config, {
      route: { departureFee: 25 },
      encounters: { matchupPct: { advantage: 175 }, failurePenalty: 20 },
      failure: { retreatToll: 3, purseProtection: { appliesToLabFailures: false } },
      astrology: { newMoon: { skipFee: null } },
    });
    const [road, orders, failure, moon] = text(pilgrimageTutorial(changed));
    expect(road).toContain('25 Coin fee');
    expect(orders).toContain('counts ×1.75');
    expect(failure).toContain('costs 20 of the burden');
    expect(failure).not.toContain('shrinks the Coin');
    expect(moon).toContain('New Moon: no effect on the road');
    expect(moon).toContain('3 Coin toll');
  });
});

describe('tutorial seen flag', () => {
  it('is unset until marked, then stays set', () => {
    const storage = memory();
    expect(tutorialSeen(storage)).toBe(false);
    markTutorialSeen(storage);
    expect(storage.data.get(TUTORIAL_SEEN_KEY)).toBe('1');
    expect(tutorialSeen(storage)).toBe(true);
  });

  it('treats missing or failing storage as "show it"', () => {
    expect(tutorialSeen(null)).toBe(false);
    expect(tutorialSeen(broken)).toBe(false);
    expect(() => markTutorialSeen(broken)).not.toThrow();
    expect(() => markTutorialSeen(null)).not.toThrow();
  });
});
