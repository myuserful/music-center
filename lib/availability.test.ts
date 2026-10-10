import { describe, expect, it } from 'vitest';
import { daySlots, freeSlots, withinHours } from './availability';
import { fmt, slotsInRange, toMin } from './time';

describe('time', () => {
  it('converts', () => {
    expect(toMin('16:30:00')).toBe(990);
    expect(fmt(990)).toBe('16:30');
  });
  it('slots fit the range', () => {
    expect(slotsInRange(toMin('14:00'), toMin('15:30')).map(fmt)).toEqual(['14:00', '14:30', '15:00']);
    expect(slotsInRange(toMin('14:10'), toMin('15:00')).map(fmt)).toEqual(['14:30']);
  });
});

describe('availability', () => {
  const hours = [{ weekday: 1, start_time: '14:00', end_time: '16:00' }];
  it('within hours', () => {
    expect(withinHours(hours, 1, toMin('15:30'))).toBe(true);
    expect(withinHours(hours, 1, toMin('16:00'))).toBe(false);
    expect(withinHours(hours, 2, toMin('14:00'))).toBe(false);
  });
  it('removes busy slots, including choirs that overlap', () => {
    const busy = [
      { weekday: 1, start: toMin('14:00'), end: toMin('14:30') },
      { weekday: 1, start: toMin('15:15'), end: toMin('15:45') },
    ];
    expect(freeSlots(hours, busy).map((s) => fmt(s.start))).toEqual(['14:30']);
  });
  it('lessons follow the teacher start time all day', () => {
    const q = [{ weekday: 0, start_time: '16:15', end_time: '17:45' }];
    expect(daySlots(q, 0).map(fmt)).toEqual(['16:15', '16:45', '17:15']);
    expect(freeSlots(q, []).map((s) => fmt(s.start))).toEqual(['16:15', '16:45', '17:15']);
    // משבצת שנחסמת לא מזיזה את הרצף
    const busy = [{ weekday: 0, start: toMin('16:45'), end: toMin('17:15') }];
    expect(freeSlots(q, busy).map((s) => fmt(s.start))).toEqual(['16:15', '17:15']);
  });
  it('each block on the same day keeps its own sequence', () => {
    const q = [
      { weekday: 2, start_time: '14:00', end_time: '15:00' },
      { weekday: 2, start_time: '16:15', end_time: '17:15' },
    ];
    expect(daySlots(q, 2).map(fmt)).toEqual(['14:00', '14:30', '16:15', '16:45']);
  });
  it('merges overlapping working-hour blocks without duplicates', () => {
    const q = [
      { weekday: 0, start_time: '16:15', end_time: '17:15' },
      { weekday: 0, start_time: '16:45', end_time: '17:15' },
    ];
    expect(freeSlots(q, []).map((s) => fmt(s.start))).toEqual(['16:15', '16:45']);
  });
  it('accepts quarter-hour starts within hours', () => {
    expect(withinHours([{ weekday: 0, start_time: '16:15', end_time: '20:45' }], 0, toMin('20:15'))).toBe(true);
  });
});
