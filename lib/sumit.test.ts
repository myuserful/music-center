import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
const { sumitPayment } = await import('./sumit');

describe('sumitPayment', () => {
  const base = { amount: 300, reference: 'A1', check: { number: '123', date: '2026-11-01' }, date: '2026-10-21' };
  it('maps our payment methods to SUMIT payment types', () => {
    expect(sumitPayment({ ...base, method: 'cash' })).toEqual({ Amount: 300, Type: 2, Details_Cash: {} });
    expect(sumitPayment({ ...base, method: 'transfer' })).toEqual({ Amount: 300, Type: 3, Details_BankTransfer: { Reference: 'A1', DueDate: '2026-10-21' } });
    expect(sumitPayment({ ...base, method: 'check' })).toEqual({ Amount: 300, Type: 4, Details_Cheque: { ChequeNumber: '123', DueDate: '2026-11-01' } });
    expect(() => sumitPayment({ ...base, method: 'credit' })).toThrow();
  });
});
