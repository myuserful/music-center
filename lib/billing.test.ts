import { describe, expect, it } from 'vitest';
import { monthStart, parentBalance, planCharges, type Activity } from './billing';
import type { Charge, Payment, Student } from './types';

const student = (over: Partial<Student>): Student => ({
  id: 1, first_name: 'א', last_name: 'ב', school: '', birth_date: null, birth_date_approx: false, branch_id: null,
  requested_instrument_id: null, notes: '', status: 'active', gender: null, health_fund: null, health_plan: '',
  id_number: '', has_referral: false, hmo_reported: false, preferred_times: '', language: 'עברית',
  payment_track: 'private', standing_order: false, needs_review: false,
  call_state: 'to_call', call_attempts: 0, last_call_at: null, ...over,
});

const lesson: Activity = {
  lesson_id: 7, choir_id: null, label: 'שיעור פסנתר',
  price: { private: 300, maccabi1: 280, maccabi2: 280, commitments: 4 },
};
const choir: Activity = {
  lesson_id: null, choir_id: 3, label: 'מקהלה ה׳',
  price: { private: 220, maccabi1: null, maccabi2: null, commitments: 3 },
};
const M = '2026-10-01';
const noRates = new Map<string, number | null>();

describe('planCharges', () => {
  it('private: one charge per activity', () => {
    const { rows } = planCharges(student({}), [lesson, choir], M, noRates);
    expect(rows.map((r) => [r.amount, r.state, r.payer])).toEqual([[300, 'due', 'parents'], [220, 'due', 'parents']]);
  });

  it('maccabi: second part waits for the refund', () => {
    const { rows, missing } = planCharges(student({ payment_track: 'maccabi', health_fund: 'maccabi' }), [lesson, choir], M, noRates);
    expect(rows.map((r) => [r.part, r.amount, r.state])).toEqual([[1, 280, 'due'], [2, 280, 'awaiting_refund']]);
    expect(missing).toHaveLength(1); // למקהלה אין מחיר מכבי
  });

  it('commitment: counts commitments, amount only when the fund rate is known', () => {
    const s = student({ payment_track: 'commitment', health_fund: 'clalit' });
    const unknown = planCharges(s, [lesson, choir], M, noRates).rows;
    expect(unknown.map((r) => [r.payer, r.fund, r.commitments, r.amount, r.state]))
      .toEqual([['fund', 'clalit', 4, null, 'to_submit'], ['fund', 'clalit', 3, null, 'to_submit']]);
    const known = planCharges(s, [choir], M, new Map([['clalit', 50]])).rows;
    expect(known[0].amount).toBe(150);
  });

  it('commitment with a fund that has no commitments is reported', () => {
    const r = planCharges(student({ payment_track: 'commitment', health_fund: 'maccabi' }), [lesson], M, noRates);
    expect(r.rows).toEqual([]);
    expect(r.missing).toHaveLength(1);
  });

  it('unknown track is not charged', () => {
    const r = planCharges(student({ payment_track: 'unknown' }), [lesson], M, noRates);
    expect(r.rows).toEqual([]);
    expect(r.missing[0]).toContain('לא ידוע');
  });
});

describe('parentBalance', () => {
  const c = (amount: number, state: Charge['state'], payer: Charge['payer'] = 'parents') =>
    ({ amount, state, payer }) as Charge;
  const p = (amount: number, check_status: Payment['check_status'] = null) => ({ amount, check_status }) as Payment;

  it('ignores refunds still pending, fund charges and bounced checks', () => {
    const charges = [c(280, 'due'), c(280, 'awaiting_refund'), c(100, 'to_submit', 'fund'), c(300, 'cancelled')];
    expect(parentBalance(charges, [p(200), p(80, 'bounced')])).toBe(80);
  });
});

it('monthStart', () => expect(monthStart('2026-10-17')).toBe('2026-10-01'));
