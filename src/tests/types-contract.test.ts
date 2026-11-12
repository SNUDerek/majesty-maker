import { describe, expect, it } from 'vitest';
import type {
  ApplyAction,
  AvailableAction,
  CampaignState,
  GameAction,
  GameEvent,
  RulesConfigContract,
} from '../core/types';

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

describe('types contract', () => {
  it('compiles the documented usage patterns', () => {
    expect([applyStub, beginDescriptor, train, stablesEvent]).toHaveLength(4);
  });
});
