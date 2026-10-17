import { describe, expect, it } from 'vitest';
import { activityDates, activityDays, shortDate } from './activityDays';

describe('activityDates', () => {
  it('starts at the beginning of the year', () => {
    expect(activityDates([0], '2026-01-01', 3)).toEqual(['2026-10-18', '2026-10-25', '2026-11-01']);
  });

  it('skips holidays (Hanukkah, 10 Tevet)', () => {
    expect(activityDates([0], '2026-11-29', 3)).toEqual(['2026-11-29', '2026-12-13', '2026-12-27']);
  });

  it('skips the Passover break and mixes several weekdays in order', () => {
    expect(activityDates([1, 3], '2027-04-12', 4)).toEqual(['2027-04-12', '2027-04-14', '2027-05-03', '2027-05-05']);
  });

  it('ignores days with no activity (Thursday) and stops at the end of the year', () => {
    expect(activityDates([4], '2026-10-18', 5)).toEqual([]);
    expect(activityDates([3], '2027-07-01', 10)).toEqual(['2027-07-07', '2027-07-14', '2027-07-28']);
  });

  it('matches the number of Mondays in the calendar table', () => {
    expect(activityDays([1]).length).toBe(36);
  });
});

it('shortDate', () => {
  expect(shortDate('2026-04-27')).toBe('27.4.26');
});
