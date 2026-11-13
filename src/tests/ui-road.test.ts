import { describe, expect, it } from 'vitest';
import {
  applyAction, createCampaign, getAvailableActions, getDerivedStats, previewApproaches,
  type CampaignState, type GameEvent,
} from '../core/index.js';
import {
  carryPresets, departureAction, departureBlocker, departureOption, previewLeave, segmentInfo, segmentMoon,
} from '../ui/engine/road.js';
import { activityOptions } from '../ui/engine/activities.js';
import { deriveScreen } from '../ui/engine/screen.js';
import { GameStore } from '../ui/engine/store.js';
import { summarize } from '../ui/engine/summarize.js';
import { itemEffectLabel, penaltyLabel, roadMoonLabel } from '../ui/text/labels.js';
import { loadShippedConfig } from './support/config.js';

const config = loadShippedConfig();
const fresh = (seed = 99): CampaignState => createCampaign(
  { seed, birthSign: 'aries', playerName: { first: 'A', last: 'B' }, scionName: 'Elaine' }, config);

/** Departs with 20 carried Coin and returns the road state. */
function onRoad(seed = 99): CampaignState {
  return applyAction(fresh(seed), { type: 'BEGIN_PILGRIMAGE', carry: 20 }, config).state;
}

describe('road helpers', () => {
  it('describes regular and final segments from config', () => {
    expect(segmentInfo(0, config)).toEqual({
      segmentIndex: 0, isFinal: false, name: 'Road to Waystation 1',
      length: config.route.encountersPerSegment, roadBonus: config.route.roadBonus[0],
    });
    const final = segmentInfo(config.route.regularSegments, config);
    expect(final).toMatchObject({ isFinal: true, name: 'The Final Gauntlet', length: config.route.finalEncounters,
      roadBonus: config.route.finalRoadBonus });
  });

  it('builds clamped departures from the engine descriptor', () => {
    const state = fresh();
    const option = departureOption(state, config)!;
    expect(option).toMatchObject({ minCarry: 0, maxCarry: state.treasury - config.route.departureFee });
    expect(departureAction(option, 9999)).toEqual({ type: 'BEGIN_PILGRIMAGE', carry: option.maxCarry });
    expect(departureAction(option, -3, 'gambeson')).toEqual({ type: 'BEGIN_PILGRIMAGE', carry: 0 });
    expect(carryPresets(option).map((p) => p.carry)).toEqual([0, 10, 20, 40]);
    expect(departureBlocker(state, config)).toBeNull();
    expect(departureBlocker({ ...state, treasury: 4 }, config)).toBe('Departure fee 10, treasury 4');
    expect(departureBlocker({ ...state, pendingConvalescence: 'wipeout' }, config)).toBe('She must rest first');
  });

  it('locks the moon at segment entry', () => {
    const road = onRoad();
    expect(segmentMoon(road, config)).toBe('new');
    expect(segmentMoon({ ...road, elapsedWeeks: road.elapsedWeeks + 2 }, config)).toBe('new');
    expect(() => segmentMoon(fresh(), config)).toThrow();
  });

  it('previews a retreat exactly, without touching the RNG', () => {
    let state = onRoad();
    // Win or lose the first encounter until we can retreat.
    state = applyAction(state, { type: 'CHOOSE_APPROACH', estate: 'bellatores' }, config).state;
    if (state.pilgrimage?.stage !== 'continue_or_retreat') return; // wiped out: nothing to preview
    const preview = previewLeave(state, { type: 'RETREAT' }, config);
    const actual = summarize({ type: 'RETREAT' }, applyAction(state, { type: 'RETREAT' }, config).events);
    expect(preview).toEqual(actual);
    expect(preview.title).toBe('Retreat');
    expect(() => previewLeave(state, { type: 'CONTINUE_ENCOUNTER' } as never, config)).toThrow(/only RETREAT/);
  });

  it('labels moons, penalties and items', () => {
    expect(roadMoonLabel('new', config)).toMatch(/bribe past one encounter for 10 carried Coin/);
    expect(roadMoonLabel('full', config)).toMatch(/advantage ×2/);
    expect(roadMoonLabel('waning', config)).toBe('Waning Moon: no effect on the road');
    expect(penaltyLabel({ resource: 'fatigue', amount: 15 })).toBe('+15 Fatigue');
    expect(penaltyLabel({ resource: 'coin', amount: 7 })).toBe('−7 carried Coin');
    for (const item of Object.values(config.items.catalog)) {
      expect(itemEffectLabel(item)).not.toBe(item.effect);
    }
  });
});

describe('summarize (road)', () => {
  const w = 3;
  const resolved = (success: boolean): GameEvent => ({ week: w, type: 'encounter_resolved', segmentIndex: 0, isFinal: false,
    encounterIndex: 4, threat: 'oratores', approach: 'bellatores', success, probability: 73, roll: 42 });

  it('is silent for actions that only reveal a threat or use a remedy', () => {
    const drawn: GameEvent = { week: w, type: 'encounter_drawn', threat: 'oratores', encounterIndex: 1 };
    expect(summarize({ type: 'CONTINUE_ENCOUNTER' }, [drawn])).toBeNull();
    expect(summarize({ type: 'BEGIN_PILGRIMAGE', carry: 0 }, [drawn])).toBeNull();
    expect(summarize({ type: 'USE_CONSUMABLE', itemId: 'theriac' },
      [{ week: w, type: 'consumable_used', itemId: 'theriac' }])).toBeNull();
  });

  it('headlines wins, waystations, losses, wipeouts and victory', () => {
    const win = summarize({ type: 'CHOOSE_APPROACH', estate: 'bellatores' }, [resolved(true),
      { week: w, type: 'coin_changed', account: 'carried', amount: 3, source: 'encounter_reward' },
      { week: w, type: 'waystation_reached', waystation: 2 }])!;
    expect(win.title).toBe('Encounter won — Waystation 2 reached');
    expect(win.detail).toBe('Rolled 42 against 73%.');
    expect(win.rows).toEqual([{ quantity: 'carried', label: 'Carried Coin', amount: 3, sources: ['reward'], tone: 'good' }]);
    expect(win.notes[0]).toMatch(/Waystation 2 is secured/);

    const pending = summarize({ type: 'CHOOSE_APPROACH', estate: 'bellatores' }, [resolved(false)])!;
    expect(pending.title).toBe('Encounter lost');
    expect(pending.notes[0]).toMatch(/Metheglin/);

    const charged = summarize({ type: 'CHOOSE_APPROACH', estate: 'bellatores' }, [resolved(false),
      { week: w, type: 'burden_changed', burden: 'fatigue', amount: 15, source: 'encounter_penalty' }])!;
    expect(charged.notes).toEqual([]);

    const wipe = summarize({ type: 'ACCEPT_RESULT' }, [
      { week: w, type: 'burden_changed', burden: 'fatigue', amount: 15, source: 'encounter_penalty' },
      { week: w, type: 'wipeout', cause: 'fatigue' },
      { week: w, type: 'convalescence', cause: 'wipeout' },
      { week: w, type: 'week_spent', reason: 'convalescence' }])!;
    expect(wipe).toMatchObject({ title: 'Wipeout', detail: 'Exhausted, she collapsed on the road.', tone: 'bad' });
    expect(wipe.notes).toContain('She was carried home to convalesce.');

    const reroll = summarize({ type: 'USE_CONSUMABLE', itemId: 'metheglin' },
      [{ week: w, type: 'consumable_used', itemId: 'metheglin' }, resolved(true), { week: w, type: 'reroll_used', itemId: 'metheglin', roll: 42 }])!;
    expect(reroll.detail).toBe('Metheglin reroll: rolled 42 against 73%.');

    expect(summarize({ type: 'CHOOSE_APPROACH', estate: 'oratores' }, [resolved(true), { week: w, type: 'victory' }])!.title)
      .toBe('Victory!');
    expect(summarize({ type: 'SKIP_ENCOUNTER' }, [{ week: w, type: 'encounter_skipped', encounterIndex: 0, source: 'new_moon_bribe' }])!.title)
      .toBe('Slipped past under the New Moon');
  });
});

describe('full campaign through the store', () => {
  /**
   * A simple player that only uses what the screens offer: activity options,
   * the departure descriptor, previewApproaches and the stage's actions.
   */
  function play(seed: number) {
    const store = new GameStore(config, null);
    store.newGame({ seed, birthSign: 'leo', playerName: { first: 'A', last: 'B' }, scionName: 'Elaine' });
    const seen = new Set<string>();
    for (let step = 0; step < 2000; step++) {
      const snap = store.getSnapshot();
      if (snap.ui.pendingResult !== undefined) {
        seen.add(snap.ui.pendingResult.title.split(' — ')[0]!);
        store.dismissResult();
        continue;
      }
      const state = snap.state!;
      const screen = deriveScreen(state, snap.ui);
      seen.add(screen.kind);
      if (screen.kind === 'outcome') return { state, seen };
      const available = getAvailableActions(state, config);
      expect(available.length).toBeGreaterThan(0);
      const derived = getDerivedStats(state, config);
      const strained = state.fatigue > derived.fatigueCeiling * 0.5 || state.melancholy > derived.melancholyCeiling * 0.5;
      if (screen.kind === 'home') {
        const departure = departureOption(state, config);
        const weakest = Math.min(state.stats.bellatores, state.stats.oratores, state.stats.laboratores);
        if (departure !== null && !strained && (weakest >= 30 || state.elapsedWeeks > 60)) {
          store.dispatch(departureAction(departure, departure.maxCarry));
        } else {
          const kind = strained ? 'rest' : state.treasury < 40 ? 'job' : 'tutor';
          const options = activityOptions(state, kind, config).filter((o) => o.enabled);
          const pick = kind === 'tutor'
            ? options.sort((a, b) => state.stats[config.classes.tutors[(a.action as { tutor: 'hermit' }).tutor].target]
              - state.stats[config.classes.tutors[(b.action as { tutor: 'hermit' }).tutor].target])[0]
            : options[options.length - 1] ?? activityOptions(state, 'job', config)[0];
          store.dispatch(pick!.action);
        }
      } else {
        const stage = state.pilgrimage!.stage;
        if (stage === 'choose_approach') {
          const best = previewApproaches(state, config)
            .filter((a) => !a.failureWipesOut).sort((a, b) => b.odds.probability - a.odds.probability)[0]
            ?? previewApproaches(state, config)[0]!;
          store.dispatch({ type: 'CHOOSE_APPROACH', estate: best.estate });
        } else if (stage === 'reroll_or_accept') {
          store.dispatch({ type: 'ACCEPT_RESULT' });
        } else if (stage === 'continue_or_retreat') {
          store.dispatch({ type: strained ? 'RETREAT' : 'CONTINUE_ENCOUNTER' });
        } else {
          const canGo = available.some((a) => a.type === 'CONTINUE_SEGMENT');
          store.dispatch({ type: canGo && !strained ? 'CONTINUE_SEGMENT' : 'RETURN_HOME' });
        }
      }
      expect(store.getSnapshot().error).toBeNull();
    }
    throw new Error('campaign did not finish');
  }

  it('plays seeded campaigns to an outcome, seeing road results and screens', () => {
    const seen = new Set<string>();
    const outcomes = new Set<string>();
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const result = play(seed);
      outcomes.add(result.state.outcome!);
      for (const s of result.seen) seen.add(s);
    }
    expect(seen).toContain('encounter');
    expect(seen).toContain('waystation');
    expect(seen).toContain('Encounter won');
    expect(seen).toContain('Encounter lost');
    expect([...seen].some((t) => t === 'Retreat' || t === 'Home from the road')).toBe(true);
    expect([...outcomes].sort()).toEqual(['deadline', 'victory']);
    expect(seen).toContain('Victory!');
  });
});
