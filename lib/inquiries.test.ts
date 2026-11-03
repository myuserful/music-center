import { describe, expect, it } from 'vitest';
import { inquiryChecklist } from './inquiries';

const base = {
  health_fund: null, payment_track: 'unknown', id_number: '', has_referral: false, email: '', no_email: false,
} as const;

const keys = (s: Parameters<typeof inquiryChecklist>[0]) => inquiryChecklist(s).map((c) => c.key);
const missing = (s: Parameters<typeof inquiryChecklist>[0]) => inquiryChecklist(s).filter((c) => !c.ok).map((c) => c.key);

describe('inquiryChecklist', () => {
  it('בלי קופה: קופה, אופן תשלום ומייל, הכול חסר', () => {
    expect(keys(base)).toEqual(['fund', 'track', 'email']);
    expect(missing(base)).toEqual(['fund', 'track', 'email']);
  });

  it('ת"ז והפניה רק במכבי', () => {
    expect(keys({ ...base, health_fund: 'maccabi' })).toEqual(['fund', 'track', 'id', 'referral', 'email']);
    expect(keys({ ...base, health_fund: 'clalit' })).toEqual(['fund', 'track', 'email']);
  });

  it('מכבי עם הכול מעודכן: אין חוסרים', () => {
    expect(missing({
      health_fund: 'maccabi', payment_track: 'maccabi_full', id_number: '123', has_referral: true, email: 'a@b.co', no_email: false,
    })).toEqual([]);
  });

  it('אין מייל: נאמר במפורש, בלי "חסר"', () => {
    const email = inquiryChecklist({ ...base, no_email: true }).find((c) => c.key === 'email')!;
    expect(email).toEqual({ key: 'email', ok: false, text: 'אין להם מייל' });
  });
});
