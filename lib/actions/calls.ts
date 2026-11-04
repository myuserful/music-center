'use server';

import { revalidatePath } from 'next/cache';
import {
  HEALTH_FUND_LABELS, INQUIRY_STATUSES, PAYMENT_TRACKS, URGENCIES, type HealthFund, type InquiryStatus, type Urgency,
} from '../constants';
import { withFamilies } from '../familySync';
import { DETAILS_TOPIC, missingDetails, type MissingKey } from '../missingDetails';
import { createClient } from '../supabase/server';
import type { Student } from '../types';
import { dbMessage, oneOf } from './util';

export type FollowupState = 'to_call' | 'no_answer' | 'waiting';
const FOLLOWUP_STATES: FollowupState[] = ['to_call', 'no_answer', 'waiting'];
type Result = { ok: true } | { ok: false; error: string };

/** טלפון לבירור מכרטיס התלמיד/ה: נכנס לעמודה "צריך להתקשר" */
export async function addInquiry(studentId: number, reason: string, urgency: Urgency): Promise<Result> {
  const text = reason.trim();
  if (!text) return { ok: false, error: 'צריך לכתוב למה מתקשרים' };
  if (!URGENCIES.includes(urgency)) return { ok: false, error: 'רמת דחיפות לא תקינה' };
  const db = await createClient();
  const { error } = await db.from('inquiries').insert({ student_id: studentId, reason: text, urgency });
  if (error) {
    return {
      ok: false,
      error: error.code === 'PGRST205' || error.code === '42P01'
        ? 'חסרה טבלת הבירורים במסד הנתונים. יש להריץ את הקובץ supabase/migrations/0055_inquiries.sql'
        : dbMessage(error),
    };
  }
  revalidatePath('/calls');
  return { ok: true };
}

/**
 * הזזת כרטיס בלוח הבירורים, עם כל הבירורים שבו (אחים = אותה שיחה).
 * "לא ענו" סופר ניסיון שיחה. "מתלבטים" / "טופל" רושמים שיחה ומאפסים את המונה.
 */
export async function moveInquiries(ids: number[], status: InquiryStatus): Promise<Result> {
  if (!INQUIRY_STATUSES.includes(status)) return { ok: false, error: 'עמודה לא תקינה' };
  if (!ids.length) return { ok: true };
  const db = await createClient();
  const { data: rows, error: e1 } = await db.from('inquiries').select('attempts').in('id', ids);
  if (e1) return { ok: false, error: dbMessage(e1) };
  const attempts = Math.max(0, ...(rows ?? []).map((r) => r.attempts as number));

  const now = new Date().toISOString();
  const row =
    status === 'to_call' ? { status } :
    status === 'no_answer' ? { status, attempts: attempts + 1, last_call_at: now } :
    { status, attempts: 0, last_call_at: now };
  const { error: e2 } = await db.from('inquiries').update(row).in('id', ids);
  if (e2) return { ok: false, error: dbMessage(e2) };
  revalidatePath('/calls');
  return { ok: true };
}

/** מחיקת בירור שנכנס בטעות */
export async function deleteInquiry(id: number): Promise<Result> {
  const db = await createClient();
  const { error } = await db.from('inquiries').delete().eq('id', id);
  if (error) return { ok: false, error: dbMessage(error) };
  revalidatePath('/calls');
  return { ok: true };
}

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
    key === 'email' ? (v === 'none' ? { no_email: true } : { email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? v : '', no_email: false }) :
    key === 'payment_track' ? { payment_track: oneOf(v, PAYMENT_TRACKS.filter((t) => t !== 'unknown')) } :
    { health_fund: oneOf(v, Object.keys(HEALTH_FUND_LABELS) as HealthFund[]) };
  const [field, val] = Object.entries(update)[0];
  if (val === null || val === '') return { ok: false, error: 'ערך לא תקין' };
  if (!studentIds.length) return { ok: true };

  const db = await createClient();
  // חוזה, אשראי ומייל עוברים לכל האחים. "אין מייל" רק למי שנבחרו, כדי לא לסמן מי שיש לו/ה מייל
  const shared = key === 'contract' || key === 'card' || (key === 'email' && v !== 'none');
  let targets = studentIds;
  if (shared) {
    try {
      targets = await withFamilies(db, studentIds);
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  }
  const { data, error } = await db.from('students').update(update).in('id', targets).select('*');
  if (error || !data?.length) return { ok: false, error: error ? dbMessage(error) : `לא נשמר: ${field}` };
  const done = (data as Student[]).filter((s) => missingDetails(s).length === 0).map((s) => s.id);
  if (done.length) {
    await db.from('call_followups').delete().in('student_id', done).eq('topic', DETAILS_TOPIC);
  }
  revalidatePath('/calls');
  for (const id of targets) revalidatePath(`/students/${id}`);
  revalidatePath('/students');
  return { ok: true };
}
