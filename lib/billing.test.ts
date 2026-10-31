import { describe, expect, it } from 'vitest';
import {
  account, addMonths, chargesForLesson, diffCharges, freePairLessons, monthRequest, paymentCoverage, planCharges, planReceipts, remainingLessonDates,
  type NewCharge,
} from './billing';
import type { PaymentTrack } from './constants';
import type { BillingSettings, Charge, DayLesson, Payment } from './types';

const S: BillingSettings = {
  price_private: 75, price_maccabi_full: 140, price_maccabi_upfront: 45, price_maccabi_later: 95,
  price_fund_deposit: 75, maccabi_later_months: 2, price_trial: 55,
};
const row = (student: number, attendance: DayLesson['attendance'] = 'present', date = '2026-10-20'): DayLesson => ({
  id: student, lesson_date: date, teacher_id: 1, student_id: student, lesson_id: null, instrument_id: null,
  start_time: '16:00:00', room_id: null, attendance, notes: '', substitute_id: null, teacher_paid: null, pair: false,
});
let nextId = 1;
const charge = (c: Partial<Charge>): Charge => ({
  id: nextId++, student_id: 1, teacher_id: 1, lesson_date: '2026-10-20', kind: 'lesson', track: 'private',
  description: '', amount: 75, due_date: '2026-10-20', commitment_on: null, commitment_ref: '', ...c,
});
const pay = (amount: number, p: Partial<Payment> = {}): Payment => ({
  id: nextId++, student_id: 1, paid_on: '2026-10-01', amount, method: 'cash', reference: '', check_number: '',
  check_bank: '', check_date: null, check_status: null, notes: '', refund: false, maccabi_amount: 0, ...p,
});

describe('chargesForLesson', () => {
  it('per track', () => {
    expect(chargesForLesson('private', '2026-10-20', S)).toEqual([{ kind: 'lesson', amount: 75, due_date: '2026-10-20' }]);
    expect(chargesForLesson('maccabi_full', '2026-10-20', S)).toEqual([{ kind: 'lesson', amount: 140, due_date: '2026-10-20' }]);
    expect(chargesForLesson('maccabi_split', '2026-10-20', S)).toEqual([
      { kind: 'lesson', amount: 45, due_date: '2026-10-20' },
      { kind: 'maccabi_later', amount: 95, due_date: '2026-12-20' },
    ]);
    expect(chargesForLesson('fund_deposit', '2026-10-20', S)).toEqual([{ kind: 'deposit', amount: 75, due_date: '2026-10-20' }]);
    expect(chargesForLesson('trial', '2026-10-20', S)).toEqual([{ kind: 'lesson', amount: 55, due_date: '2026-10-20' }]);
    expect(chargesForLesson('unknown', '2026-10-20', S)).toBeNull();
  });

  it('two months later, end of month', () => {
    expect(addMonths('2026-12-31', 2)).toBe('2027-02-28');
    expect(addMonths('2026-10-20', 2)).toBe('2026-12-20');
  });
});

describe('planCharges', () => {
  const tracks: Record<number, PaymentTrack> = { 1: 'private', 2: 'maccabi_split', 3: 'unknown', 4: 'private' };
  it('bills present and no-show, skips excused, reports unknown track', () => {
    const { charges, unbilled } = planCharges(
      [row(1), row(2, 'absent'), row(3), row(4, 'excused')], (id) => tracks[id], S, () => 'שיעור',
    );
    expect(charges.map((c) => [c.student_id, c.kind, c.amount])).toEqual([[1, 'lesson', 75], [2, 'lesson', 45], [2, 'maccabi_later', 95]]);
    expect(unbilled.map((r) => r.student_id)).toEqual([3]);
  });
});

describe('diffCharges', () => {
  const planned: NewCharge[] = [{
    student_id: 1, teacher_id: 1, lesson_date: '2026-10-20', kind: 'lesson', track: 'private', description: '', amount: 75, due_date: '2026-10-20',
  }];
  it('keeps existing, adds missing, removes stale but not deposits with a commitment or manual charges', () => {
    const keep = charge({ student_id: 1 });
    const stale = charge({ student_id: 2 });
    const covered = charge({ student_id: 3, kind: 'deposit', commitment_on: '2026-10-25' });
    const manual = charge({ student_id: 4, kind: 'manual', teacher_id: null });
    expect(diffCharges([keep, stale, covered, manual], planned)).toEqual({ insert: [], remove: [stale.id] });
    expect(diffCharges([], planned).insert).toHaveLength(1);
  });
});

describe('account', () => {
  const today = '2026-10-25';
  it('balance: payments minus charges already due', () => {
    const a = account([charge({}), charge({ due_date: '2026-10-21' })], [pay(100)], today);
    expect(a.balance).toBe(-50);
    expect(a.lines.map((l) => l.status)).toEqual(['partial', 'paid']);
  });

  it('maccabi later part: upcoming, then overdue after two months', () => {
    const later = charge({ kind: 'maccabi_later', amount: 95, due_date: '2026-12-20' });
    const now = account([charge({ amount: 45 }), later], [pay(45)], today);
    expect(now).toMatchObject({ balance: 0, upcoming: 95, overdueAmount: 0 });
    const after = account([charge({ amount: 45 }), later], [pay(45)], '2026-12-21');
    expect(after).toMatchObject({ balance: 0, overdueAmount: 95 });
    // שולם בחלק שסומן לזיכוי מכבי
    const paid = account([charge({ amount: 45 }), later], [pay(45), pay(95, { maccabi_amount: 95 })], '2026-12-21');
    expect(paid).toMatchObject({ balance: 0, overdueAmount: 0, upcoming: 0 });
  });

  it('a regular payment never covers the Maccabi part (the 180 credit-card bug)', () => {
    // שילמו 180 באשראי על שיעורים. חיוב: 45 היום, 95 זיכוי מכבי בעוד חודשיים
    const lesson = charge({ amount: 45 });
    const later = charge({ kind: 'maccabi_later', amount: 95, due_date: '2026-12-20' });
    const a = account([lesson, later], [pay(180, { method: 'credit' })], today);
    expect(a.balance).toBe(135);
    expect(a.upcoming).toBe(95);
    expect(a.lines.find((l) => l.charge.id === later.id)?.status).toBe('upcoming');
    expect(a.lines.find((l) => l.charge.id === lesson.id)?.status).toBe('paid');
  });

  it('part of a payment marked for Maccabi covers only Maccabi; extra is Maccabi credit', () => {
    const lesson = charge({ amount: 45 });
    const later = charge({ kind: 'maccabi_later', amount: 95, due_date: '2026-12-20' });
    const a = account([lesson, later], [pay(200, { maccabi_amount: 150 })], today);
    expect(a.balance).toBe(5);
    expect(a.upcoming).toBe(0);
    expect(a.maccabiCredit).toBe(55);
  });

  it('deposit with a commitment goes back to the parents as credit; a refund takes it out', () => {
    const dep = charge({ kind: 'deposit', commitment_on: '2026-10-22' });
    expect(account([dep], [pay(75)], today)).toMatchObject({ balance: 75, deposits: [] });
    expect(account([dep], [pay(75), pay(75, { refund: true })], today).balance).toBe(0);
    expect(account([charge({ kind: 'deposit' })], [], today).deposits).toHaveLength(1);
  });

  it('bounced check does not count, discount adds credit', () => {
    const a = account([charge({}), charge({ kind: 'manual', amount: -25 })], [pay(50), pay(75, { check_status: 'bounced' })], today);
    expect(a.balance).toBe(0);
  });
});

describe('monthRequest', () => {
  it('remaining weekly lessons this month times the upfront price, minus credit', () => {
    // אוקטובר 2026: ימי שלישי מ-20 והלאה = 20, 27
    expect(remainingLessonDates([2], '2026-10', '2026-10-20')).toEqual(['2026-10-20', '2026-10-27']);
    expect(monthRequest([2], '2026-10', '2026-10-20', 'private', S, 0)).toEqual({ lessons: 2, free: 0, price: 75, total: 150 });
    expect(monthRequest([2], '2026-10', '2026-10-20', 'maccabi_split', S, 45)?.total).toBe(45);
    expect(monthRequest([2], '2026-10', '2026-10-20', 'private', S, -100)?.total).toBe(250);
    expect(monthRequest([2], '2026-10', '2026-10-20', 'unknown', S, 0)).toBeNull();
  });

  it('a lesson already charged today is not asked for again (student 72)', () => {
    // חמישי: 22.10 כבר נסגר וחויב, נשאר 29.10
    expect(remainingLessonDates([4], '2026-10', '2026-10-22', ['2026-10-22'])).toEqual(['2026-10-29']);
    expect(monthRequest([4], '2026-10', '2026-10-22', 'private', S, -75, ['2026-10-22'])).toEqual({ lessons: 1, free: 0, price: 75, total: 150 });
  });

  it('other funds pay a deposit per lesson, not a month ahead', () => {
    expect(monthRequest([4], '2026-10', '2026-10-22', 'fund_deposit', S, -75, ['2026-10-22'])).toBeNull();
  });
});

describe('payments per charge and receipts', () => {
  const today = '2026-12-25';
  it('each charge knows which payment covered it (oldest payment first)', () => {
    const c1 = charge({ amount: 75, due_date: '2026-10-20', lesson_date: '2026-10-20' });
    const c2 = charge({ amount: 75, due_date: '2026-10-27', lesson_date: '2026-10-27' });
    const p1 = pay(100, { paid_on: '2026-10-01' });
    const p2 = pay(50, { paid_on: '2026-10-28' });
    const a = account([c1, c2], [p2, p1], today);
    const byId = new Map(a.lines.map((l) => [l.charge.id, l.paidBy]));
    expect(byId.get(c1.id)).toEqual([{ paymentId: p1.id, amount: 75 }]);
    expect(byId.get(c2.id)).toEqual([{ paymentId: p1.id, amount: 25 }, { paymentId: p2.id, amount: 50 }]);
  });

  it('maccabi: one payment split 45 + 95 gets two receipts', () => {
    const lesson = charge({ amount: 45, lesson_date: '2026-10-20', due_date: '2026-10-20' });
    const later = charge({ kind: 'maccabi_later', amount: 95, lesson_date: '2026-10-20', due_date: '2026-12-20' });
    const p = pay(140, { maccabi_amount: 95 });
    const plan = planReceipts(account([lesson, later], [p], today).lines, p, 'דני כהן');
    expect(plan).toEqual([
      { kind: 'lesson', amount: 45, description: 'שכר לימוד - דני כהן · שיעורים 20.10' },
      { kind: 'maccabi_later', amount: 95, description: 'השלמת תשלום (זיכוי מכבי) - דני כהן · שיעורים 20.10' },
    ]);
  });

  it('money beyond the charges is a prepayment in the lesson receipt', () => {
    const p = pay(300);
    const plan = planReceipts(account([charge({ amount: 75, lesson_date: '2026-10-20' })], [p], today).lines, p, 'דני');
    expect(plan).toEqual([{ kind: 'lesson', amount: 300, description: 'שכר לימוד - דני · שיעורים 20.10 · תשלום מראש' }]);
  });
});

describe('paymentCoverage', () => {
  it('what each payment covered, and what is left as credit', () => {
    const today = '2026-12-25';
    const lesson = charge({ amount: 45, lesson_date: '2026-10-20', due_date: '2026-10-20' });
    const later = charge({ kind: 'maccabi_later', amount: 95, lesson_date: '2026-10-20', due_date: '2026-12-20' });
    const card = pay(180, { paid_on: '2026-10-21' });
    const mac = pay(100, { paid_on: '2026-11-01', maccabi_amount: 100 });
    const { lines } = account([lesson, later], [card, mac], today);
    expect(paymentCoverage(lines, card)).toEqual({ items: [{ charge: lesson, amount: 45 }], unused: 135, unusedMaccabi: 0 });
    expect(paymentCoverage(lines, mac)).toEqual({ items: [{ charge: later, amount: 95 }], unused: 0, unusedMaccabi: 5 });
  });
});

describe('pair lessons: every 4th is free', () => {
  // תלמיד/ה 1 בזוג, שיעור כל שבוע
  const weeks = ['2026-09-01', '2026-09-08', '2026-09-15', '2026-09-22', '2026-09-29', '2026-10-06', '2026-10-13', '2026-10-20'];
  const pairRows = (attendance: (i: number) => DayLesson['attendance'] = () => 'present') =>
    weeks.map((d, i): DayLesson => ({ ...row(1, attendance(i), d), id: 100 + i, pair: true }));

  it('counts across months, not per month', () => {
    const free = freePairLessons(pairRows());
    expect([...free]).toEqual([103, 107]); // 22.9 ו-20.10
  });

  it('lessons cancelled in advance do not count, unexcused absence does', () => {
    const free = freePairLessons(pairRows((i) => (i === 1 ? 'excused' : i === 2 ? 'absent' : 'present')));
    // 1.9, (8.9 בוטל), 15.9 לא הגיע/ה בלי הודעה - נספר, 22.9, 29.9 = הרביעי
    expect([...free]).toEqual([104]);
  });

  it('regular lessons are never free', () => {
    expect(freePairLessons(pairRows().map((r) => ({ ...r, pair: false }))).size).toBe(0);
  });

  it('private: 3 × 75 = 225 for 4 lessons, the free one is a 0 charge', () => {
    const rows = pairRows().slice(0, 4);
    const { charges } = planCharges(rows, () => 'private', S, () => 'שיעור', freePairLessons(rows));
    expect(charges.map((c) => c.amount)).toEqual([75, 75, 75, 0]);
    expect(charges[3].description).toContain('חינם');
  });

  it('maccabi: 45 upfront and 95 later on 3 of 4 only', () => {
    const rows = pairRows().slice(0, 4);
    const { charges } = planCharges(rows, () => 'maccabi_split', S, () => 'שיעור', freePairLessons(rows));
    expect(charges.filter((c) => c.kind === 'lesson').map((c) => c.amount)).toEqual([45, 45, 45, 0]);
    expect(charges.filter((c) => c.kind === 'maccabi_later')).toHaveLength(3);
  });

  it('a charged lesson that became free is replaced', () => {
    const rows = pairRows().slice(0, 4);
    const existing = [charge({ lesson_date: '2026-09-22', amount: 75 })];
    const { charges } = planCharges(rows, () => 'private', S, () => 'שיעור', freePairLessons(rows));
    const { insert, remove } = diffCharges(existing, charges.filter((c) => c.lesson_date === '2026-09-22'));
    expect(remove).toEqual([existing[0].id]);
    expect(insert.map((c) => c.amount)).toEqual([0]);
  });

  it('month request skips the free lesson by position in the cycle', () => {
    // נשארו 4 שלישי באוקטובר (6, 13, 20, 27). כבר חויבו 5 שיעורים בזוג: 6=6, 13=7, 20=8 (חינם), 27=9
    expect(monthRequest([], '2026-10', '2026-10-01', 'private', S, 0, [], { weekdays: [2], done: 5 }))
      .toEqual({ lessons: 3, free: 1, price: 75, total: 225 });
  });
});
