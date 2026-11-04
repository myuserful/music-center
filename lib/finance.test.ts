import { describe, expect, it } from 'vitest';
import type { PaymentTrack } from './constants';
import { buildEntries, byCategory, expenseGroup, inMonth, paidToTeachers, totals, trackBreakdown, weekdayCount, yearTable } from './finance';
import type { Charge, Payment, Transaction } from './types';

const tx = (over: Partial<Transaction>): Transaction => ({
  id: 1, kind: 'expense', occurred_on: '2026-10-05', amount: 100, category: 'שכירות', counterparty: '',
  teacher_id: null, method: 'bank_transfer', reference: '', recurring: false, notes: '',
  receipt_path: null, receipt_name: '', ...over,
});
const payment = (over: Partial<Payment>): Payment => ({
  id: 1, student_id: 3, paid_on: '2026-10-02', amount: 300, method: 'cash', reference: '',
  check_number: '', check_bank: '', check_date: null, check_status: null, notes: '', refund: false, maccabi_amount: 0,
  ...over,
});
describe('buildEntries', () => {
  it('counts manual entries and parent payments; skips bounced checks; refunds are expenses', () => {
    const entries = buildEntries(
      [tx({ id: 1 }), tx({ id: 2, kind: 'income', amount: 500, category: 'תרומה' })],
      [payment({ id: 1 }), payment({ id: 2, method: 'check', check_status: 'bounced' }), payment({ id: 3, amount: 75, refund: true })],
      () => 'דני',
    );
    expect(entries.map((e) => e.key).sort()).toEqual(['p1', 'p3', 't1', 't2']);
    expect(totals(entries)).toEqual({
      income: 500 + 300, refunds: 75, teachers: 0, fixed: 100, variable: 0, investment: 0, operating: 625, afterInvestment: 625,
    });
    expect(byCategory(entries, 'income').map((c) => c.category)).toEqual(['תרומה', 'שכר לימוד - הורים']);
  });

  it('counts a salary in the month it pays for, not the month it was approved', () => {
    const [e] = buildEntries([tx({ id: 7, occurred_on: '2026-11-01', category: 'שכר מורים' })], [], () => '', new Map([[7, '2026-10-01']]));
    expect(e.date).toBe('2026-10-01');
  });
});

describe('expense groups', () => {
  it('classifies by category; a typed category is fixed only when marked recurring', () => {
    expect(['שכירות', 'תשלום להודיה', 'כיבוד', 'הדפסות', 'ציוד וכלי נגינה'].map((c) => expenseGroup(c)))
      .toEqual(['fixed', 'fixed', 'variable', 'variable', 'investment']);
    expect(expenseGroup('משהו חדש')).toBe('variable');
    expect(expenseGroup('משהו חדש', true)).toBe('fixed');
    expect(expenseGroup('ציוד וכלי נגינה', true)).toBe('investment');
  });

  it('investments stay out of the operating profit', () => {
    const entries = buildEntries([
      tx({ id: 1, kind: 'income', amount: 1000, category: 'תרומה' }),
      tx({ id: 2, amount: 300, category: 'שכירות' }),
      tx({ id: 3, amount: 50, category: 'כיבוד' }),
      tx({ id: 4, amount: 2000, category: 'ציוד וכלי נגינה' }),
    ], [], () => '');
    expect(totals(entries)).toMatchObject({ operating: 650, investment: 2000, afterInvestment: -1350 });
  });
});

describe('teacher pay', () => {
  const entries = buildEntries([
    tx({ id: 1, amount: 1000, category: 'שכר מורים', counterparty: 'יונתן', occurred_on: '2026-11-01' }),
    tx({ id: 2, amount: 400, category: 'שכר מורים', counterparty: 'דנה', occurred_on: '2026-10-28' }),
  ], [], () => '', new Map([[1, '2026-10-01'], [2, '2026-10-01']]));

  it('is its own group and counts against the operating profit of the salary month', () => {
    expect(expenseGroup('שכר מורים')).toBe('teachers');
    expect(totals(entries.filter((e) => inMonth(e.date, '2026-10-01')))).toMatchObject({ teachers: 1400, fixed: 0, operating: -1400 });
  });

  it('shows what actually went out each month, by payment date', () => {
    expect(paidToTeachers(entries, '2026-10-01').map((e) => e.amount)).toEqual([400]);
    expect(paidToTeachers(entries, '2026-11-01').map((e) => e.amount)).toEqual([1000]);
    const t = yearTable(entries, 2026);
    expect(t.teachers.map((r) => [r.category, r.byMonth[9]])).toEqual([['יונתן', 1000], ['דנה', 400]]);
    expect(t.teachersPaid.slice(9, 11)).toEqual([400, 1000]);
  });
});

describe('yearTable', () => {
  it('splits each category by month and ignores other years', () => {
    const t = yearTable(buildEntries([
      tx({ id: 1, amount: 300, category: 'שכירות', occurred_on: '2026-01-05' }),
      tx({ id: 2, amount: 310, category: 'שכירות', occurred_on: '2026-03-05' }),
      tx({ id: 3, amount: 50, category: 'כיבוד', occurred_on: '2026-03-07' }),
      tx({ id: 4, amount: 999, category: 'שכירות', occurred_on: '2025-03-05' }),
      tx({ id: 5, kind: 'income', amount: 700, category: 'תרומה', occurred_on: '2026-03-01' }),
    ], [], () => ''), 2026);
    expect(t.fixed).toHaveLength(1);
    expect(t.fixed[0]).toMatchObject({ category: 'שכירות', total: 610 });
    expect(t.fixed[0].byMonth.slice(0, 3)).toEqual([300, 0, 310]);
    expect(t.variable[0].byMonth[2]).toBe(50);
    expect(t.income[0].byMonth[2]).toBe(700);
    expect(t.totals[2].operating).toBe(340);
    expect(t.year.operating).toBe(700 - 610 - 50);
  });
});

describe('trackBreakdown', () => {
  const charge = (over: Partial<Charge>): Charge => ({
    id: 1, student_id: 1, teacher_id: 1, lesson_date: '2026-10-05', kind: 'lesson', track: 'private', description: '',
    amount: 75, due_date: '2026-10-05', commitment_on: null, commitment_ref: '', ...over,
  });
  const tracks: Record<number, PaymentTrack> = { 1: 'private', 2: 'fund_deposit', 3: 'maccabi_split', 4: 'trial' };
  const trackOf = (id: number) => tracks[id];

  it('splits the month income and refunds by track; skips bounced checks and other months', () => {
    const r = trackBreakdown([], [
      payment({ id: 1, student_id: 1, amount: 100 }),
      payment({ id: 2, student_id: 1, amount: 40, method: 'check', check_status: 'bounced' }),
      payment({ id: 3, student_id: 1, amount: 50, paid_on: '2026-09-30' }),
      payment({ id: 4, student_id: 2, amount: 75 }),
      payment({ id: 5, student_id: 2, amount: 30, refund: true }),
      payment({ id: 6, student_id: 3, amount: 140 }),
      payment({ id: 7, student_id: 4, amount: 55 }),
    ], trackOf, '2026-10-01', '2026-10-20');
    expect([r.private.income, r.deposit.income, r.maccabi.income, r.other.income]).toEqual([100, 75, 140, 55]);
    expect(r.deposit.refunds).toBe(30);
  });

  it('counts debts by track, with overdue maccabi credit; upcoming credit stays out of the debt', () => {
    const r = trackBreakdown([
      charge({ id: 1, student_id: 1 }),
      charge({ id: 2, student_id: 2, kind: 'deposit' }),
      charge({ id: 3, student_id: 2, kind: 'deposit', commitment_on: '2026-10-10' }),
      charge({ id: 4, student_id: 3, amount: 45 }),
      charge({ id: 5, student_id: 3, kind: 'maccabi_later', amount: 95, due_date: '2026-10-10' }),
      charge({ id: 6, student_id: 3, kind: 'maccabi_later', amount: 95, lesson_date: '2026-10-12', due_date: '2026-12-12' }),
    ], [payment({ id: 1, student_id: 1, amount: 75 })], trackOf, '2026-10-01', '2026-10-20');
    expect(r.private).toMatchObject({ debt: 0, debtors: 0 });
    expect(r.deposit).toMatchObject({ debt: 75, debtors: 1 });
    expect(r.maccabi).toMatchObject({ debt: 45 + 95, debtors: 1, maccabiOverdue: 95, maccabiUpcoming: 95 });
  });

  it('past month: the debt as of the end of that month', () => {
    const c = [charge({ id: 1, lesson_date: '2026-09-10', due_date: '2026-09-10' }), charge({ id: 2 })];
    const p = [payment({ id: 1, student_id: 1, amount: 75, paid_on: '2026-10-02' })];
    expect(trackBreakdown(c, p, trackOf, '2026-09-01', '2026-11-04').private.debt).toBe(75);
    expect(trackBreakdown(c, p, trackOf, '2026-11-01', '2026-11-04').private.debt).toBe(75);
    expect(trackBreakdown(c, [...p, payment({ id: 2, student_id: 1, amount: 75, paid_on: '2026-11-01' })], trackOf, '2026-09-01', '2026-11-04').private.debt).toBe(75);
    expect(trackBreakdown(c, [...p, payment({ id: 2, student_id: 1, amount: 75, paid_on: '2026-11-01' })], trackOf, '2026-11-01', '2026-11-04').private.debt).toBe(0);
  });
});

describe('weekdayCount', () => {
  it('October 2026 starts on Thursday: 5 Thursdays and Fridays, 4 Sundays', () => {
    expect(weekdayCount('2026-10-01', 4)).toBe(5);
    expect(weekdayCount('2026-10-01', 5)).toBe(5);
    expect(weekdayCount('2026-10-01', 0)).toBe(4);
  });
});

