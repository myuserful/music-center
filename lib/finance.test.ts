import { describe, expect, it } from 'vitest';
import { buildEntries, byCategory, totals, weekdayCount } from './finance';
import type { Payment, Transaction } from './types';

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
    expect(totals(entries)).toEqual({ income: 500 + 300, expense: 100 + 75, net: 625 });
    expect(byCategory(entries, 'income').map((c) => c.category)).toEqual(['תרומה', 'שכר לימוד - הורים']);
  });
});

describe('weekdayCount', () => {
  it('October 2026 starts on Thursday: 5 Thursdays and Fridays, 4 Sundays', () => {
    expect(weekdayCount('2026-10-01', 4)).toBe(5);
    expect(weekdayCount('2026-10-01', 5)).toBe(5);
    expect(weekdayCount('2026-10-01', 0)).toBe(4);
  });
});

