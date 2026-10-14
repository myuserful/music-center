'use server';

import { revalidatePath } from 'next/cache';
import { CALL_COLUMNS, type CallColumn, type Status } from '../constants';
import { createClient } from '../supabase/server';
import { dbMessage } from './util';

const COLUMN_STATUS: Record<CallColumn, Status> = {
  to_call: 'pending',
  no_answer: 'pending',
  undecided: 'undecided',
  confirmed: 'confirmed',
};

/**
 * הזזת תלמיד/ה בלוח הטלפונים.
 * "לא ענו" סופר ניסיון שיחה. "מתלבטים" / "אושר" מעדכנים את סטטוס כל השיבוצים שעוד לא סופיים
 * (ואם כולם כבר סופיים - את כולם, למשל כשמחזירים מ"אושר" אחורה).
 */
export async function moveCall(
  studentId: number, column: CallColumn,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!CALL_COLUMNS.includes(column)) return { ok: false, error: 'עמודה לא תקינה' };
  const db = await createClient();

  const [{ data: student, error: e1 }, { data: lessons, error: e2 }, { data: enrollments, error: e3 }] = await Promise.all([
    db.from('students').select('call_attempts').eq('id', studentId).single(),
    db.from('lessons').select('id,status').eq('student_id', studentId),
    db.from('choir_enrollments').select('id,status').eq('student_id', studentId),
  ]);
  const loadError = e1 ?? e2 ?? e3;
  if (loadError || !student) return { ok: false, error: loadError ? dbMessage(loadError) : 'התלמיד/ה לא נמצא/ה' };

  const target = COLUMN_STATUS[column];
  const pick = (rows: { id: number; status: Status }[]) => rows.filter((r) => r.status !== target).map((r) => r.id);
  const open = [...(lessons ?? []), ...(enrollments ?? [])].some((r) => r.status !== 'confirmed');
  // כשיש שיבוצים פתוחים - לא נוגעים בשיבוצים שכבר אושרו
  const scope = (rows: { id: number; status: Status }[]) =>
    pick(open && target !== 'confirmed' ? rows.filter((r) => r.status !== 'confirmed') : rows);
  const lessonIds = scope(lessons ?? []);
  const enrollmentIds = scope(enrollments ?? []);

  const now = new Date().toISOString();
  const studentRow =
    column === 'to_call' ? { call_state: 'to_call' } :
    column === 'no_answer' ? { call_state: 'no_answer', call_attempts: (student.call_attempts ?? 0) + 1, last_call_at: now } :
    { call_state: 'to_call', call_attempts: 0, last_call_at: now };

  // קודם התלמיד/ה: אם זה נכשל, לא משנים את סטטוס השיבוצים
  const { error: e4 } = await db.from('students').update(studentRow).eq('id', studentId);
  if (e4) return { ok: false, error: dbMessage(e4) };
  const results = await Promise.all([
    lessonIds.length ? db.from('lessons').update({ status: target }).in('id', lessonIds) : null,
    enrollmentIds.length ? db.from('choir_enrollments').update({ status: target }).in('id', enrollmentIds) : null,
  ]);
  const error = results.find((r) => r?.error)?.error;
  if (error) return { ok: false, error: dbMessage(error) };

  revalidatePath('/calls');
  revalidatePath('/tracking');
  return { ok: true };
}
