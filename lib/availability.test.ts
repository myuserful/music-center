import { describe, expect, it } from 'vitest';
import { freeSlots, withinHours } from './availability';
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
});
