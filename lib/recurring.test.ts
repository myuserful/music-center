import { describe, expect, it } from 'vitest';
import { dueRuns, findExisting, occurrenceDate } from './recurring';
import type { RecurringExpense } from './types';

const rent = (over: Partial<RecurringExpense> = {}): RecurringExpense => ({
  id: 1, category: 'שכירות', counterparty: 'בעל הבית', amount: 5000, day_of_month: 1, method: 'bank_transfer',
  notes: '', start_month: '2026-09-01', end_month: null, ...over,
});
const months = (r: ReturnType<typeof dueRuns>) => r.map((d) => d.month);

describe('occurrenceDate', () => {
  it('uses the last day of a short month', () => {
    expect(occurrenceDate('2026-02-01', 31)).toBe('2026-02-28');
    expect(occurrenceDate('2026-10-01', 5)).toBe('2026-10-05');
  });
});

describe('dueRuns', () => {
  it('catches up from the start month through this month', () => {
    expect(months(dueRuns([rent()], [], '2026-11-04'))).toEqual(['2026-09-01', '2026-10-01', '2026-11-01']);
  });

  it('never repeats a month that already ran, even if its record was deleted', () => {
    const runs = [{ recurring_id: 1, month: '2026-09-01' }, { recurring_id: 1, month: '2026-10-01' }];
    expect(months(dueRuns([rent()], runs, '2026-11-04'))).toEqual(['2026-11-01']);
    expect(dueRuns([rent({ id: 2 })], runs, '2026-11-04')).toHaveLength(3);
  });

  it('stops at the end month, and does not run before the start month', () => {
    expect(months(dueRuns([rent({ end_month: '2026-10-01' })], [], '2026-11-04'))).toEqual(['2026-09-01', '2026-10-01']);
    expect(dueRuns([rent({ start_month: '2026-12-01' })], [], '2026-11-04')).toEqual([]);
  });
});

describe('findExisting', () => {
  const [due] = dueRuns([rent({ start_month: '2026-11-01' })], [], '2026-11-04');
  const tx = (over = {}) => ({ id: 9, kind: 'expense', occurred_on: '2026-11-03', category: 'שכירות', counterparty: 'בעל הבית', recurring_id: null, ...over });

  it('links to a manual record of the same expense in the same month', () => {
    expect(findExisting(due, [tx()])?.id).toBe(9);
    expect(findExisting(due, [tx({ counterparty: '' })])?.id).toBe(9);
  });

  it('ignores other months, categories, payees and records already linked', () => {
    expect(findExisting(due, [tx({ occurred_on: '2026-10-03' })])).toBeUndefined();
    expect(findExisting(due, [tx({ category: 'ארנונה' })])).toBeUndefined();
    expect(findExisting(due, [tx({ counterparty: 'מישהו אחר' })])).toBeUndefined();
    expect(findExisting(due, [tx({ recurring_id: 2 })])).toBeUndefined();
    expect(findExisting(due, [tx()], new Set([9]))).toBeUndefined();
  });
});
