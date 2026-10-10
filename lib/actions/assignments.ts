'use server';

import { createClient } from '../supabase/server';
import { validateChoir, validateEnrollment, validateLesson } from '../rules';
import { LESSON_MINUTES } from '../constants';
import { overlaps, toMin } from '../time';
import { backTo, dbMessage, done, fail, num, status, str } from './util';

// ---- שיעורים פרטיים ----

export type QuickAssignResult = { ok: true; message: string } | { ok: false; error: string };

/**
 * חדר לשיעור: החדר הקבוע של המורה, ואם אין - חדר פנוי באותה שעה
 * בסניף של התלמיד/ה (אם המורה מלמד/ת שם) או באחד הסניפים של המורה.
 */
async function pickRoom(db: Awaited<ReturnType<typeof createClient>>, teacherId: number, studentId: number, weekday: number, start: string) {
  const [{ data: teacher }, { data: student }, { data: tb }, { data: rooms }, { data: busy }, { data: choirs }] = await Promise.all([
    db.from('teachers').select('room_id').eq('id', teacherId).single(),
    db.from('students').select('branch_id').eq('id', studentId).single(),
    db.from('teacher_branches').select('branch_id').eq('teacher_id', teacherId),
    db.from('rooms').select('id,branch_id').order('name'),
    db.from('lessons').select('room_id').eq('weekday', weekday).eq('start_time', start),
    db.from('choirs').select('room_id,start_time,end_time').eq('weekday', weekday),
  ]);
  if (teacher?.room_id) return teacher.room_id as number;

  const s = toMin(start);
  const taken = new Set([
    ...(busy ?? []).map((l) => l.room_id),
    ...(choirs ?? []).filter((c) => overlaps(s, s + LESSON_MINUTES, toMin(c.start_time), toMin(c.end_time))).map((c) => c.room_id),
  ]);
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
    return { ok: false, error: 'אין חדר פנוי בשעה זו בסניפים של המורה. אפשר להגדיר למורה חדר קבוע או סניף.' };
  }

  const row = { ...input, room_id: roomId, status: 'pending' as const, notes: '' };
  const err = await validateLesson(db, row);
  if (err) return { ok: false, error: err };

  const { error } = await db.from('lessons').insert(row);
  if (error) return { ok: false, error: dbMessage(error) };
  return { ok: true, message: 'השיעור שובץ (ממתין לאישור הורים)' };
}

export async function saveLesson(fd: FormData) {
  const db = await createClient();
  const id = num(fd, 'id');
  const here = backTo(fd, id ? `/lessons/${id}` : '/lessons/new');

  const teacherId = num(fd, 'teacher_id');
  let roomId = num(fd, 'room_id');
  if (teacherId && !roomId) {
    // ברירת מחדל: החדר של המורה
    const { data } = await db.from('teachers').select('room_id').eq('id', teacherId).single();
    roomId = data?.room_id ?? null;
  }
  const row = {
    student_id: num(fd, 'student_id'),
    teacher_id: teacherId,
    instrument_id: num(fd, 'instrument_id'),
    room_id: roomId,
    weekday: num(fd, 'weekday'),
    start_time: str(fd, 'start_time'),
    status: status(fd),
    notes: str(fd, 'notes'),
  };
  if (!row.student_id || !row.teacher_id || !row.instrument_id || row.weekday === null || !row.start_time)
    fail(here, 'יש למלא תלמיד/ה, מורה, כלי, יום ושעה');
  if (!row.room_id) fail(here, 'יש לבחור חדר (למורה אין חדר קבוע)');

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
