import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
const { receiptWords } = await import('./receiptPdf');

describe('receiptWords', () => {
  it('by gender', () => {
    expect(receiptWords('boy')).toEqual({ child: 'הילד', received: 'קיבל' });
    expect(receiptWords('girl')).toEqual({ child: 'הילדה', received: 'קיבלה' });
    expect(receiptWords(null)).toEqual({ child: 'הילד/ה', received: 'קיבל/ה' });
  });
});
