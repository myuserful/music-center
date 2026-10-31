'use server';

import { monthLabel } from '../billing';
import { SALARY_CATEGORY, TX_METHODS } from '../constants';
import { validDate } from '../day';
import { createClient } from '../supabase/server';
import { fullName } from '../types';
import { backTo, dbMessage, done, fail, num, oneOf, str } from './util';

const HOME = '/payroll';
const MISSING = 'צריך להריץ את 0046_teacher_pay.sql ב-Supabase';
const missing = (code?: string) => code === '42P01' || code === 'PGRST205' || code === 'PGRST204';

/** תוספת לשכר: זמן (דקות) או סכום (בונוס), עם סיבה */
export async function addTeacherExtra(fd: FormData) {
  const db = await createClient();
  const back = backTo(fd, HOME);
  const teacherId = num(fd, 'teacher_id');
  const date = str(fd, 'extra_date');
  const value = num(fd, 'value');
  const reason = str(fd, 'reason');
  const isTime = str(fd, 'type') === 'minutes';
  if (!teacherId || !validDate(date) || !value || value <= 0) fail(back, 'יש למלא תאריך וכמות');
  if (!reason) fail(back, 'יש לכתוב סיבה');
  const { error } = await db.from('teacher_extras').insert({
    teacher_id: teacherId, extra_date: date, reason,
    minutes: isTime ? Math.round(value!) : null, amount: isTime ? null : value,
  });
  if (error) fail(back, missing(error.code) ? MISSING : dbMessage(error));
  done(back, isTime ? `נוספו ${Math.round(value!)} דקות` : 'התוספת נוספה');
}

export async function deleteTeacherExtra(fd: FormData) {
  const db = await createClient();
  const back = backTo(fd, HOME);
  const { error } = await db.from('teacher_extras').delete().eq('id', num(fd, 'id')!);
  if (error) fail(back, dbMessage(error));
  done(back, 'התוספת נמחקה');
}

/** אישור ותשלום שכר החודש: נרשם כהוצאה (שכר מורים) ב"הכנסות והוצאות", והחודש מסומן כשולם */
export async function approvePayroll(fd: FormData) {
  const db = await createClient();
  const back = backTo(fd, HOME);
  const teacherId = num(fd, 'teacher_id');
  const month = str(fd, 'month').slice(0, 7);
  const amount = num(fd, 'amount');
  if (!teacherId || !/^\d{4}-\d{2}$/.test(month)) fail(back, 'מורה או חודש לא תקינים');
  if (!amount || amount <= 0) fail(back, 'יש למלא סכום');
  const { data: t } = await db.from('teachers').select('first_name, last_name').eq('id', teacherId!).single();

  const { data: tx, error } = await db.from('transactions').insert({
    kind: 'expense', category: SALARY_CATEGORY, teacher_id: teacherId, counterparty: fullName(t),
    occurred_on: str(fd, 'paid_on') || new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' }),
    amount, method: oneOf(str(fd, 'method'), TX_METHODS) ?? 'bank_transfer',
    notes: `שכר ${monthLabel(`${month}-01`)}`,
  }).select('id, occurred_on').single();
  if (error || !tx) fail(back, dbMessage(error!));

  const { error: pe } = await db.from('teacher_payroll').insert({
    teacher_id: teacherId, month: `${month}-01`, amount, minutes: num(fd, 'minutes') ?? 0,
    transaction_id: tx!.id, paid_on: tx!.occurred_on,
  });
  if (pe) {
    await db.from('transactions').delete().eq('id', tx!.id);
    fail(back, missing(pe.code) ? MISSING : pe.code === '23505' ? 'השכר של החודש הזה כבר אושר' : dbMessage(pe));
  }
  done(back, `השכר של ${fullName(t)} ל${monthLabel(`${month}-01`)} אושר ונרשם כהוצאה`);
}

/** ביטול אישור השכר (גם ההוצאה ב"הכנסות והוצאות" נמחקת) */
export async function cancelPayroll(fd: FormData) {
  const db = await createClient();
  const back = backTo(fd, HOME);
  const teacherId = num(fd, 'teacher_id');
  const month = `${str(fd, 'month').slice(0, 7)}-01`;
  const { data: p } = await db.from('teacher_payroll').select('transaction_id').eq('teacher_id', teacherId!).eq('month', month).single();
  if (p?.transaction_id) await db.from('transactions').delete().eq('id', p.transaction_id);
  const { error } = await db.from('teacher_payroll').delete().eq('teacher_id', teacherId!).eq('month', month);
  if (error) fail(back, dbMessage(error));
  done(back, 'אישור השכר בוטל וההוצאה נמחקה');
}
