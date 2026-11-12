import { describe, expect, expectTypeOf, it } from 'vitest';
import type {
  ApplyAction,
  AvailableAction,
  CampaignState,
  GameAction,
  GameEvent,
  RulesConfigContract,
  RngStreams,
  GetCalendar,
  GetDerivedStats,
} from '../core/types';

import { getCalendar } from '../core/calendar.js';
import { getDerivedStats } from '../core/derived.js';
import { resolveJob, resolveRest, resolveTutor, type ActivityResolution } from '../core/economy.js';
import { drawThreat } from '../core/pilgrimage.js';
import type { RulesConfig } from '../core/config.js';
import type { Draw, RngStreams as GeneratorStreams, RngStreamName } from '../core/rng.js';
import type { Estate } from '../core/types.js';

// Compile-time contract checks; `npm run typecheck` fails if these regress.
interface ConcreteConfig extends RulesConfigContract {
  readonly calendar: { readonly totalWeeks: number };
  readonly startingState: { readonly treasury: number };
}

const applyStub: ApplyAction<ConcreteConfig> = (state: CampaignState, _action, config) => {
  void config.calendar.totalWeeks;
  return { state, events: [] };
};

const beginDescriptor: AvailableAction = {
  type: 'BEGIN_PILGRIMAGE',
  minCarry: 0,
  maxCarry: 30,
  fee: 20,
  isFinal: false,
  equipmentIds: [],
  consumableIds: [],
};

const train: AvailableAction = { type: 'TRAIN', tutor: 'hermit' } satisfies GameAction;

const stablesEvent: GameEvent = {
  week: 0,
  type: 'job_resolved',
  job: 'stables',
  success: true,
  probability: 100,
  automatic: true,
};

const jobStatGain: GameEvent = {
  week: 0,
  type: 'stat_changed',
  estate: 'laboratores',
  amount: 1,
  source: 'job',
};

describe('types contract', () => {
  it('keeps implemented APIs and RNG streams aligned with the shared contracts', () => {
    expectTypeOf(getCalendar).toEqualTypeOf<GetCalendar<RulesConfig>>();
    expectTypeOf(getDerivedStats).toEqualTypeOf<GetDerivedStats<RulesConfig>>();
    expectTypeOf<CampaignState['rng']>().toEqualTypeOf<GeneratorStreams>();
    expectTypeOf<RngStreams>().toEqualTypeOf<GeneratorStreams>();
    expectTypeOf<keyof RngStreams>().toEqualTypeOf<RngStreamName>();
    expectTypeOf<ReturnType<typeof drawThreat>>().toEqualTypeOf<Draw<Estate>>();
    expectTypeOf<ActivityResolution['rng']>().toEqualTypeOf<RngStreams>();
    expectTypeOf<ReturnType<typeof resolveJob>>().toEqualTypeOf<ActivityResolution>();
    expectTypeOf<ReturnType<typeof resolveRest>>().toEqualTypeOf<ActivityResolution>();
    expectTypeOf<ReturnType<typeof resolveTutor>>().toEqualTypeOf<ActivityResolution>();
    const wipeout: GameEvent = { type: 'wipeout', week: 1, cause: 'both' };
    expect(wipeout.cause).toBe('both');
  });

  it('compiles the documented usage patterns', () => {
    expect([applyStub, beginDescriptor, train, stablesEvent, jobStatGain]).toHaveLength(5);
  });
});
