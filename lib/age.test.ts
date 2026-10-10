import { describe, expect, it } from 'vitest';
import { ageFrom, ageLabel, birthDateFromAge } from './age';

const today = new Date(2026, 9, 9); // 9.10.2026

describe('age', () => {
  it('counts full years', () => {
    expect(ageFrom('2018-10-09', today)).toBe(8);
    expect(ageFrom('2018-10-10', today)).toBe(7);
    expect(ageFrom('2018-03-01', today)).toBe(8);
  });
  it('age -> approximate birth date and back', () => {
    expect(birthDateFromAge(8, today)).toBe('2018-10-09');
    expect(ageFrom(birthDateFromAge(11, today), today)).toBe(11);
  });
  it('label marks approximate', () => {
    expect(ageLabel(null, false)).toBe('');
    expect(ageLabel('2018-01-01', true).startsWith('~')).toBe(true);
  });
});
