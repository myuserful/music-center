import { describe, expect, it } from 'vitest';
import { buildEntries, byCategory, salaryEstimate, totals, weekdayCount } from './finance';
import type { Charge, Choir, Lesson, Payment, Teacher, Transaction } from './types';

const tx = (over: Partial<Transaction>): Transaction => ({
  id: 1, kind: 'expense', occurred_on: '2026-10-05', amount: 100, category: 'שכירות', counterparty: '',
  teacher_id: null, method: 'bank_transfer', reference: '', recurring: false, notes: '',
  receipt_path: null, receipt_name: '', ...over,
});
const payment = (over: Partial<Payment>): Payment => ({
  id: 1, student_id: 3, paid_on: '2026-10-02', amount: 300, method: 'cash', reference: '',
  check_number: '', check_bank: '', check_date: null, check_status: null, notes: '', ...over,
});
const charge = (over: Partial<Charge>): Charge => ({
  id: 1, student_id: 3, month: '2026-10-01', lesson_id: 1, choir_id: null, part: 1, description: '',
  payer: 'fund', fund: 'clalit', amount: 200, commitments: 4, state: 'paid', ...over,
});

describe('buildEntries', () => {
  it('counts manual entries, parent payments and paid fund charges; skips bounced checks and unpaid charges', () => {
    const entries = buildEntries(
      [tx({ id: 1 }), tx({ id: 2, kind: 'income', amount: 500, category: 'תרומה' })],
      [payment({ id: 1 }), payment({ id: 2, method: 'check', check_status: 'bounced' })],
      [charge({ id: 1 }), charge({ id: 2, amount: 150 }), charge({ id: 3, state: 'submitted' }), charge({ id: 4, payer: 'parents', state: 'due' })],
      () => 'דני',
    );
    expect(entries.map((e) => e.key).sort()).toEqual(['fclalit:2026-10-01', 'p1', 't1', 't2']);
    expect(totals(entries)).toEqual({ income: 500 + 300 + 350, expense: 100, net: 1050 });
    expect(byCategory(entries, 'income').map((c) => c.category)).toEqual(['תרומה', 'קופות חולים', 'שכר לימוד - הורים']);
  });
});

describe('weekdayCount', () => {
  it('October 2026 starts on Thursday: 5 Thursdays and Fridays, 4 Sundays', () => {
    expect(weekdayCount('2026-10-01', 4)).toBe(5);
    expect(weekdayCount('2026-10-01', 5)).toBe(5);
    expect(weekdayCount('2026-10-01', 0)).toBe(4);
  });
});

describe('salaryEstimate', () => {
  const teacher = { id: 9, hourly_rate: 100 } as Teacher;
  const lesson = (over: Partial<Lesson>) => ({ id: 1, teacher_id: 9, weekday: 0, status: 'confirmed', ...over }) as Lesson;

  it('confirmed lessons and choirs times occurrences in the month', () => {
    const choir = { teacher_id: 9, weekday: 4, start_time: '17:00', end_time: '18:00' } as Choir;
    const s = salaryEstimate(teacher, [lesson({}), lesson({ id: 2 }), lesson({ id: 3, status: 'pending' }), lesson({ id: 4, teacher_id: 1 })], [choir], '2026-10-01');
    // 2 שיעורים × חצי שעה × 4 ימי ראשון + שעה × 5 ימי חמישי = 9 שעות
    expect(s).toEqual({ weeklyHours: 2, hours: 9, amount: 900 });
  });

  it('no hourly rate = no amount', () => {
    expect(salaryEstimate({ ...teacher, hourly_rate: null }, [lesson({})], [], '2026-10-01').amount).toBeNull();
  });
});
