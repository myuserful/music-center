import { describe, expect, it } from 'vitest';
import { receiptFile } from './receiptFile';
import { bankLabel } from './types';

const form = (f?: File) => {
  const fd = new FormData();
  if (f) fd.set('receipt', f);
  return fd;
};

describe('receiptFile', () => {
  it('בלי קובץ: null', () => {
    expect(receiptFile(form())).toBeNull();
    expect(receiptFile(form(new File([], 'empty.pdf', { type: 'application/pdf' })))).toBeNull();
  });
  it('מקבל תמונה ו-PDF', () => {
    const pdf = new File(['x'], 'a.pdf', { type: 'application/pdf' });
    expect(receiptFile(form(pdf))).toBeInstanceOf(File);
    expect(receiptFile(form(new File(['x'], 'a.png', { type: 'image/png' })))).toBeInstanceOf(File);
  });
  it('דוחה סוג לא מתאים וקובץ גדול', () => {
    expect(receiptFile(form(new File(['x'], 'a.exe', { type: 'application/x-msdownload' })))).toMatch(/אפשר לצרף/);
    expect(receiptFile(form(new File([new Uint8Array(10 * 1024 * 1024 + 1)], 'a.pdf', { type: 'application/pdf' })))).toMatch(/10MB/);
  });
});

describe('bankLabel', () => {
  it('מחבר רק את מה שמולא, ושומר אפס בהתחלה', () => {
    expect(bankLabel({ bank_name: 'בנק לאומי', bank_branch: '012', bank_account: '345', bank_holder: '' }))
      .toBe('בנק לאומי · סניף 012 · חשבון 345');
    expect(bankLabel({ bank_account: '345', bank_holder: 'משה כהן' })).toBe('חשבון 345 · על שם משה כהן');
  });
  it('ריק כשלא מולא (גם לפני 0054)', () => {
    expect(bankLabel({})).toBe('');
  });
});
