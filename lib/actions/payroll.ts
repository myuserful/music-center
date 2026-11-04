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

type UploadedFiles = { fields: { receipt_path?: string; receipt_name?: string; proof_path?: string; proof_name?: string }; paths: string[] };

/** מעלה את הקבלה ואת קובץ האסמכתא שנבחרו בטופס. עוצר בהודעה אם קובץ לא תקין או שההעלאה נכשלה */
async function uploadPayFiles(db: Awaited<ReturnType<typeof createClient>>, fd: FormData, back: string, date: string): Promise<UploadedFiles> {
  const receipt = receiptFile(fd);
  const proof = receiptFile(fd, 'proof');
  if (typeof receipt === 'string') fail(back, receipt);
  if (typeof proof === 'string') fail(back, proof);
  const out: UploadedFiles = { fields: {}, paths: [] };
  for (const [file, label, key] of [[receipt, 'הקבלה', 'receipt'], [proof, 'האסמכתא', 'proof']] as const) {
    if (!(file instanceof File)) continue;
    const up = await uploadReceipt(db, file, date);
    if ('error' in up) {
      if (out.paths.length) await db.storage.from(RECEIPT_BUCKET).remove(out.paths);
      fail(back, `העלאת ${label} נכשלה: ${up.error}`);
    }
    const path = (up as { path: string }).path;
    out.paths.push(path);
    out.fields[`${key}_path`] = path;
    out.fields[`${key}_name`] = file.name;
  }
  return out;
}

const MISSING_PROOF = 'צריך להריץ את 0060_transaction_proof.sql ב-Supabase כדי לשמור קובץ אסמכתא';

/** אישור ותשלום שכר החודש: נרשם כהוצאה (שכר מורים) ב"הכנסות והוצאות", והחודש מסומן כשולם. קבלה ואסמכתא מצרפים כאן או אחרי התשלום. בלי קבלה: "חסרה קבלה" */
export async function approvePayroll(fd: FormData) {
  const db = await createClient();
  const back = backTo(fd, HOME);
  const teacherId = num(fd, 'teacher_id');
  const month = str(fd, 'month').slice(0, 7);
  const amount = num(fd, 'amount');
  if (!teacherId || !/^\d{4}-\d{2}$/.test(month)) fail(back, 'מורה או חודש לא תקינים');
  if (!amount || amount <= 0) fail(back, 'יש למלא סכום');
  const { data: t } = await db.from('teachers').select('first_name, last_name').eq('id', teacherId!).single();
  const occurredOn = str(fd, 'paid_on') || new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' });

  const { fields, paths } = await uploadPayFiles(db, fd, back, occurredOn);
  const dropFiles = async () => {
    if (paths.length) await db.storage.from(RECEIPT_BUCKET).remove(paths);
  };

  const { data: tx, error } = await db.from('transactions').insert({
    kind: 'expense', category: SALARY_CATEGORY, teacher_id: teacherId, counterparty: fullName(t),
    occurred_on: occurredOn,
    amount, method: oneOf(str(fd, 'method'), TX_METHODS) ?? 'bank_transfer',
    reference: str(fd, 'reference'),
    ...fields,
    notes: `שכר ${monthLabel(`${month}-01`)}`,
  }).select('id, occurred_on').single();
  if (error || !tx) {
    await dropFiles();
    fail(back, error?.code === 'PGRST204' ? MISSING_PROOF : dbMessage(error!));
  }

  const { error: pe } = await db.from('teacher_payroll').insert({
    teacher_id: teacherId, month: `${month}-01`, amount, minutes: num(fd, 'minutes') ?? 0,
    transaction_id: tx!.id, paid_on: tx!.occurred_on,
  });
  if (pe) {
    await db.from('transactions').delete().eq('id', tx!.id);
    await dropFiles();
    fail(back, missing(pe.code) ? MISSING : pe.code === '23505' ? 'השכר של החודש הזה כבר אושר' : dbMessage(pe));
  }
  done(back, `השכר של ${fullName(t)} ל${monthLabel(`${month}-01`)} אושר ונרשם כהוצאה.${fields.receipt_path ? '' : ' חסרה קבלה: צריך לצרף אותה לתשלום'}`);
}

/** צירוף או החלפה של קבלה ואסמכתא לשכר ששולם. הן מקושרות להוצאה ב"הכנסות והוצאות" */
export async function attachPayrollProof(fd: FormData) {
  const db = await createClient();
  const back = backTo(fd, HOME);
  const reference = str(fd, 'reference');

  const { data: p } = await db.from('teacher_payroll').select('transaction_id, paid_on')
    .eq('teacher_id', num(fd, 'teacher_id')!).eq('month', `${str(fd, 'month').slice(0, 7)}-01`).single();
  if (!p?.transaction_id) fail(back, 'לא נמצאה ההוצאה של השכר הזה');
  const { data: old } = await db.from('transactions').select('*').eq('id', p!.transaction_id).single();

  const { fields, paths } = await uploadPayFiles(db, fd, back, p!.paid_on);
  if (!paths.length && !reference) fail(back, 'יש לבחור קובץ או לכתוב מספר אסמכתא');
  const { error } = await db.from('transactions').update({ reference, ...fields }).eq('id', p!.transaction_id);
  if (error) {
    if (paths.length) await db.storage.from(RECEIPT_BUCKET).remove(paths);
    fail(back, error.code === 'PGRST204' ? MISSING_PROOF : dbMessage(error));
  }
  const replaced = [fields.receipt_path && old?.receipt_path, fields.proof_path && old?.proof_path].filter(Boolean) as string[];
  if (replaced.length) await db.storage.from(RECEIPT_BUCKET).remove(replaced);
  done(back, fields.receipt_path || old?.receipt_path ? 'נשמר וקושר להוצאה' : 'נשמר. עדיין חסרה קבלה');
}

/** ביטול אישור השכר (גם ההוצאה ב"הכנסות והוצאות", הקבלה והאסמכתא נמחקות) */
export async function cancelPayroll(fd: FormData) {
  const db = await createClient();
  const back = backTo(fd, HOME);
  const teacherId = num(fd, 'teacher_id');
  const month = `${str(fd, 'month').slice(0, 7)}-01`;
  const { data: p } = await db.from('teacher_payroll').select('transaction_id').eq('teacher_id', teacherId!).eq('month', month).single();
  if (p?.transaction_id) {
    const { data: tx } = await db.from('transactions').select('*').eq('id', p.transaction_id).single();
    await db.from('transactions').delete().eq('id', p.transaction_id);
    const files = [tx?.receipt_path, tx?.proof_path].filter(Boolean) as string[];
    if (files.length) await db.storage.from(RECEIPT_BUCKET).remove(files);
  }
  const { error } = await db.from('teacher_payroll').delete().eq('teacher_id', teacherId!).eq('month', month);
  if (error) fail(back, dbMessage(error));
  done(back, 'אישור השכר בוטל וההוצאה נמחקה');
}
