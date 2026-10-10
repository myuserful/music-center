'use server';

import { choirPrice, lessonPrice, monthLabel, monthStart, planCharges, type Activity } from '../billing';
import {
  CHARGE_STATE_LABELS, COMMITMENT_FUNDS, PAYMENT_METHODS, type ChargeState, type CheckStatus,
} from '../constants';
import { loadAll, loadBilling } from '../data';
import { createClient } from '../supabase/server';
import { backTo, dbMessage, done, fail, num, oneOf, str } from './util';

const HOME = '/payments';

// ---- מחירון ----

export async function saveBillingSettings(fd: FormData) {
  const db = await createClient();
  const row = {
    lesson_private: num(fd, 'lesson_private'),
    lesson_maccabi_1: num(fd, 'lesson_maccabi_1'),
    lesson_maccabi_2: num(fd, 'lesson_maccabi_2'),
    lesson_commitments: num(fd, 'lesson_commitments'),
  };
  if (Object.values(row).some((v) => v === null)) fail(HOME, 'יש למלא את כל מחירי השיעור הפרטי');
  const { error } = await db.from('billing_settings').update(row).eq('id', 1);
  if (error) fail(HOME, dbMessage(error));

  // כל הקופות במקביל (כל בקשה למסד לוקחת זמן)
  const errors = await Promise.all(COMMITMENT_FUNDS.map(async (fund) => {
    const amount = num(fd, `rate_${fund}`);
    const { error: e } = await db.from('fund_rates').upsert({ fund, amount });
    if (e) return e;
    // התחייבויות שעוד לא שולמו מקבלות את הסכום החדש
    if (amount !== null) {
      const { data: open } = await db.from('charges').select('id, commitments')
        .eq('fund', fund).in('state', ['to_submit', 'submitted']);
      await Promise.all((open ?? []).map((c) =>
        db.from('charges').update({ amount: amount * (c.commitments ?? 0) }).eq('id', c.id)));
    }
    return null;
  }));
  const rateError = errors.find(Boolean);
  if (rateError) fail(HOME, dbMessage(rateError));
  done(HOME, 'המחירון נשמר');
}

// ---- חיובים ----

/** יוצר את החיובים של החודש לכל התלמידים הפעילים לפי השיבוצים הסופיים. אפשר להריץ שוב: מה שכבר קיים לא מוכפל */
export async function generateCharges(fd: FormData) {
  const db = await createClient();
  const month = monthStart(str(fd, 'month') || new Date().toISOString().slice(0, 10));
  const back = `${HOME}?month=${month.slice(0, 7)}`;
  const [all, billing] = await Promise.all([loadAll(db), loadBilling(db)]);
  const rates = new Map(billing.rates.map((r) => [r.fund, r.amount == null ? null : Number(r.amount)]));
  const key = (c: { student_id: number; lesson_id: number | null; choir_id: number | null; part: number }) =>
    `${c.student_id}:${c.lesson_id ?? 0}:${c.choir_id ?? 0}:${c.part}`;
  const existing = new Set(billing.charges.filter((c) => c.month === month).map(key));

  const rows = [];
  let missing = 0;
  for (const s of all.students.filter((x) => x.status === 'active')) {
    const activities: Activity[] = [
      ...all.lessons.filter((l) => l.student_id === s.id && l.status === 'confirmed').map((l) => ({
        lesson_id: l.id, choir_id: null,
        label: `שיעור ${all.maps.instrument.get(l.instrument_id)?.name ?? ''}`.trim(),
        price: lessonPrice(billing.settings),
      })),
      ...all.enrollments.filter((e) => e.student_id === s.id && e.status === 'confirmed').map((e) => {
        const c = all.maps.choir.get(e.choir_id)!;
        return { lesson_id: null, choir_id: c.id, label: c.name, price: choirPrice(c) };
      }),
    ];
    const plan = planCharges(s, activities, month, rates);
    missing += plan.missing.length;
    rows.push(...plan.rows.filter((r) => !existing.has(key(r))));
  }

  if (rows.length) {
    const { error } = await db.from('charges').insert(rows);
    if (error) fail(back, dbMessage(error));
  }
  const msg = `${monthLabel(month)}: נוצרו ${rows.length} חיובים`;
  done(back, missing ? `${msg}. ${missing} פעילויות לא חויבו (ראו "חסר מידע לחיוב")` : msg);
}

export async function setChargeState(fd: FormData) {
  const db = await createClient();
  const back = backTo(fd, HOME);
  const state = oneOf(str(fd, 'state'), Object.keys(CHARGE_STATE_LABELS) as ChargeState[]);
  if (!state) fail(back, 'סטטוס לא תקין');
  const ids = fd.getAll('id').map(Number).filter(Boolean);
  const { error } = await db.from('charges').update({ state }).in('id', ids);
  if (error) fail(back, dbMessage(error));
  done(back, 'עודכן');
}

/** חיוב ידני (למשל דמי רישום או הנחה כמספר שלילי) */
export async function addCharge(fd: FormData) {
  const db = await createClient();
  const studentId = num(fd, 'student_id')!;
  const back = backTo(fd, `/students/${studentId}`);
  const amount = num(fd, 'amount');
  const description = str(fd, 'description');
  if (amount === null || !description) fail(back, 'יש למלא תיאור וסכום');
  const { error } = await db.from('charges').insert({
    student_id: studentId, month: monthStart(str(fd, 'month') || new Date().toISOString().slice(0, 10)),
    description, payer: 'parents', amount, state: 'due',
  });
  if (error) fail(back, dbMessage(error));
  done(back, 'החיוב נוסף');
}

// ---- תשלומים ----

export async function addPayment(fd: FormData) {
  const db = await createClient();
  const studentId = num(fd, 'student_id')!;
  const back = backTo(fd, `/students/${studentId}`);
  const method = oneOf(str(fd, 'method'), PAYMENT_METHODS);
  const amount = num(fd, 'amount');
  if (!method || !amount || amount <= 0) fail(back, 'יש למלא סכום ואמצעי תשלום');
  const isCheck = method === 'check';
  const row = {
    student_id: studentId,
    paid_on: str(fd, 'paid_on') || new Date().toISOString().slice(0, 10),
    amount,
    method,
    reference: str(fd, 'reference'),
    check_number: isCheck ? str(fd, 'check_number') : '',
    check_bank: isCheck ? str(fd, 'check_bank') : '',
    check_date: isCheck ? str(fd, 'check_date') || null : null,
    check_status: isCheck ? 'pending' : null,
    notes: str(fd, 'notes'),
  };
  const { error } = await db.from('payments').insert(row);
  if (error) fail(back, dbMessage(error));
  done(back, 'התשלום נרשם');
}

export async function deletePayment(fd: FormData) {
  const db = await createClient();
  const back = backTo(fd, HOME);
  const { error } = await db.from('payments').delete().eq('id', num(fd, 'id')!);
  if (error) fail(back, dbMessage(error));
  done(back, 'התשלום נמחק');
}

export async function setCheckStatus(fd: FormData) {
  const db = await createClient();
  const back = backTo(fd, HOME);
  const status = oneOf(str(fd, 'check_status'), ['pending', 'deposited', 'bounced'] as CheckStatus[]);
  if (!status) fail(back, 'סטטוס לא תקין');
  const { error } = await db.from('payments').update({ check_status: status }).eq('id', num(fd, 'id')!);
  if (error) fail(back, dbMessage(error));
  done(back, status === 'bounced' ? "הצ'ק סומן כחוזר. הסכום חזר ליתרת החוב" : 'עודכן');
}
