import { describe, expect, it } from 'vitest';
import { signToBirthMonth } from '../core/calendar.js';
import {
  ACTIVITY_BLURB, ACTIVITY_LABEL, JOBS, MONTH_SIGN, RESTS, SIGN_LABEL, SIGNS_IN_SHEET_ORDER, TUTORS,
  criticalPeriodLabel, fullName, modifierLabel, signed, threatLabel, times,
} from '../ui/text/labels.js';
import { loadShippedConfig } from './support/config.js';

const config = loadShippedConfig();

describe('ui labels', () => {
  it('names every configured tutor, job and rest', () => {
    expect([...TUTORS].sort()).toEqual(Object.keys(config.classes.tutors).sort());
    expect([...JOBS].sort()).toEqual(Object.keys(config.jobs.definitions).sort());
    expect([...RESTS].sort()).toEqual(Object.keys(config.rest).sort());
    for (const id of [...TUTORS, ...JOBS, ...RESTS]) {
      expect(ACTIVITY_LABEL[id]).toBeTruthy();
      expect(ACTIVITY_BLURB[id]).toBeTruthy();
    }
  });

  it('maps each month to the sign the engine says begins in it', () => {
    for (const [sign, month] of Object.entries(signToBirthMonth)) {
      expect(MONTH_SIGN[month]).toBe(sign);
    }
    expect(new Set(SIGNS_IN_SHEET_ORDER).size).toBe(12);
    expect(Object.keys(SIGN_LABEL).sort()).toEqual([...SIGNS_IN_SHEET_ORDER].sort());
  });

  it('describes every modifier source with live config numbers', () => {
    const sources = ['solar:return', 'solar:opposition', 'solar:trine', 'solar:square',
      'lunar:new', 'lunar:waxing', 'lunar:full', 'lunar:waning'];
    for (const source of sources) expect(modifierLabel(source, config)).not.toBe(source);
    expect(modifierLabel('solar:trine', config)).toBe(`Trine: +${config.astrology.solar.trineJobSuccessPts}% job success`);
    expect(modifierLabel('unknown:x', config)).toBe('unknown:x');
    expect(modifierLabel('solar:return', config, 'banquet')).toBe('Solar Return: Banquet costs ×0.5');
    expect(modifierLabel('solar:return', config, 'hermit')).toBe('Solar Return: lessons ×1.2 gain');
  });

  it('formats numbers', () => {
    expect(times(150)).toBe('×1.5');
    expect(times(200)).toBe('×2');
    expect(signed(3)).toBe('+3');
    expect(signed(-5)).toBe('−5');
    expect(signed(0)).toBe('0');
    expect(threatLabel('oratores')).toBe('An Oratores threat');
    expect(threatLabel('bellatores')).toBe('A Bellatores threat');
    expect(fullName({ scionName: 'Elaine', playerName: { last: 'Wyke' } })).toBe('Elaine Wyke');
    expect(fullName({ scionName: ' Elaine ', playerName: { last: ' ' } })).toBe('Elaine');
    expect(criticalPeriodLabel({ aspect: 'square', startsInWeeks: 1 }, config)).toMatch(/^Square next week: /);
    expect(criticalPeriodLabel({ aspect: 'opposition', startsInWeeks: 3 }, config)).toMatch(/^Opposition in 3 weeks: /);
  });
});
