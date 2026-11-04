import { describe, expect, it } from 'vitest';
import { changedShared, familyKey, mergeShared, missingContacts, normalizePhone, pairKey, siblingsOf, suggestSiblings } from './siblings';

const details = (id: number, d: Partial<Parameters<typeof mergeShared>[0][number]> = {}) => ({
  id, email: '', no_email: false, contract_signed: false, card_on_file: false, ...d,
});
const person = (student_id: number, phone: string, c: Partial<Parameters<typeof missingContacts>[1][number]> = {}) => ({
  student_id, name: 'אמא', relation: 'אמא', phone, email: '', is_primary: false, ...c,
});

describe('changedShared', () => {
  it('רק מה ששונה עובר לאחים', () => {
    const before = details(1, { email: 'a@b.co', contract_signed: true });
    expect(changedShared(before, before)).toEqual({});
    expect(changedShared(before, { ...before, contract_signed: false })).toEqual({ contract_signed: false });
    expect(changedShared(before, { ...before, email: 'c@d.co' })).toEqual({ email: 'c@d.co', no_email: false });
  });
});

describe('mergeShared', () => {
  it('משלים חוזה, אשראי ומייל למי שחסר', () => {
    expect(mergeShared([details(1, { contract_signed: true, email: 'a@b.co' }), details(2, { card_on_file: true, no_email: true })])).toEqual([
      { id: 1, update: { card_on_file: true } },
      { id: 2, update: { contract_signed: true, email: 'a@b.co', no_email: false } },
    ]);
  });

  it('שני מיילים שונים נשארים, ואין מה להשלים = אין עדכון', () => {
    expect(mergeShared([details(1, { email: 'a@b.co' }), details(2, { email: 'c@d.co' })])).toEqual([]);
  });

  it('"אין מייל" עובר למי שאין לו/ה מייל', () => {
    expect(mergeShared([details(1, { no_email: true }), details(2)])).toEqual([{ id: 2, update: { no_email: true } }]);
  });
});

describe('missingContacts', () => {
  it('מוסיף רק מי שחסר, ומזהה טלפון גם בכתיב אחר', () => {
    const out = missingContacts([1, 2], [person(1, '052-1234567'), person(2, '+972521234567'), person(1, '0531234567', { name: 'אבא' })]);
    expect(out.map((c) => [c.student_id, c.phone])).toEqual([[2, '0531234567']]);
  });

  it('מי שאין לו/ה ראשי מקבל/ת את הראשי של האח/ות, פעם אחת', () => {
    const out = missingContacts([1, 2], [person(1, '0521234567', { is_primary: true }), person(1, '0531234567')]);
    expect(out.map((c) => [c.phone, c.is_primary])).toEqual([['0521234567', true], ['0531234567', false]]);
  });
});

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
