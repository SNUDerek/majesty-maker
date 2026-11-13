import { describe, expect, it } from 'vitest';
import { applyAction } from '../core/index.js';
import { withOverrides } from '../core/config.js';
import { encounterOdds } from '../core/encounter.js';
import { loadCliConfig, parseCliArgs } from '../simulation/cli.js';
import { forcedRolls, ruleState } from './scenarios/harness.js';
import { loadContentConfig, loadShippedConfig } from './support/config.js';

const config = loadCliConfig(parseCliArgs(['--all-policies', '--all-signs']));

describe('shipped POC balance defaults', () => {
  it('changes only tutor losses and finale difficulty from the experimental baseline', () => {
    const { id: _a, provenance: _b, ...expected } = withOverrides(loadContentConfig('rules.experimental.json'), {
      classes: { tutors: { hedge_knight: { opposingLoss: 0 }, hermit: { opposingLoss: 0 }, smuggler: { opposingLoss: 0 } } },
      route: { finalEncounters: 10, finalRoadBonus: -30 },
    });
    const { id: _c, provenance: _d, ...actual } = config;
    expect(actual).toEqual(expected);
    expect(config).toEqual(loadShippedConfig());
  });

  it.each(['hedge_knight', 'hermit', 'smuggler'] as const)('%s preserves the other Estates', (tutor) => {
    const before = ruleState({ phase: 'home', pilgrimage: undefined, treasury: 100 });
    const after = applyAction(before, { type: 'TRAIN', tutor }, config).state;
    const definition = config.classes.tutors[tutor];
    expect(after.stats[definition.target]).toBeGreaterThan(before.stats[definition.target]);
    for (const estate of ['bellatores', 'oratores', 'laboratores'] as const) {
      if (estate !== definition.target) expect(after.stats[estate]).toBe(before.stats[estate]);
    }
  });

  it('requires the tenth finale encounter and applies the -30 road bonus', () => {
    let state = ruleState({ furthestWaystation: 5, pilgrimage: {
      isFinal: true, segmentIndex: 5, encounterIndex: 8, segmentEntryWeek: 5,
      currentThreat: 'laboratores',
    } });
    state = { ...state, rng: { ...state.rng, encounters: forcedRolls(1) } };
    state = applyAction(state, { type: 'CHOOSE_APPROACH', estate: 'bellatores' }, config).state;
    expect(state.phase).toBe('pilgrimage');
    expect(state.pilgrimage?.encounterIndex).toBe(9);
    state = applyAction(state, { type: 'CONTINUE_ENCOUNTER' }, config).state;
    state = { ...state, rng: { ...state.rng, encounters: forcedRolls(1) } };
    expect(applyAction(state, { type: 'CHOOSE_APPROACH', estate: 'bellatores' }, config).state.phase).toBe('victory');
    expect(encounterOdds({ stat: 80, approach: 'bellatores', threat: 'bellatores',
      lunar: 'waxing', segmentIndex: 5, isFinal: true }, config).probability).toBe(50);
  });
});
