/**
 * D2 calendar scenarios: the birthday crossing the year boundary (tech §3, §6, §13).
 */
import { describe, expect, it } from 'vitest';
import { solarAspect } from '../../core/astrology.js';
import { getCalendar } from '../../core/calendar.js';
import type { ZodiacSign } from '../../core/types.js';
import { defaultConfig as config, eventsOfType, hasHome, ruleState, scenario } from './harness.js';

function calendarAt(birthSign: ZodiacSign, elapsedWeeks: number) {
  return getCalendar(ruleState({ birthSign, elapsedWeeks }), config);
}

describe('§3 birthday crossing the year boundary (rule level)', () => {
  // Capricorn is born in December (month 11): the civil year turns a month
  // after the campaign starts, but the age only turns a full year later.
  it('Capricorn: the civil year rolls over in January, the age at the December birthday', () => {
    const rows = [0, 3, 4, 47, 48, 52, 95, 96].map((week) => {
      const { currentMonth, displayYear, age } = calendarAt('capricorn', week);
      return { week, currentMonth, displayYear, age };
    });
    expect(rows).toEqual([
      { week: 0, currentMonth: 11, displayYear: 1450, age: 14 },
      { week: 3, currentMonth: 11, displayYear: 1450, age: 14 },
      { week: 4, currentMonth: 0, displayYear: 1451, age: 14 }, // new year, same age
      { week: 47, currentMonth: 10, displayYear: 1451, age: 14 },
      { week: 48, currentMonth: 11, displayYear: 1451, age: 15 }, // fifteenth birthday
      { week: 52, currentMonth: 0, displayYear: 1452, age: 15 },
      { week: 95, currentMonth: 10, displayYear: 1452, age: 15 },
      { week: 96, currentMonth: 11, displayYear: 1452, age: 16 }, // deadline birthday
    ]);
  });

  it('Aquarius (born in January): year and age turn together', () => {
    expect(calendarAt('aquarius', 47)).toMatchObject({ currentMonth: 11, displayYear: 1450, age: 14 });
    expect(calendarAt('aquarius', 48)).toMatchObject({ currentMonth: 0, displayYear: 1451, age: 15 });
  });

  it('the birthday month is a Solar Return again, the month before is not', () => {
    expect(solarAspect(calendarAt('capricorn', 47).solarDistance, config)).toBe('none');
    expect(solarAspect(calendarAt('capricorn', 48).solarDistance, config)).toBe('return');
    expect(solarAspect(calendarAt('capricorn', 4).solarDistance, config)).toBe('none');
  });

  it('only the deadline week is the deadline', () => {
    expect(calendarAt('capricorn', 95)).toMatchObject({ weeksRemaining: 1, isDeadline: false });
    expect(calendarAt('capricorn', 96)).toMatchObject({ weeksRemaining: 0, isDeadline: true });
  });
});

describe.runIf(hasHome)('engine: §3/§6 birthday crossing the year boundary', () => {
  it('a lesson in the birthday week earns the Solar Return bonus; the week before does not', () => {
    const result = scenario(
      { elapsedWeeks: 46, treasury: 100 },
      [
        { type: 'TRAIN', tutor: 'hedge_knight' }, // week 46: month 11, Full Moon
        { type: 'TRAIN', tutor: 'hermit' }, // week 47: month 11, Waning
        { type: 'TRAIN', tutor: 'hedge_knight' }, // week 48: birthday, Solar Return, New Moon
      ],
      7,
      { campaign: { birthSign: 'capricorn' } },
    );
    expect(result.error).toBeUndefined();
    const gains = eventsOfType(result.events, 'stat_changed').filter((e) => e.source === 'tutor');
    expect(gains.map((e) => [e.week, e.estate, e.amount])).toEqual([
      [46, 'bellatores', 5],
      [47, 'oratores', 5],
      [48, 'bellatores', 6], // floor(5 * 1.2)
    ]);
    expect(result.final.elapsedWeeks).toBe(49);
    expect(getCalendar(result.final, config)).toMatchObject({ age: 15, displayYear: 1451, currentMonth: 11 });
  });
});
