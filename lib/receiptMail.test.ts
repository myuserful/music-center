import { describe, expect, it } from 'vitest';
import { receiptMail, receiptMonths } from './receiptMail';

describe('receiptMonths', () => {
  it('one month, several in a year, across years', () => {
    expect(receiptMonths(['2026-10-21', '2026-10-28'])).toBe('אוקטובר 2026');
    expect(receiptMonths(['2026-11-04', '2026-09-02', '2026-10-21'])).toBe('ספטמבר, אוקטובר ונובמבר 2026');
    expect(receiptMonths(['2026-12-30', '2027-01-06'])).toBe('דצמבר 2026 וינואר 2027');
    expect(receiptMonths([])).toBe('');
  });
});

describe('receiptMail', () => {
  it('subject with the months, body with count and field', () => {
    const m = receiptMail({ name: 'יוסי שנור', dates: ['2026-10-21', '2026-10-28'], field: 'expression' });
    expect(m.subject).toBe('קבלה עבור מכבי - אוקטובר 2026 - יוסי שנור');
    expect(m.body).toContain('על 2 טיפולים בהבעה ויצירה של יוסי שנור בחודש אוקטובר 2026.');
    expect(receiptMail({ name: 'א', dates: ['2026-09-02', '2026-10-21'], field: 'art' }).body).toContain('בחודשים ספטמבר ואוקטובר 2026');
  });
});
