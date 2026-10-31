import { describe, expect, it } from 'vitest';
import { missingDetails } from './missingDetails';

const full = {
  contract_signed: true, card_on_file: true, payment_track: 'private' as const,
  health_fund: 'private' as const, id_number: '', has_referral: false, email: 'a@b.co', no_email: false,
};

describe('missingDetails', () => {
  it('nothing missing for a complete private student', () => {
    expect(missingDetails(full)).toEqual([]);
  });

  it('everyone needs contract, card, payment track and health fund', () => {
    expect(missingDetails({ ...full, contract_signed: false, card_on_file: false, payment_track: 'unknown', health_fund: null }))
      .toEqual(['contract', 'card', 'payment_track', 'health_fund']);
  });

  it('email or "no email" for everyone', () => {
    expect(missingDetails({ ...full, email: '' })).toEqual(['email']);
    expect(missingDetails({ ...full, email: '', no_email: true })).toEqual([]);
  });

  it('maccabi and clalit also need ID and referral', () => {
    expect(missingDetails({ ...full, health_fund: 'maccabi', payment_track: 'maccabi_split' })).toEqual(['id_number', 'referral']);
    expect(missingDetails({ ...full, health_fund: 'clalit', id_number: ' 123456789 ' })).toEqual(['referral']);
    expect(missingDetails({ ...full, health_fund: 'clalit', id_number: '123456789', has_referral: true })).toEqual([]);
  });

  it('other funds do not need ID or referral', () => {
    expect(missingDetails({ ...full, health_fund: 'meuhedet', payment_track: 'fund_deposit' })).toEqual([]);
    expect(missingDetails({ ...full, health_fund: 'leumit' })).toEqual([]);
  });
});
