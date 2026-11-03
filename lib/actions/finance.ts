'use server';

import { TX_METHODS, type TxKind } from '../constants';
import { RECEIPT_BUCKET as BUCKET, receiptFile, uploadReceipt } from '../receiptFile';
import { createClient } from '../supabase/server';
import { backTo, dbMessage, done, fail, num, oneOf, str } from './util';

const HOME = '/finance';
const monthOf = (date: string) => `${HOME}?month=${date.slice(0, 7)}`;

/** הכנסה / הוצאה חדשה, או עדכון (כשיש id). משמש גם לרישום שכר מורה מהטבלה */
export async function saveTransaction(fd: FormData) {
  const db = await createClient();
  const id = num(fd, 'id');
  const here = backTo(fd, id ? `${HOME}/${id}` : HOME);
  const row = {
    kind: oneOf(str(fd, 'kind'), ['income', 'expense'] as TxKind[]),
    occurred_on: str(fd, 'occurred_on') || new Date().toISOString().slice(0, 10),
    amount: num(fd, 'amount'),
    category: str(fd, 'category'),
    counterparty: str(fd, 'counterparty'),
    teacher_id: num(fd, 'teacher_id'),
    method: oneOf(str(fd, 'method'), TX_METHODS) ?? 'bank_transfer',
    reference: str(fd, 'reference'),
    recurring: fd.get('recurring') === 'on',
    notes: str(fd, 'notes'),
  };
  if (!row.kind) fail(here, 'סוג לא תקין');
  if (!row.amount || row.amount <= 0) fail(here, 'יש למלא סכום גדול מאפס');
  if (!row.category) fail(here, 'יש לבחור קטגוריה');

  const file = receiptFile(fd);
  if (typeof file === 'string') fail(here, file);
  const { data: old } = id
    ? await db.from('transactions').select('receipt_path').eq('id', id).single()
    : { data: null };

  // קבלה: קובץ חדש מחליף את הקודם, או הסרה בתיבת סימון
  let receipt: { receipt_path?: string | null; receipt_name?: string } = {};
  if (file instanceof File) {
    const up = await uploadReceipt(db, file, row.occurred_on);
    if ('error' in up) fail(here, `העלאת הקבלה נכשלה: ${up.error}`);
    receipt = { receipt_path: (up as { path: string }).path, receipt_name: file.name };
  } else if (fd.get('remove_receipt') === 'on') {
    receipt = { receipt_path: null, receipt_name: '' };
  }

  const { error } = id
    ? await db.from('transactions').update({ ...row, ...receipt }).eq('id', id)
    : await db.from('transactions').insert({ ...row, ...receipt });
  if (error) {
    if (receipt.receipt_path) await db.storage.from(BUCKET).remove([receipt.receipt_path]);
    fail(here, dbMessage(error));
  }
  if (receipt.receipt_path !== undefined && old?.receipt_path) await db.storage.from(BUCKET).remove([old.receipt_path]);
  const label = row.kind === 'income' ? 'ההכנסה' : 'ההוצאה';
  done(id ? monthOf(row.occurred_on) : backTo(fd, monthOf(row.occurred_on)), id ? `${label} עודכנה` : `${label} נרשמה`);
}

export async function deleteTransaction(fd: FormData) {
  const db = await createClient();
  const back = backTo(fd, HOME);
  const id = num(fd, 'id')!;
  const { data: old } = await db.from('transactions').select('receipt_path').eq('id', id).single();
  const { error } = await db.from('transactions').delete().eq('id', id);
  if (error) fail(back, dbMessage(error));
  if (old?.receipt_path) await db.storage.from(BUCKET).remove([old.receipt_path]);
  done(back, 'נמחק');
}

/** מעתיק לחודש הנוכחי את הרישומים הקבועים מהחודש הקודם (שכירות, ביטוח...). מה שכבר הועתק לא מוכפל */
export async function copyRecurring(fd: FormData) {
  const db = await createClient();
  const month = str(fd, 'month'); // YYYY-MM-01
  const back = monthOf(month);
  const [y, m] = month.split('-').map(Number);
  const prev = new Date(Date.UTC(y, m - 2, 1)).toISOString().slice(0, 10);
  const next = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10);

  const [{ data: source, error: e1 }, { data: current, error: e2 }] = await Promise.all([
    db.from('transactions').select('*').eq('recurring', true).gte('occurred_on', prev).lt('occurred_on', month),
    db.from('transactions').select('kind,category,counterparty').gte('occurred_on', month).lt('occurred_on', next),
  ]);
  if (e1 || e2) fail(back, dbMessage((e1 ?? e2)!));

  const key = (t: { kind: string; category: string; counterparty: string }) => `${t.kind}|${t.category}|${t.counterparty}`;
  const have = new Set((current ?? []).map(key));
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const rows = (source ?? []).filter((t) => !have.has(key(t))).map((t) => {
    // אותו יום בחודש (או היום האחרון, אם החודש קצר יותר)
    const day = Math.min(Number(t.occurred_on.slice(8, 10)), lastDay);
    return {
      kind: t.kind, occurred_on: `${month.slice(0, 8)}${String(day).padStart(2, '0')}`, amount: t.amount,
      category: t.category, counterparty: t.counterparty, teacher_id: t.teacher_id, method: t.method,
      reference: '', recurring: true, notes: t.notes,
    };
  });
  if (rows.length) {
    const { error } = await db.from('transactions').insert(rows);
    if (error) fail(back, dbMessage(error));
  }
  done(back, rows.length ? `הועתקו ${rows.length} רישומים קבועים` : 'אין רישומים קבועים חדשים להעתקה');
}
