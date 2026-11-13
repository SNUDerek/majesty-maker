import type { RulesConfig } from './config.js';
import { getCalendar } from './calendar.js';
import { applyIntegerPercent } from './math.js';
import type {
  CampaignState, CriticalSolarPeriod, ModifierContext, ModifierQuantity,
  ModifierSet, SolarAspect,
} from './types.js';

/** Configured aspect at a birth-relative month distance in [0, monthsPerYear). */
export function solarAspect(distance: number, config: RulesConfig): SolarAspect {
  const months = config.calendar.monthsPerYear;
  if (!Number.isSafeInteger(distance) || distance < 0 || distance >= months) {
    throw new RangeError(`solar distance must be an integer in [0, ${months - 1}]`);
  }
  const distances = config.astrology.solar.distances;
  for (const aspect of ['return', 'opposition', 'trine', 'square'] as const) {
    if (distances[aspect].includes(distance)) return aspect;
  }
  return 'none';
}

/** Future period starts only, inclusive of lookahead, exclusive of the deadline. */
export function upcomingCriticalPeriods(
  state: CampaignState,
  lookaheadWeeks: number,
  config: RulesConfig,
): CriticalSolarPeriod[] {
  if (!Number.isSafeInteger(lookaheadWeeks) || lookaheadWeeks < 0) {
    throw new RangeError('lookaheadWeeks must be a non-negative safe integer');
  }
  const calendar = getCalendar(state, config);
  const totalWeeks = config.calendar.totalWeeks;
  const result: CriticalSolarPeriod[] = [];
  const end = Math.min(totalWeeks - 1, state.elapsedWeeks + lookaheadWeeks);
  let previous = solarAspect(calendar.solarDistance, config);
  for (let week = state.elapsedWeeks + 1; week <= end; week++) {
    const aspect = solarAspect(getCalendar({ ...state, elapsedWeeks: week }, config).solarDistance, config);
    if (aspect !== previous &&
        (aspect === 'return' || aspect === 'opposition' || aspect === 'square')) {
      result.push({ aspect, startsInWeeks: week - state.elapsedWeeks });
    }
    previous = aspect;
  }
  return result;
}

/** Apply the exact factors, flooring the non-negative magnitude only once. */
export function applyModifier(base: number, modifiers: ModifierSet, quantity: ModifierQuantity): number {
  return applyIntegerPercent(base, ...(modifiers.factors?.[quantity] ?? [modifiers[quantity]]));
}

export function collectModifiers(ctx: ModifierContext, config: RulesConfig): ModifierSet {
  const result: ModifierSet = {
    successBonusPts: 0, statGainPct: 100, payoutPct: 100, costPct: 100,
    fatiguePct: 100, melancholyPct: 100, recoveryPct: 100, sources: [], factors: {},
  };
  const factors = result.factors!;
  const multiply = (key: ModifierQuantity, percent: number): void => {
    const list = factors[key] ?? (factors[key] = []);
    list.push(percent);
    result[key] = applyIntegerPercent(100, ...list);
  };
  const gainAndPayout = (percent: number): void => {
    multiply('statGainPct', percent);
    multiply('payoutPct', percent);
  };
  const { solar, newMoon, waxing, fullMoon, waning } = config.astrology;
  const isTutor = ctx.kind === 'tutor';
  const isJob = ctx.kind === 'job';
  const isActivity = isTutor || isJob;
  if (ctx.solar === 'return') {
    if (isTutor) multiply('statGainPct', solar.returnTutorGainPct);
    if (ctx.kind === 'rest' && ctx.activityId === 'banquet') multiply('costPct', solar.returnBanquetCostPct);
    if (isTutor || ctx.activityId === 'banquet') result.sources.push('solar:return');
  } else if (ctx.solar === 'opposition' && isJob) {
    multiply('fatiguePct', solar.oppositionJobBurdenPct);
    multiply('melancholyPct', solar.oppositionJobBurdenPct);
    result.sources.push('solar:opposition');
  } else if (ctx.solar === 'trine' && isJob) {
    result.successBonusPts += solar.trineJobSuccessPts;
    result.sources.push('solar:trine');
  } else if (ctx.solar === 'square' && isTutor) {
    multiply('statGainPct', solar.squareTutorGainPct);
    // Q5: the candidate doubles both tutor burdens; legacy configs keep Fatigue at 100.
    if (solar.squareTutorFatiguePct !== 100) multiply('fatiguePct', solar.squareTutorFatiguePct);
    multiply('melancholyPct', solar.squareTutorMelancholyPct);
    result.sources.push('solar:square');
  }
  if (ctx.lunar === 'new' && isActivity && newMoon.activityBonus !== 0 &&
      newMoon.activities.includes(ctx.activityId)) {
    gainAndPayout(100 + newMoon.activityBonus);
    result.sources.push('lunar:new');
  } else if (ctx.lunar === 'waxing' && isActivity && ctx.previousActivityId === ctx.activityId) {
    const prior = ctx.waxingStreak ?? 0;
    if (!Number.isSafeInteger(prior) || prior < 0) throw new RangeError('waxingStreak must be non-negative');
    const count = waxing.mode === 'compounding' ? prior + 1 : 1;
    for (let i = 0; i < count; i++) gainAndPayout(waxing.bonusPct);
    result.sources.push('lunar:waxing');
  } else if (ctx.lunar === 'full' && isActivity && fullMoon.surge !== 0) {
    const table: Record<string, unknown> = isTutor ? config.classes.tutors : config.jobs.definitions;
    if (!Object.hasOwn(table, ctx.activityId)) {
      throw new RangeError(`${ctx.activityId} is not a configured ${ctx.kind}`);
    }
    const estate = isTutor
      ? config.classes.tutors[ctx.activityId as keyof typeof config.classes.tutors].target
      : config.jobs.definitions[ctx.activityId as keyof typeof config.jobs.definitions].success.gainStat;
    if (fullMoon.surgeEstates.includes(estate)) {
      gainAndPayout(100 + fullMoon.surge);
      result.sources.push('lunar:full');
    }
  } else if (ctx.lunar === 'waning' && ctx.kind === 'rest' &&
      (ctx.activityId !== 'rest_home' || waning.appliesToRestAtHome)) {
    multiply('recoveryPct', waning.paidRestRecoveryPct);
    result.sources.push('lunar:waning');
  }
  return result;
}
