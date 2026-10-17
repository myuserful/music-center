'use server';

import { createClient } from '../supabase/server';
import { validateChoir, validateEnrollment, validateLesson } from '../rules';
import { LESSON_MINUTES, STATUSES, type Status } from '../constants';
import { overlaps, toMin } from '../time';
import { backTo, dbMessage, done, fail, num, status, str } from './util';

// ---- שיעורים פרטיים ----

export type QuickAssignResult = { ok: true; message: string } | { ok: false; error: string };

/** החדר של שעות העבודה של המורה שבהן נופלת השעה הזו (החדר שייך ליום ולשעות, לא למורה) */
async function hoursRoom(db: Awaited<ReturnType<typeof createClient>>, teacherId: number, weekday: number, start: string) {
  const { data } = await db.from('teacher_hours').select('room_id,start_time,end_time')
    .eq('teacher_id', teacherId).eq('weekday', weekday);
  const s = toMin(start);
  const h = (data ?? []).find((x) => toMin(x.start_time) <= s && s < toMin(x.end_time));
  return (h?.room_id as number | null) ?? null;
}

/**
 * חדר לשיעור: החדר של שעות העבודה של המורה באותו יום. אם הוא תפוס בשעה הזו - חדר פנוי אחר
 * באותו סניף. אם לא הוגדר חדר לשעות - חדר פנוי בסניף של התלמיד/ה (אם המורה מלמד/ת שם)
 * או באחד הסניפים של המורה.
 */
async function pickRoom(
  db: Awaited<ReturnType<typeof createClient>>, teacherId: number, studentId: number, weekday: number, start: string,
  excludeLessonId = -1,
) {
  const [hoursRoomId, { data: student }, { data: tb }, { data: rooms }, { data: busy }, { data: choirs }] = await Promise.all([
    hoursRoom(db, teacherId, weekday, start),
    db.from('students').select('branch_id').eq('id', studentId).single(),
    db.from('teacher_branches').select('branch_id').eq('teacher_id', teacherId),
    db.from('rooms').select('id,branch_id').order('name'),
    db.from('lessons').select('room_id,start_time').eq('weekday', weekday).neq('id', excludeLessonId),
    db.from('choirs').select('room_id,start_time,end_time').eq('weekday', weekday),
  ]);

  const s = toMin(start);
  const taken = new Set([
    ...(busy ?? []).filter((l) => overlaps(s, s + LESSON_MINUTES, toMin(l.start_time), toMin(l.start_time) + LESSON_MINUTES))
      .map((l) => l.room_id),
    ...(choirs ?? []).filter((c) => overlaps(s, s + LESSON_MINUTES, toMin(c.start_time), toMin(c.end_time))).map((c) => c.room_id),
  ]);

  if (hoursRoomId) {
    if (!taken.has(hoursRoomId)) return hoursRoomId;
    const branch = (rooms ?? []).find((r) => r.id === hoursRoomId)?.branch_id;
    const free = (rooms ?? []).find((r) => r.branch_id === branch && !taken.has(r.id));
    return (free?.id as number | undefined) ?? null;
  }

  const teacherBranches = (tb ?? []).map((x) => x.branch_id as number);
  const branchOrder = [
    ...(student?.branch_id && teacherBranches.includes(student.branch_id) ? [student.branch_id as number] : []),
    ...teacherBranches,
    ...(teacherBranches.length === 0 && student?.branch_id ? [student.branch_id as number] : []),
  ];
  for (const b of branchOrder) {
    const free = (rooms ?? []).find((r) => r.branch_id === b && !taken.has(r.id));
    if (free) return free.id as number;
  }
  return null;
}

/** שיבוץ מהיר מלוח הגרירה: תלמיד/ה + מורה + יום + שעה. */
export async function quickAssign(input: {
  student_id: number; teacher_id: number; instrument_id: number; weekday: number; start_time: string;
}): Promise<QuickAssignResult> {
  const db = await createClient();
  const roomId = await pickRoom(db, input.teacher_id, input.student_id, input.weekday, input.start_time);
  if (!roomId) {
    return { ok: false, error: 'אין חדר פנוי בשעה זו. אפשר להגדיר חדר לשעות העבודה של המורה ביום הזה (בדף המורה).' };
  }

  const row = { ...input, room_id: roomId, status: 'pending' as const, notes: '' };
  const err = await validateLesson(db, row);
  if (err) return { ok: false, error: err };

  const { error } = await db.from('lessons').insert(row);
  if (error) return { ok: false, error: dbMessage(error) };
  return { ok: true, message: 'השיעור שובץ (ממתין לאישור הורים)' };
}

/** הזזת שיעור בלוח הגרירה: לשעה אחרת ו/או למורה אחר/ת. הסטטוס נשמר, החדר נבחר מחדש. */
export async function moveLesson(id: number, input: {
  teacher_id: number; instrument_id: number; weekday: number; start_time: string;
}): Promise<QuickAssignResult> {
  const db = await createClient();
  const { data: lesson } = await db.from('lessons').select('student_id').eq('id', id).single();
  if (!lesson) return { ok: false, error: 'השיעור לא נמצא' };

  const roomId = await pickRoom(db, input.teacher_id, lesson.student_id, input.weekday, input.start_time, id);
  if (!roomId) {
    return { ok: false, error: 'אין חדר פנוי בשעה זו. אפשר להגדיר חדר לשעות העבודה של המורה ביום הזה (בדף המורה).' };
  }
  const row = { ...input, student_id: lesson.student_id as number, room_id: roomId };
  const err = await validateLesson(db, row, id);
  if (err) return { ok: false, error: err };

  const { error } = await db.from('lessons').update(row).eq('id', id);
  if (error) return { ok: false, error: dbMessage(error) };
  return { ok: true, message: 'השיעור הועבר' };
}

/** שינוי סטטוס שיעור מלוח הגרירה (למשל אישור הורים) בלי מעבר עמוד */
export async function changeLessonStatus(id: number, next: Status): Promise<QuickAssignResult> {
  if (!STATUSES.includes(next)) return { ok: false, error: 'סטטוס לא תקין' };
  const db = await createClient();
  const { error } = await db.from('lessons').update({ status: next }).eq('id', id);
  if (error) return { ok: false, error: dbMessage(error) };
  return { ok: true, message: 'הסטטוס עודכן' };
}

/** רישום מהיר למקהלה מלוח הגרירה (ממתין לאישור הורים) */
export async function quickEnroll(choirId: number, studentId: number): Promise<QuickAssignResult> {
  const db = await createClient();
  const err = await validateEnrollment(db, choirId, studentId);
  if (err) return { ok: false, error: err };
  const { error } = await db.from('choir_enrollments').insert({ choir_id: choirId, student_id: studentId, status: 'pending' });
  if (error) return { ok: false, error: error.code === '23505' ? 'התלמיד/ה כבר רשום/ה למקהלה הזו' : dbMessage(error) };
  return { ok: true, message: 'נרשם/ה למקהלה (ממתין לאישור הורים)' };
}

/** מחיקת שיעור מלוח הגרירה (בלי מעבר עמוד) */
export async function removeLesson(id: number): Promise<QuickAssignResult> {
  const db = await createClient();
  const { error } = await db.from('lessons').delete().eq('id', id);
  if (error) return { ok: false, error: dbMessage(error) };
  return { ok: true, message: 'השיעור נמחק' };
}

export async function saveLesson(fd: FormData) {
  const db = await createClient();
  const id = num(fd, 'id');
  const here = backTo(fd, id ? `/lessons/${id}` : '/lessons/new');

  const teacherId = num(fd, 'teacher_id');
  let roomId = num(fd, 'room_id');
  const weekday = num(fd, 'weekday');
  const startTime = str(fd, 'start_time');
  if (teacherId && !roomId && weekday !== null && startTime) {
    // ברירת מחדל: החדר של שעות העבודה של המורה באותו יום
    roomId = await hoursRoom(db, teacherId, weekday, startTime);
  }
  const row = {
    student_id: num(fd, 'student_id'),
    teacher_id: teacherId,
    instrument_id: num(fd, 'instrument_id'),
    room_id: roomId,
    weekday,
    start_time: startTime,
    status: status(fd),
    notes: str(fd, 'notes'),
  };
  if (!row.student_id || !row.teacher_id || !row.instrument_id || row.weekday === null || !row.start_time)
    fail(here, 'יש למלא תלמיד/ה, מורה, כלי, יום ושעה');
  if (!row.room_id) fail(here, 'יש לבחור חדר (לא הוגדר חדר לשעות העבודה של המורה ביום הזה)');

  const err = await validateLesson(db, row as Parameters<typeof validateLesson>[1], id ?? undefined);
  if (err) fail(here, err);

  const { error } = id
    ? await db.from('lessons').update(row).eq('id', id)
    : await db.from('lessons').insert(row);
  if (error) fail(here, dbMessage(error));
  done(str(fd, 'after') || `/students/${row.student_id}`, 'השיעור נשמר');
}

export async function setLessonStatus(fd: FormData) {
  const db = await createClient();
  const back = backTo(fd, '/tracking');
  const { error } = await db.from('lessons').update({ status: status(fd) }).eq('id', num(fd, 'id')!);
  if (error) fail(back, dbMessage(error));
  done(back, 'הסטטוס עודכן');
}

/** סירוב הורים או ביטול = מחיקת השיבוץ */
export async function deleteLesson(fd: FormData) {
  const db = await createClient();
  const back = backTo(fd, '/tracking');
  const { error } = await db.from('lessons').delete().eq('id', num(fd, 'id')!);
  if (error) fail(back, dbMessage(error));
  done(back, 'השיבוץ נמחק');
}

// ---- מקהלות ----

export async function saveChoir(fd: FormData) {
  const db = await createClient();
  const id = num(fd, 'id');
  const here = id ? `/choirs/${id}` : '/choirs/new';
  const row = {
    name: str(fd, 'name'),
    teacher_id: num(fd, 'teacher_id'),
    room_id: num(fd, 'room_id'),
    weekday: num(fd, 'weekday'),
    start_time: str(fd, 'start_time'),
    end_time: str(fd, 'end_time'),
    notes: str(fd, 'notes'),
    price_private: num(fd, 'price_private'),
    price_maccabi_1: num(fd, 'price_maccabi_1'),
    price_maccabi_2: num(fd, 'price_maccabi_2'),
    commitments: num(fd, 'commitments'),
  };
  if (!row.name || !row.teacher_id || !row.room_id || row.weekday === null || !row.start_time || !row.end_time)
    fail(here, 'יש למלא את כל השדות');

  const err = await validateChoir(db, row as Parameters<typeof validateChoir>[1], id ?? undefined);
  if (err) fail(here, err);

  if (id) {
    const { error } = await db.from('choirs').update(row).eq('id', id);
    if (error) fail(here, dbMessage(error));
    done(here);
  }
  const { data, error } = await db.from('choirs').insert(row).select('id').single();
  if (error || !data) fail(here, dbMessage(error!));
  done(`/choirs/${data!.id}`, 'המקהלה נוצרה');
}

export async function deleteChoir(fd: FormData) {
  const db = await createClient();
  const id = num(fd, 'id')!;
  const { error } = await db.from('choirs').delete().eq('id', id);
  if (error) fail(`/choirs/${id}`, dbMessage(error));
  done('/choirs', 'נמחק');
}

export async function addEnrollment(fd: FormData) {
  const db = await createClient();
  const choirId = num(fd, 'choir_id');
  const studentId = num(fd, 'student_id');
  const back = backTo(fd, `/choirs/${choirId}`);
  if (!choirId || !studentId) fail(back, 'יש לבחור מקהלה ותלמיד/ה');

  const err = await validateEnrollment(db, choirId!, studentId!);
  if (err) fail(back, err);

  const { error } = await db.from('choir_enrollments')
    .insert({ choir_id: choirId, student_id: studentId, status: status(fd) });
  if (error) fail(back, error.code === '23505' ? 'התלמיד/ה כבר רשום/ה למקהלה הזו' : dbMessage(error));
  done(back, 'נרשם/ה למקהלה');
}

export async function setEnrollmentStatus(fd: FormData) {
  const db = await createClient();
  const back = backTo(fd, '/tracking');
  const { error } = await db.from('choir_enrollments').update({ status: status(fd) }).eq('id', num(fd, 'id')!);
  if (error) fail(back, dbMessage(error));
  done(back, 'הסטטוס עודכן');
}

export async function deleteEnrollment(fd: FormData) {
  const db = await createClient();
  const back = backTo(fd, '/tracking');
  const { error } = await db.from('choir_enrollments').delete().eq('id', num(fd, 'id')!);
  if (error) fail(back, dbMessage(error));
  done(back, 'הרישום נמחק');
}
