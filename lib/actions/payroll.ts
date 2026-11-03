'use server';

import { monthLabel } from '../billing';
import { SALARY_CATEGORY, TX_METHODS } from '../constants';
import { validDate } from '../day';
import { RECEIPT_BUCKET, receiptFile, uploadReceipt } from '../receiptFile';
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

/** אישור ותשלום שכר החודש: נרשם כהוצאה (שכר מורים) ב"הכנסות והוצאות", והחודש מסומן כשולם. אפשר לצרף אסמכתא להעברה */
export async function approvePayroll(fd: FormData) {
  const db = await createClient();
  const back = backTo(fd, HOME);
  const teacherId = num(fd, 'teacher_id');
  const month = str(fd, 'month').slice(0, 7);
  const amount = num(fd, 'amount');
  if (!teacherId || !/^\d{4}-\d{2}$/.test(month)) fail(back, 'מורה או חודש לא תקינים');
  if (!amount || amount <= 0) fail(back, 'יש למלא סכום');
  const file = receiptFile(fd);
  if (typeof file === 'string') fail(back, file);
  const { data: t } = await db.from('teachers').select('first_name, last_name').eq('id', teacherId!).single();
  const occurredOn = str(fd, 'paid_on') || new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' });

  let proofPath: string | null = null;
  if (file instanceof File) {
    const up = await uploadReceipt(db, file, occurredOn);
    if ('error' in up) fail(back, `העלאת האסמכתא נכשלה: ${up.error}`);
    proofPath = (up as { path: string }).path;
  }
  const dropProof = async () => {
    if (proofPath) await db.storage.from(RECEIPT_BUCKET).remove([proofPath]);
  };

  const { data: tx, error } = await db.from('transactions').insert({
    kind: 'expense', category: SALARY_CATEGORY, teacher_id: teacherId, counterparty: fullName(t),
    occurred_on: occurredOn,
    amount, method: oneOf(str(fd, 'method'), TX_METHODS) ?? 'bank_transfer',
    reference: str(fd, 'reference'),
    receipt_path: proofPath, receipt_name: file instanceof File ? file.name : '',
    notes: `שכר ${monthLabel(`${month}-01`)}`,
  }).select('id, occurred_on').single();
  if (error || !tx) {
    await dropProof();
    fail(back, dbMessage(error!));
  }

  const { error: pe } = await db.from('teacher_payroll').insert({
    teacher_id: teacherId, month: `${month}-01`, amount, minutes: num(fd, 'minutes') ?? 0,
    transaction_id: tx!.id, paid_on: tx!.occurred_on,
  });
  if (pe) {
    await db.from('transactions').delete().eq('id', tx!.id);
    await dropProof();
    fail(back, missing(pe.code) ? MISSING : pe.code === '23505' ? 'השכר של החודש הזה כבר אושר' : dbMessage(pe));
  }
  done(back, `השכר של ${fullName(t)} ל${monthLabel(`${month}-01`)} אושר ונרשם כהוצאה`);
}

/** צירוף או החלפה של אסמכתא לשכר שכבר אושר (למשל כשההעברה בוצעה אחרי האישור) */
export async function attachPayrollProof(fd: FormData) {
  const db = await createClient();
  const back = backTo(fd, HOME);
  const file = receiptFile(fd);
  if (typeof file === 'string') fail(back, file);
  const reference = str(fd, 'reference');
  if (!file && !reference) fail(back, 'יש לבחור קובץ או לכתוב מספר אסמכתא');

  const { data: p } = await db.from('teacher_payroll').select('transaction_id, paid_on')
    .eq('teacher_id', num(fd, 'teacher_id')!).eq('month', `${str(fd, 'month').slice(0, 7)}-01`).single();
  if (!p?.transaction_id) fail(back, 'לא נמצאה ההוצאה של השכר הזה');
  const { data: old } = await db.from('transactions').select('receipt_path').eq('id', p!.transaction_id).single();

  let proof: { receipt_path: string; receipt_name: string } | null = null;
  if (file instanceof File) {
    const up = await uploadReceipt(db, file, p!.paid_on);
    if ('error' in up) fail(back, `העלאת האסמכתא נכשלה: ${up.error}`);
    proof = { receipt_path: (up as { path: string }).path, receipt_name: file.name };
  }
  const { error } = await db.from('transactions').update({ reference, ...proof }).eq('id', p!.transaction_id);
  if (error) {
    if (proof) await db.storage.from(RECEIPT_BUCKET).remove([proof.receipt_path]);
    fail(back, dbMessage(error));
  }
  if (proof && old?.receipt_path) await db.storage.from(RECEIPT_BUCKET).remove([old.receipt_path]);
  done(back, 'האסמכתא נשמרה');
}

/** ביטול אישור השכר (גם ההוצאה ב"הכנסות והוצאות" והאסמכתא נמחקות) */
export async function cancelPayroll(fd: FormData) {
  const db = await createClient();
  const back = backTo(fd, HOME);
  const teacherId = num(fd, 'teacher_id');
  const month = `${str(fd, 'month').slice(0, 7)}-01`;
  const { data: p } = await db.from('teacher_payroll').select('transaction_id').eq('teacher_id', teacherId!).eq('month', month).single();
  if (p?.transaction_id) {
    const { data: tx } = await db.from('transactions').select('receipt_path').eq('id', p.transaction_id).single();
    await db.from('transactions').delete().eq('id', p.transaction_id);
    if (tx?.receipt_path) await db.storage.from(RECEIPT_BUCKET).remove([tx.receipt_path]);
  }
  const { error } = await db.from('teacher_payroll').delete().eq('teacher_id', teacherId!).eq('month', month);
  if (error) fail(back, dbMessage(error));
  done(back, 'אישור השכר בוטל וההוצאה נמחקה');
}
