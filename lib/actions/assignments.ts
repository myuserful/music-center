'use server';

import { createClient } from '../supabase/server';
import { validateChoir, validateEnrollment, validateLesson } from '../rules';
import { backTo, dbMessage, done, fail, num, status, str } from './util';

// ---- שיעורים פרטיים ----

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
