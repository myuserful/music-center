import { describe, expect, it } from 'vitest';
import { fundIdNumber, fundPersonName, idState, validIsraeliId } from './funds';

describe('הפרטים שנשלחים לקופה', () => {
  const s = { first_name: 'יעל', id_number: '123456782', health_fund: 'maccabi' as const, referral_name: 'דנה כהן', referral_id_number: '000000018' };

  it('במכבי, עם שם ות"ז על ההפניה: פרטי ההפניה', () => {
    expect(fundIdNumber(s)).toBe('000000018');
    expect(fundPersonName(s)).toBe('דנה כהן');
  });

  it('חסר אחד מהם: הפרטים של התלמיד/ה', () => {
    expect(fundIdNumber({ ...s, referral_name: '' })).toBe('123456782');
    expect(fundPersonName({ ...s, referral_id_number: '' })).toBe('יעל');
  });

  it('בקופה אחרת: הפרטים של התלמיד/ה', () => {
    expect(fundIdNumber({ ...s, health_fund: 'clalit' })).toBe('123456782');
    expect(fundPersonName({ ...s, health_fund: 'clalit' })).toBe('יעל');
  });

  it('מצב הת"ז נבדק על מה שנשלח', () => {
    expect(idState({ ...s, id_number: '' })).toBe('ok');
    expect(idState({ ...s, referral_id_number: '123456789' })).toBe('invalid');
  });
});

describe('validIsraeliId', () => {
  it('accepts valid ids, with or without leading zeros', () => {
    expect(validIsraeliId('000000018')).toBe(true);
    expect(validIsraeliId('18')).toBe(false); // קצר מדי
    expect(validIsraeliId('339473308')).toBe(true);
    expect(validIsraeliId('123456782')).toBe(true);
  });
  it('rejects bad check digit and junk', () => {
    expect(validIsraeliId('123456789')).toBe(false);
    expect(validIsraeliId('12345678a')).toBe(false);
    expect(validIsraeliId('')).toBe(false);
  });
});

describe('idState', () => {
  it('classifies', () => {
    expect(idState({ id_number: '' })).toBe('missing');
    expect(idState({ id_number: '  ' })).toBe('missing');
    expect(idState({ id_number: '123456789' })).toBe('invalid');
    expect(idState({ id_number: '123456782' })).toBe('ok');
  });
});
