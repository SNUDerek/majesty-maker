import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createRngStreams } from '../core/rng.js';
import type { CampaignState, PilgrimageState } from '../core/types.js';
import { assertInvariants, checkInvariants, InvariantError } from './invariants.js';
import { loadContentConfig } from './support/config.js';

const config = loadContentConfig();
const { regularSegments, encountersPerSegment, finalEncounters } = config.route;

/** A legal week-10 home state (hand-built until C1's createCampaign lands). */
function homeState(overrides: Partial<CampaignState> = {}): CampaignState {
  return {
    version: 1,
    seed: 123,
    rng: createRngStreams(123),
    playerName: { first: 'Ada', last: 'Fen' },
    scionName: 'Wren',
    birthSign: 'aries',
    elapsedWeeks: 10,
    stats: { bellatores: 20, oratores: 15, laboratores: 15 },
    fatigue: 10,
    melancholy: 5,
    treasury: 50,
    inventory: { theriac: 1 },
    furthestWaystation: 1,
    phase: 'home',
    waxingStreak: 0,
    lastWeeklyActivityId: 'stables',
    ...overrides,
  };
}

/** A legal mid-segment pilgrimage state at checkpoint 1, choosing an approach. */
function pilgrimageState(
  pilgrimage: Partial<PilgrimageState> = {},
  overrides: Partial<CampaignState> = {},
): CampaignState {
  return homeState({
    phase: 'pilgrimage',
    elapsedWeeks: 11,
    pilgrimage: {
      stage: 'choose_approach',
      segmentIndex: 1,
      encounterIndex: 2,
      carriedCoin: 12,
      departureCarriedCoin: 10,
      earnedCoin: 4,
      skipUsed: false,
      consumableUsed: false,
      isFinal: false,
      segmentEntryWeek: 10,
      equipmentId: 'gambeson',
      consumableId: 'metheglin',
      currentThreat: 'oratores',
      ...pilgrimage,
    },
    ...overrides,
  });
}

/** Ids of the violations, e.g. ['treasury.range']. */
function ids(state: unknown, prev?: unknown): string[] {
  return checkInvariants(state as CampaignState, config, prev as CampaignState | undefined).map(
    (message) => /^\[([^\]]+)\]/u.exec(message)?.[1] ?? message,
  );
}

function expectOnly(id: string, state: unknown, prev?: unknown): void {
  const found = ids(state, prev);
  expect(found.length).toBeGreaterThan(0);
  expect(new Set(found)).toEqual(new Set([id]));
}

describe('valid states', () => {
  const valid: Array<[string, CampaignState]> = [
    ['home', homeState()],
    ['fresh campaign at week 0', homeState({ elapsedWeeks: 0, furthestWaystation: 0, inventory: {}, lastWeeklyActivityId: undefined })],
    ['home with a pending convalescence over the ceiling', homeState({ fatigue: 90, pendingConvalescence: 'home_collapse' })],
    ['pilgrimage choosing an approach', pilgrimageState()],
    ['pilgrimage at encounter 0 before the reveal', pilgrimageState({ stage: 'encounter_reveal', encounterIndex: 0, currentThreat: undefined })],
    ['pilgrimage after a resolved encounter', pilgrimageState({ stage: 'continue_or_retreat', lastRoll: 40, lastProbability: 55 })],
    ['Metheglin reaction window', pilgrimageState({ stage: 'reroll_or_accept', currentApproach: 'bellatores', lastRoll: 80, lastProbability: 30, pendingFailure: true })],
    ['waystation after completing a segment', pilgrimageState({ stage: 'waystation_decision', encounterIndex: encountersPerSegment }, { furthestWaystation: 2 })],
    ['final gauntlet', pilgrimageState({ isFinal: true, segmentIndex: regularSegments, encounterIndex: finalEncounters - 1 }, { furthestWaystation: regularSegments })],
    ['segment entered in week 96', pilgrimageState({ segmentEntryWeek: 95 }, { elapsedWeeks: 96 })],
    ['victory in week 96', homeState({ phase: 'victory', outcome: 'victory', elapsedWeeks: 96, furthestWaystation: regularSegments })],
    ['deadline defeat', homeState({ phase: 'defeat', outcome: 'deadline', elapsedWeeks: 96 })],
    ['defeat with burdens still collapsed', homeState({ phase: 'defeat', outcome: 'deadline', elapsedWeeks: 96, fatigue: 99 })],
    ['zero treasury and carried Coin', pilgrimageState({ carriedCoin: 0 }, { treasury: 0 })],
    ['treasury at the cap', homeState({ treasury: config.startingState.treasuryMax })],
  ];

  it.each(valid)('%s has no violations', (_name, state) => {
    expect(checkInvariants(state, config)).toEqual([]);
    expect(() => assertInvariants(state, config)).not.toThrow();
  });

  const transitions: Array<[string, CampaignState, CampaignState]> = [
    ['a home week', homeState(), homeState({ elapsedWeeks: 11 })],
    ['a home collapse plus forced convalescence', homeState(), homeState({ elapsedWeeks: 12 })],
    ['departure from home', homeState(), pilgrimageState({ stage: 'encounter_reveal', encounterIndex: 0, currentThreat: undefined })],
    ['an encounter inside a segment', pilgrimageState(), pilgrimageState({ stage: 'continue_or_retreat', encounterIndex: 3 })],
    [
      'continuing from a waystation',
      pilgrimageState({ stage: 'waystation_decision', encounterIndex: encountersPerSegment }, { furthestWaystation: 2 }),
      pilgrimageState({ stage: 'encounter_reveal', segmentIndex: 2, encounterIndex: 0, currentThreat: undefined, segmentEntryWeek: 11 }, { elapsedWeeks: 12, furthestWaystation: 2 }),
    ],
    ['a retreat', pilgrimageState(), homeState({ elapsedWeeks: 11 })],
    ['a wipeout with convalescence', pilgrimageState(), homeState({ elapsedWeeks: 12, fatigue: 0, melancholy: 0 })],
  ];

  it.each(transitions)('%s is a legal transition', (_name, prev, next) => {
    expect(checkInvariants(next, config, prev)).toEqual([]);
  });
});

describe('broken states', () => {
  const broken: Array<[string, string, unknown]> = [
    // Identity and integer types.
    ['state.shape', 'state is not an object', null],
    ['state.version', 'unknown version', { ...homeState(), version: 2 }],
    ['state.seed', 'fractional seed', homeState({ seed: 1.5 })],
    ['state.birthSign', 'unknown birth sign', { ...homeState(), birthSign: 'ophiuchus' }],
    ['state.playerName', 'missing player surname', { ...homeState(), playerName: { first: 'Ada' } }],
    ['state.scionName', 'missing scion name', { ...homeState(), scionName: undefined }],
    ['state.lastWeeklyActivityId', 'unknown last activity', { ...homeState(), lastWeeklyActivityId: 'jousting' }],
    ['state.waxingStreak', 'negative waxing streak', homeState({ waxingStreak: -1 })],
    // RNG.
    ['rng.shape', 'missing RNG stream', { ...homeState(), rng: { jobs: 1, encounters: 2 } }],
    ['rng.shape', 'extra RNG stream', { ...homeState(), rng: { ...createRngStreams(1), loot: 3 } }],
    ['rng.uint32', 'RNG state above uint32', { ...homeState(), rng: { ...createRngStreams(1), jobs: 2 ** 32 } }],
    ['rng.uint32', 'negative RNG state', { ...homeState(), rng: { ...createRngStreams(1), rewards: -1 } }],
    ['rng.uint32', 'present but undefined RNG state', { ...homeState(), rng: { ...createRngStreams(1), jobs: undefined } }],
    // Stats, burdens, Coin.
    ['stats.range', 'stat above 100', homeState({ stats: { bellatores: 101, oratores: 15, laboratores: 15 } })],
    ['stats.range', 'negative stat', homeState({ stats: { bellatores: 15, oratores: -1, laboratores: 15 } })],
    ['stats.range', 'fractional stat', homeState({ stats: { bellatores: 15, oratores: 15, laboratores: 15.5 } })],
    ['stats.range', 'missing stat', { ...homeState(), stats: { bellatores: 15, oratores: 15 } }],
    ['stats.range', 'unknown stat', { ...homeState(), stats: { bellatores: 15, oratores: 15, laboratores: 15, clergy: 1 } }],
    ['burden.range', 'negative fatigue', homeState({ fatigue: -1 })],
    ['burden.range', 'fractional melancholy', homeState({ melancholy: 2.5 })],
    ['burden.range', 'NaN fatigue', homeState({ fatigue: Number.NaN })],
    ['treasury.range', 'negative treasury', homeState({ treasury: -1 })],
    ['treasury.range', 'treasury above 9999', homeState({ treasury: 10_000 })],
    ['treasury.range', 'fractional treasury', homeState({ treasury: 10.5 })],
    // Inventory.
    ['inventory.shape', 'inventory is an array', { ...homeState(), inventory: [] }],
    ['inventory.item', 'unknown inventory item', homeState({ inventory: { holy_grail: 1 } })],
    ['inventory.count', 'zero-count inventory entry', homeState({ inventory: { theriac: 0 } })],
    ['inventory.count', 'fractional inventory count', homeState({ inventory: { theriac: 1.5 } })],
    // Calendar and checkpoint.
    ['weeks.range', 'negative week', homeState({ elapsedWeeks: -1, phase: 'home' })],
    ['weeks.range', 'week beyond 96', homeState({ phase: 'victory', outcome: 'victory', elapsedWeeks: 97, furthestWaystation: regularSegments })],
    ['weeks.deadline', 'home phase at the deadline', homeState({ elapsedWeeks: 96 })],
    ['checkpoint.range', 'checkpoint beyond the route', homeState({ furthestWaystation: regularSegments + 1 })],
    ['checkpoint.range', 'negative checkpoint', homeState({ furthestWaystation: -1 })],
    // Phase consistency.
    ['phase.value', 'unknown phase', { ...homeState(), phase: 'tavern' }],
    ['phase.pilgrimage', 'pilgrimage phase without a pilgrimage', homeState({ phase: 'pilgrimage' })],
    ['phase.pilgrimage', 'home phase with a pilgrimage', { ...pilgrimageState(), phase: 'home', elapsedWeeks: 11 }],
    ['phase.outcome', 'outcome while playing', homeState({ outcome: 'deadline' })],
    ['phase.outcome', 'terminal phase without outcome', homeState({ phase: 'defeat', elapsedWeeks: 96 })],
    ['phase.outcome', 'deadline defeat before the deadline', homeState({ phase: 'defeat', outcome: 'deadline', elapsedWeeks: 95 })],
    ['phase.outcome', 'victory with a deadline outcome', homeState({ phase: 'victory', outcome: 'deadline', furthestWaystation: regularSegments })],
    ['phase.outcome', 'victory before the final checkpoint', homeState({ phase: 'victory', outcome: 'victory', furthestWaystation: 1 })],
    ['convalescence.value', 'unknown convalescence cause', { ...homeState(), pendingConvalescence: 'flu' }],
    ['convalescence.phase', 'convalescence pending during a pilgrimage', pilgrimageState({}, { pendingConvalescence: 'wipeout' })],
    // Collapse.
    ['collapse.persisting', 'fatigue at its ceiling at home', homeState({ fatigue: 77 })],
    ['collapse.persisting', 'melancholy above its ceiling at home', homeState({ melancholy: 80 })],
    ['collapse.persisting', 'ceiling lowered below the burden by a stat loss', homeState({ stats: { bellatores: 15, oratores: 15, laboratores: 15 }, fatigue: 76 })],
    ['collapse.persisting', 'fatigue at its ceiling during a pilgrimage', pilgrimageState({}, { fatigue: 77 })],
    // Pilgrimage shape and progress.
    ['pilgrimage.shape', 'pilgrimage is not an object', homeState({ phase: 'pilgrimage', pilgrimage: 'yes' as unknown as PilgrimageState })],
    ['pilgrimage.stage', 'unknown stage', pilgrimageState({ stage: 'shopping' as never })],
    ['pilgrimage.shape', 'missing isFinal flag', pilgrimageState({ isFinal: undefined as never })],
    ['pilgrimage.segment', 'regular segment index beyond the route', pilgrimageState({ segmentIndex: regularSegments }, { furthestWaystation: regularSegments })],
    ['pilgrimage.segment', 'final gauntlet at the wrong segment', pilgrimageState({ isFinal: true, segmentIndex: 2 }, { furthestWaystation: regularSegments })],
    ['pilgrimage.segment', 'final gauntlet before the final checkpoint', pilgrimageState({ isFinal: true, segmentIndex: regularSegments })],
    ['pilgrimage.checkpoint', 'segment ahead of the checkpoint', pilgrimageState({ segmentIndex: 2 })],
    ['pilgrimage.checkpoint', 'checkpoint not advanced at a waystation', pilgrimageState({ stage: 'waystation_decision', encounterIndex: encountersPerSegment })],
    ['pilgrimage.encounter', 'encounter index beyond the segment', pilgrimageState({ encounterIndex: encountersPerSegment + 1 })],
    ['pilgrimage.encounter', 'completed segment outside waystation_decision', pilgrimageState({ stage: 'continue_or_retreat', encounterIndex: encountersPerSegment })],
    ['pilgrimage.encounter', 'waystation before the segment is complete', pilgrimageState({ stage: 'waystation_decision', encounterIndex: 3 }, { furthestWaystation: 2 })],
    ['pilgrimage.encounter', 'continue_or_retreat before any encounter', pilgrimageState({ stage: 'continue_or_retreat', encounterIndex: 0 })],
    ['pilgrimage.stage', 'waystation in the final gauntlet', pilgrimageState({ isFinal: true, segmentIndex: regularSegments, encounterIndex: finalEncounters, stage: 'waystation_decision' }, { furthestWaystation: regularSegments })],
    ['pilgrimage.threat', 'choosing an approach with no threat', pilgrimageState({ currentThreat: undefined })],
    ['pilgrimage.threat', 'unknown approach', pilgrimageState({ stage: 'continue_or_retreat', currentApproach: 'clergy' as never })],
    ['pilgrimage.reroll', 'pending failure outside the reaction window', pilgrimageState({ pendingFailure: true })],
    ['pilgrimage.reroll', 'reaction window without a pending failure', pilgrimageState({ stage: 'reroll_or_accept', currentApproach: 'bellatores', lastRoll: 80, lastProbability: 30 })],
    ['pilgrimage.reroll', 'reaction window with the consumable already used', pilgrimageState({ stage: 'reroll_or_accept', currentApproach: 'bellatores', lastRoll: 80, lastProbability: 30, pendingFailure: true, consumableUsed: true })],
    ['pilgrimage.reroll', 'reaction window without the roll', pilgrimageState({ stage: 'reroll_or_accept', currentApproach: 'bellatores', pendingFailure: true })],
    ['pilgrimage.reroll', 'reaction window carrying a recovery item', pilgrimageState({ stage: 'reroll_or_accept', currentApproach: 'bellatores', lastRoll: 80, lastProbability: 30, pendingFailure: true, consumableId: 'theriac' })],
    ['pilgrimage.reroll', 'successful roll offered for reroll', pilgrimageState({ stage: 'reroll_or_accept', currentApproach: 'bellatores', lastRoll: 30, lastProbability: 30, pendingFailure: true })],
    ['pilgrimage.reroll', 'nonboolean pending failure', pilgrimageState({ pendingFailure: 'false' as never })],
    ['pilgrimage.roll', 'roll of 0', pilgrimageState({ stage: 'continue_or_retreat', lastRoll: 0, lastProbability: 50 })],
    ['pilgrimage.roll', 'probability above the clamp', pilgrimageState({ stage: 'continue_or_retreat', lastRoll: 10, lastProbability: 96 })],
    ['pilgrimage.coin', 'negative carried Coin', pilgrimageState({ carriedCoin: -1 })],
    ['pilgrimage.coin', 'fractional earned Coin', pilgrimageState({ earnedCoin: 1.5 })],
    ['pilgrimage.coin', 'carried Coin from nowhere', pilgrimageState({ carriedCoin: 15 })],
    ['pilgrimage.item', 'unknown equipment', pilgrimageState({ equipmentId: 'excalibur' })],
    ['pilgrimage.item', 'consumable in the equipment slot', pilgrimageState({ equipmentId: 'theriac' })],
    ['pilgrimage.item', 'equipment in the consumable slot', pilgrimageState({ consumableId: 'saints_relic' })],
    ['pilgrimage.skip', 'skip used while skipping is disabled', pilgrimageState({ skipUsed: true })],
    ['pilgrimage.entryWeek', 'segment entered two weeks ago', pilgrimageState({ segmentEntryWeek: 9 })],
    ['pilgrimage.entryWeek', 'segment entered in the future', pilgrimageState({ segmentEntryWeek: 12 })],
  ];

  it.each(broken)('%s: %s', (id, _name, state) => {
    expectOnly(id, state);
    expect(() => assertInvariants(state as CampaignState, config)).toThrow(InvariantError);
  });

  it('covers every invariant id the checker can report', () => {
    const covered = new Set([...broken.map(([id]) => id), ...brokenTransitions.map(([id]) => id)]);
    const reported = reportedIds();
    expect(reported.length).toBeGreaterThan(30);
    expect([...covered].sort()).toEqual(reported.sort());
  });
});

const brokenTransitions: Array<[string, string, CampaignState, unknown]> = [
  ['transition.identity', 'seed changed', homeState(), homeState({ seed: 124, elapsedWeeks: 11 })],
  ['transition.identity', 'birth sign changed', homeState(), homeState({ birthSign: 'leo', elapsedWeeks: 11 })],
  ['transition.identity', 'player renamed', homeState(), homeState({ playerName: { first: 'Bea', last: 'Fen' }, elapsedWeeks: 11 })],
  ['transition.identity', 'scion renamed', homeState(), homeState({ scionName: 'Robin', elapsedWeeks: 11 })],
  ['transition.weeks', 'weeks went backwards', homeState(), homeState({ elapsedWeeks: 9 })],
  ['transition.weeks', 'three weeks in one action', homeState(), homeState({ elapsedWeeks: 13 })],
  ['transition.weeks', 'departure spent no week', homeState(), pilgrimageState({ encounterIndex: 0 }, { elapsedWeeks: 10 })],
  ['transition.weeks', 'an encounter spent a week', pilgrimageState({ segmentEntryWeek: 11 }), pilgrimageState({ segmentEntryWeek: 11, stage: 'continue_or_retreat', encounterIndex: 3 }, { elapsedWeeks: 12 })],
  ['transition.checkpoint', 'checkpoint regressed', homeState(), homeState({ furthestWaystation: 0, elapsedWeeks: 11 })],
  ['transition.terminal', 'play resumed after victory', homeState({ phase: 'victory', outcome: 'victory', furthestWaystation: regularSegments }), homeState({ furthestWaystation: regularSegments })],
  ['transition.progress', 'departure starts partway through a segment', homeState(), pilgrimageState()],
  ['transition.progress', 'segment astrology week changed', pilgrimageState(), pilgrimageState({ segmentEntryWeek: 11 })],
  ['transition.progress', 'encounter advanced twice', pilgrimageState(), pilgrimageState({ encounterIndex: 4 })],
  ['transition.progress', 'encounter index regressed', pilgrimageState(), pilgrimageState({ encounterIndex: 1 })],
  ['transition.checkpoint', 'multiple checkpoints unlocked in one action', homeState({ furthestWaystation: 0 }), homeState({ furthestWaystation: 2 })],
];

describe('broken transitions', () => {
  it.each(brokenTransitions)('%s: %s', (id, _name, prev, next) => {
    expectOnly(id, next, prev);
  });
});

describe('robustness', () => {
  it.each([{}, { playerName: null }, { pilgrimage: null }])('tolerates malformed previous state %j', (prev) => {
    expect(() => ids(pilgrimageState({ encounterIndex: 0 }), prev)).not.toThrow();
  });
  it.each([undefined, 42, 'state', [], {}])('reports instead of throwing on %j', (garbage) => {
    expect(() => checkInvariants(garbage as unknown as CampaignState, config)).not.toThrow();
    expect(checkInvariants(garbage as unknown as CampaignState, config).length).toBeGreaterThan(0);
  });

  it('lists every violation in the thrown error', () => {
    const state = homeState({ treasury: -5, fatigue: -1 });
    try {
      assertInvariants(state, config);
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(InvariantError);
      const { violations, message } = error as InvariantError;
      expect(violations).toHaveLength(2);
      expect(message).toContain('[treasury.range]');
      expect(message).toContain('[burden.range]');
    }
  });

  it('allows a skip when the New Moon bribe is enabled', () => {
    const skipConfig = loadContentConfig();
    const enabled = { ...skipConfig, astrology: { ...skipConfig.astrology, newMoon: { ...skipConfig.astrology.newMoon, skipFee: 5 } } };
    expect(checkInvariants(pilgrimageState({ skipUsed: true }), enabled)).toEqual([]);
  });
});

/** Every invariant id `invariants.ts` can emit, read from its source. */
function reportedIds(): string[] {
  const source = readFileSync(new URL('./invariants.ts', import.meta.url), 'utf8');
  const pattern = /(?:report|intInRange)\(\s*(?:report,\s*)?'([\w.]+)'/gu;
  return [...new Set([...source.matchAll(pattern)].map((match) => match[1] ?? ''))];
}
