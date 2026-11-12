import { describe, expect, it } from 'vitest';
import { getCalendar, signToBirthMonth } from '../core/calendar.js';
import type { CampaignState, ZodiacSign } from '../core/types.js';

function campaignAt(
  elapsedWeeks: number,
  birthSign: ZodiacSign = 'aries',
): CampaignState {
  return {
    version: 1,
    seed: 0,
    rng: { jobs: 0, encounters: 0, rewards: 0 },
    playerName: { first: 'Test', last: 'Player' },
    scionName: 'Scion',
    birthSign,
    elapsedWeeks,
    stats: { bellatores: 15, oratores: 15, laboratores: 15 },
    fatigue: 0,
    melancholy: 0,
    treasury: 50,
    inventory: {},
    furthestWaystation: 0,
    phase: 'home',
    waxingStreak: 0,
  };
}

describe('getCalendar', () => {
  it('starts in the birth month at age 14, under a New Moon', () => {
    expect(getCalendar(campaignAt(0, 'aries'))).toEqual({
      monthOffset: 0,
      weekOfMonth: 0,
      currentMonth: 2,
      displayYear: 1450,
      age: 14,
      lunarPhase: 'new',
      solarDistance: 0,
      weeksRemaining: 96,
      isDeadline: false,
    });
  });

  it('cycles lunar phases and advances the month from week 3 to week 4', () => {
    expect([0, 1, 2, 3].map((week) => getCalendar(campaignAt(week)).lunarPhase)).toEqual([
      'new',
      'waxing',
      'full',
      'waning',
    ]);
    expect(getCalendar(campaignAt(3)).weekOfMonth).toBe(3);

    expect(getCalendar(campaignAt(4))).toMatchObject({
      monthOffset: 1,
      weekOfMonth: 0,
      currentMonth: 3,
      lunarPhase: 'new',
      solarDistance: 1,
    });
  });

  it('rolls the civil year at January, independently of a Capricorn birthday', () => {
    expect(getCalendar(campaignAt(4, 'capricorn'))).toMatchObject({
      currentMonth: 0,
      displayYear: 1451,
      age: 14,
    });
    expect(getCalendar(campaignAt(48, 'capricorn'))).toMatchObject({
      currentMonth: 11,
      displayYear: 1451,
      age: 15,
    });
  });

  it('keeps a Sagittarius scion age 14 after the new-year crossing', () => {
    expect(getCalendar(campaignAt(8, 'sagittarius'))).toMatchObject({
      currentMonth: 0,
      displayYear: 1451,
      age: 14,
    });
    expect(getCalendar(campaignAt(48, 'sagittarius'))).toMatchObject({
      currentMonth: 10,
      displayYear: 1451,
      age: 15,
    });
  });

  it('reports the final playable week and the deadline boundary', () => {
    expect(getCalendar(campaignAt(95))).toMatchObject({
      monthOffset: 23,
      weekOfMonth: 3,
      age: 15,
      weeksRemaining: 1,
      isDeadline: false,
    });
    expect(getCalendar(campaignAt(96))).toMatchObject({
      monthOffset: 24,
      weekOfMonth: 0,
      age: 16,
      weeksRemaining: 0,
      isDeadline: true,
    });
  });

  it('maps all twelve signs to their conventional starting months', () => {
    const expected: Record<ZodiacSign, number> = {
      aries: 2,
      taurus: 3,
      gemini: 4,
      cancer: 5,
      leo: 6,
      virgo: 7,
      libra: 8,
      scorpio: 9,
      sagittarius: 10,
      capricorn: 11,
      aquarius: 0,
      pisces: 1,
    };

    expect(signToBirthMonth).toEqual(expected);
    for (const [sign, month] of Object.entries(expected) as [ZodiacSign, number][]) {
      expect(getCalendar(campaignAt(0, sign)).currentMonth).toBe(month);
    }
  });

  it('rejects an invalid elapsed-week value', () => {
    expect(() => getCalendar(campaignAt(-1))).toThrow(RangeError);
    expect(() => getCalendar(campaignAt(1.5))).toThrow(RangeError);
  });
});
