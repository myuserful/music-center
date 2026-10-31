import { describe, expect, it } from 'vitest';
import { familyKey, normalizePhone, pairKey, siblingsOf, suggestSiblings } from './siblings';

const st = (id: number, last_name: string, family_id: number | null = null) => ({ id, last_name, family_id });
const ct = (student_id: number, phone: string) => ({ student_id, phone });

describe('siblings', () => {
  it('normalizes phones', () => {
    expect(normalizePhone('052-123 4567')).toBe('0521234567');
    expect(normalizePhone('+972 52-1234567')).toBe('0521234567');
    expect(normalizePhone('123')).toBe('');
  });

  it('groups students sharing a phone, three siblings in one suggestion', () => {
    const res = suggestSiblings(
      [st(1, 'כהן'), st(2, 'כהן'), st(3, 'כהן'), st(4, 'לוי')],
      [ct(1, '0521234567'), ct(2, '052-1234567'), ct(2, '0539999999'), ct(3, '053-9999999'), ct(4, '0541111111')],
      new Set(),
    );
    expect(res).toEqual([{ studentIds: [1, 2, 3], phones: ['0521234567', '0539999999'], sure: true }]);
  });

  it('different last names are a doubt', () => {
    const res = suggestSiblings([st(1, 'כהן'), st(2, 'לוי')], [ct(1, '0521234567'), ct(2, '0521234567')], new Set());
    expect(res[0].sure).toBe(false);
  });

  it('skips pairs already in one family or rejected', () => {
    const students = [st(1, 'כהן', 7), st(2, 'כהן', 7), st(3, 'כהן')];
    const contacts = [ct(1, '0521234567'), ct(2, '0521234567'), ct(3, '0521234567')];
    expect(suggestSiblings(students, contacts, new Set())).toEqual([{ studentIds: [1, 2, 3], phones: ['0521234567'], sure: true }]);
    expect(suggestSiblings(students, contacts, new Set([pairKey(3, 1), pairKey(2, 3)]))).toEqual([]);
    expect(suggestSiblings(students.slice(0, 2), contacts, new Set())).toEqual([]);
  });

  it('siblings and family key', () => {
    const all = [st(1, 'א', 5), st(2, 'א', 5), st(3, 'ב')];
    expect(siblingsOf(all[0], all).map((s) => s.id)).toEqual([2]);
    expect(siblingsOf(all[2], all)).toEqual([]);
    expect(familyKey(all[0])).toBe('f5');
    expect(familyKey(all[2])).toBe('s3');
  });
});
