'use server';

import { revalidatePath } from 'next/cache';
import { RECEIPT_FIELD_LABELS } from '../constants';
import { sendMail, studentEmail } from '../mail';
import { receiptPdfFile } from '../receiptPdf';
import { createClient } from '../supabase/server';
import type { ReceiptCertificate, Student } from '../types';
import { backTo, dbMessage, done, fail, num } from './util';

/** מחיקת אישור קבלה שהופק בטעות */
export async function deleteCertificate(fd: FormData) {
  const back = backTo(fd, '/certificates');
  const db = await createClient();
  const { error } = await db.from('receipt_certificates').delete().eq('id', num(fd, 'id')!);
  if (error) fail(back, dbMessage(error));
  revalidatePath('/certificates');
  done(back, 'נמחק');
}

/** שליחת אישור קבלה במייל של התלמיד/ה (כמו שמופיע בכרטיס), עם ה-PDF מצורף */
export async function emailCertificate(fd: FormData) {
  const back = backTo(fd, '/certificates');
  const db = await createClient();
  const { data: c } = await db.from('receipt_certificates').select('*').eq('id', num(fd, 'id')!).maybeSingle<ReceiptCertificate>();
  if (!c) fail(back, 'הקבלה לא נמצאה');
  const { data: s } = c!.student_id
    ? await db.from('students').select('*').eq('id', c!.student_id).maybeSingle<Student>()
    : { data: null };
  const to = studentEmail(s);
  if (!to) fail(back, 'אין מייל תקין בכרטיס התלמיד/ה');

  const { bytes, filename } = await receiptPdfFile({
    name: c!.name, idNumber: c!.id_number, gender: c!.gender, amount: Number(c!.amount), dates: c!.dates,
    number: c!.number, issuedOn: c!.issued_on, field: c!.field,
  });
  try {
    await sendMail({
      to,
      subject: `אישור קבלה - ${c!.name}`,
      text: [
        'שלום רב,',
        '',
        `מצורף אישור קבלה עבור ${c!.name}: ${c!.dates.length} טיפולים ב${RECEIPT_FIELD_LABELS[c!.field ?? 'expression']}.`,
        '',
        'בברכה,',
        'מקצב',
      ].join('\n'),
      attachments: [{ filename: filename.replace(/[\/:*?"<>|]/g, ''), content: bytes, contentType: 'application/pdf' }],
    });
  } catch (e) {
    fail(back, e instanceof Error ? e.message : 'שליחת המייל נכשלה');
  }
  // מתי ולאן נשלח. לפני 0051 אין עמודות - המייל בכל זאת נשלח
  const { error } = await db.from('receipt_certificates').update({ emailed_to: to, emailed_at: new Date().toISOString() }).eq('id', c!.id);
  if (error) console.error('receipt_certificates emailed:', error.message);
  revalidatePath('/certificates');
  done(back, `אישור הקבלה נשלח ל-${to}`);
}
