'use server';

import { revalidatePath } from 'next/cache';
import {
  CALL_COLUMNS, HEALTH_FUND_LABELS, PAYMENT_TRACKS, type CallColumn, type HealthFund, type Status,
} from '../constants';
import { DETAILS_TOPIC, missingDetails, type MissingKey } from '../missingDetails';
import { createClient } from '../supabase/server';
import type { Student } from '../types';
import { dbMessage, oneOf } from './util';

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

export type FollowupState = 'to_call' | 'no_answer' | 'waiting';
const FOLLOWUP_STATES: FollowupState[] = ['to_call', 'no_answer', 'waiting'];
type Result = { ok: true } | { ok: false; error: string };

/**
 * שיחה בנושא מסוים (למשל פרטים חסרים), לכל האחים יחד (זו אותה שיחה).
 * "לא ענו" סופר ניסיון, "ענו" נרשם עם ההערה. כל ניסיון שיחה נשמר בהיסטוריה.
 */
export async function moveFollowup(studentIds: number[], topic: string, state: FollowupState, note?: string): Promise<Result> {
  if (!FOLLOWUP_STATES.includes(state)) return { ok: false, error: 'עמודה לא תקינה' };
  if (!studentIds.length) return { ok: true };
  const db = await createClient();
  const { data: rows, error: e1 } = await db.from('call_followups').select('student_id,attempts,note')
    .eq('topic', topic).in('student_id', studentIds);
  if (e1) return { ok: false, error: dbMessage(e1) };
  const cur = new Map((rows ?? []).map((r) => [r.student_id as number, r]));
  // מונה הניסיונות של המשפחה: הגבוה מבין האחים
  const attempts = Math.max(0, ...(rows ?? []).map((r) => r.attempts as number));
  const familyNote = (rows ?? []).map((r) => r.note as string).find(Boolean) ?? '';

  const now = new Date().toISOString();
  const text = note ?? familyNote;
  const row =
    state === 'to_call' ? { state, attempts: 0 } :
    state === 'no_answer' ? { state, attempts: attempts + 1, last_call_at: now } :
    { state, attempts: cur.size ? attempts : 0, last_call_at: now };
  const { error: e2 } = await db.from('call_followups')
    .upsert(studentIds.map((id) => ({ student_id: id, topic, note: text, ...row })), { onConflict: 'student_id,topic' });
  if (e2) return { ok: false, error: dbMessage(e2) };

  if (state !== 'to_call') {
    const outcome = state === 'no_answer' ? 'no_answer' : 'answered';
    const { error: e3 } = await db.from('call_log').insert(studentIds.map((id) => ({ student_id: id, topic, outcome, note: text })));
    if (e3) return { ok: false, error: dbMessage(e3) };
  }
  revalidatePath('/calls');
  return { ok: true };
}

/** הערה לשיחה (מה ענו, מתי לחזור), בלי להזיז את הכרטיס. נשמרת לכל האחים */
export async function saveFollowupNote(studentIds: number[], topic: string, note: string): Promise<Result> {
  const db = await createClient();
  const { error } = await db.from('call_followups')
    .upsert(studentIds.map((id) => ({ student_id: id, topic, note: note.trim() })), { onConflict: 'student_id,topic' });
  if (error) return { ok: false, error: dbMessage(error) };
  revalidatePath('/calls');
  return { ok: true };
}

/**
 * פרט שהתקבל בשיחה: מעדכן ישר בכרטיס התלמיד/ה (או כמה אחים יחד, למשל אשראי לכל המשפחה).
 * מי שלא נשאר לו/ה שום דבר חסר - יוצא/ת מהשיחה בנושא.
 */
export async function receiveDetail(studentIds: number[], key: MissingKey, value = ''): Promise<Result> {
  const v = value.trim();
  const update: Partial<Record<string, unknown>> =
    key === 'contract' ? { contract_signed: true } :
    key === 'card' ? { card_on_file: true } :
    key === 'referral' ? { has_referral: true } :
    key === 'id_number' ? { id_number: v } :
    key === 'email' ? (v === 'none' ? { no_email: true } : { email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? v : '' }) :
    key === 'payment_track' ? { payment_track: oneOf(v, PAYMENT_TRACKS.filter((t) => t !== 'unknown')) } :
    { health_fund: oneOf(v, Object.keys(HEALTH_FUND_LABELS) as HealthFund[]) };
  const [field, val] = Object.entries(update)[0];
  if (val === null || val === '') return { ok: false, error: 'ערך לא תקין' };
  if (!studentIds.length) return { ok: true };

  const db = await createClient();
  const { data, error } = await db.from('students').update(update).in('id', studentIds).select('*');
  if (error || !data?.length) return { ok: false, error: error ? dbMessage(error) : `לא נשמר: ${field}` };
  const done = (data as Student[]).filter((s) => missingDetails(s).length === 0).map((s) => s.id);
  if (done.length) {
    await db.from('call_followups').delete().in('student_id', done).eq('topic', DETAILS_TOPIC);
  }
  revalidatePath('/calls');
  for (const id of studentIds) revalidatePath(`/students/${id}`);
  revalidatePath('/students');
  return { ok: true };
}
