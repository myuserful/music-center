import { describe, expect, it } from 'vitest';
import { originalReceipts, originalsFor, receiptMail, receiptMonths, referralHolder } from './receiptMail';

describe('referralHolder', () => {
  it('רק כששם ות"ז מולאו שניהם', () => {
    expect(referralHolder({ referral_name: ' דנה כהן ', referral_id_number: ' 123456782 ' })).toEqual({ name: 'דנה כהן', idNumber: '123456782' });
    expect(referralHolder({ referral_name: 'דנה כהן', referral_id_number: '' })).toBeNull();
    expect(referralHolder({ referral_name: '', referral_id_number: '123456782' })).toBeNull();
  });

  it('לפני 0056 השדות לא קיימים', () => {
    expect(referralHolder({} as Parameters<typeof referralHolder>[0])).toBeNull();
  });
});

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

describe('originalReceipts', () => {
  const receipts = [
    { id: 1, payment_id: 10, source: 'sumit', url: 'https://app.sumit.co.il/a', number: '21461', amount: 180, issued_on: '2026-10-20' },
    { id: 2, payment_id: 11, source: 'sumit', url: 'https://app.sumit.co.il/b', number: '21460', amount: 380, issued_on: '2026-10-01' },
    { id: 3, payment_id: 12, source: 'manual', url: '', number: '5', amount: 100, issued_on: '2026-10-02' },
    { id: 4, payment_id: 13, source: 'internal', url: '', number: '7', amount: 100, issued_on: '2026-10-03' },
  ];
  const line = (lesson_date: string, kind: string, ...pay: number[]) => ({ charge: { lesson_date, kind }, paidBy: pay.map((paymentId) => ({ paymentId })) });
  const lines = [line('2026-10-07', 'lesson', 11), line('2026-10-21', 'lesson', 11, 10), line('2026-10-28', 'lesson', 10), line('2026-10-29', 'manual', 10)];

  it('only SUMIT receipts with a file, oldest first, with the lessons their payment covered', () => {
    expect(originalReceipts(receipts, lines)).toEqual([
      { id: 2, number: '21460', amount: 380, issuedOn: '2026-10-01', dates: ['2026-10-07', '2026-10-21'] },
      { id: 1, number: '21461', amount: 180, issuedOn: '2026-10-20', dates: ['2026-10-21', '2026-10-28'] },
    ]);
  });

  it('originalsFor picks the receipts that paid the certificate dates', () => {
    const o = originalReceipts(receipts, lines);
    expect(originalsFor(o, ['2026-10-07'])).toEqual([2]);
    expect(originalsFor(o, ['2026-10-21'])).toEqual([2, 1]);
    expect(originalsFor(o, ['2026-11-04'])).toEqual([]);
  });

  it('mail body mentions the originals', () => {
    expect(receiptMail({ name: 'א', dates: ['2026-10-21'], field: 'art', originals: true }).body).toContain('מצורפות גם הקבלות המקוריות');
  });
});
