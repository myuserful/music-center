'use server';

import { createClient } from '../supabase/server';
import { toMin } from '../time';
import { dbMessage, done, fail, num, str } from './util';

// ---- מורים ----

export async function saveTeacher(fd: FormData) {
  const db = await createClient();
  const id = num(fd, 'id');
  const here = id ? `/teachers/${id}` : '/teachers/new';
  const row = {
    first_name: str(fd, 'first_name'),
    last_name: str(fd, 'last_name'),
    phone: str(fd, 'phone'),
    email: str(fd, 'email'),
    room_id: num(fd, 'room_id'),
    notes: str(fd, 'notes'),
    active: fd.get('active') === 'on',
  };
  if (!row.first_name || !row.last_name) fail(here, 'חסר שם פרטי או שם משפחה');

  let teacherId = id;
  if (id) {
    const { error } = await db.from('teachers').update(row).eq('id', id);
    if (error) fail(here, dbMessage(error));
  } else {
    const { data, error } = await db.from('teachers').insert(row).select('id').single();
    if (error || !data) fail(here, dbMessage(error!));
    teacherId = data!.id;
  }

  // כלי נגינה: מחליפים את כל הרשימה
  const instrumentIds = fd.getAll('instrument_ids').map(Number);
  await db.from('teacher_instruments').delete().eq('teacher_id', teacherId!);
  if (instrumentIds.length) {
    const { error } = await db.from('teacher_instruments')
      .insert(instrumentIds.map((instrument_id) => ({ teacher_id: teacherId, instrument_id })));
    if (error) fail(`/teachers/${teacherId}`, dbMessage(error));
  }
  done(`/teachers/${teacherId}`);
}

export async function deleteTeacher(fd: FormData) {
  const db = await createClient();
  const id = num(fd, 'id')!;
  const { error } = await db.from('teachers').delete().eq('id', id);
  if (error) fail(`/teachers/${id}`, 'לא ניתן למחוק מורה עם שיעורים או מקהלות. אפשר לסמן "לא פעיל/ה".');
  done('/teachers', 'נמחק');
}

export async function addTeacherHours(fd: FormData) {
  const db = await createClient();
  const teacherId = num(fd, 'teacher_id')!;
  const here = `/teachers/${teacherId}`;
  const row = {
    teacher_id: teacherId,
    weekday: num(fd, 'weekday'),
    start_time: str(fd, 'start_time'),
    end_time: str(fd, 'end_time'),
  };
  if (row.weekday === null || !row.start_time || !row.end_time) fail(here, 'חסרים פרטים');
  if (toMin(row.end_time) <= toMin(row.start_time)) fail(here, 'שעת הסיום חייבת להיות אחרי ההתחלה');
  const { error } = await db.from('teacher_hours').insert(row);
  if (error) fail(here, dbMessage(error));
  done(here);
}

export async function deleteTeacherHours(fd: FormData) {
  const db = await createClient();
  const here = `/teachers/${num(fd, 'teacher_id')}`;
  const { error } = await db.from('teacher_hours').delete().eq('id', num(fd, 'id')!);
  if (error) fail(here, dbMessage(error));
  done(here, 'נמחק');
}

// ---- תלמידים ----

export async function saveStudent(fd: FormData) {
  const db = await createClient();
  const id = num(fd, 'id');
  const here = id ? `/students/${id}` : '/students/new';
  const row = {
    first_name: str(fd, 'first_name'),
    last_name: str(fd, 'last_name'),
    grade: str(fd, 'grade'),
    birth_date: str(fd, 'birth_date') || null,
    branch_id: num(fd, 'branch_id'),
    requested_instrument_id: num(fd, 'requested_instrument_id'),
    notes: str(fd, 'notes'),
    active: fd.get('active') === 'on',
  };
  if (!row.first_name || !row.last_name) fail(here, 'חסר שם פרטי או שם משפחה');

  if (id) {
    const { error } = await db.from('students').update(row).eq('id', id);
    if (error) fail(here, dbMessage(error));
    done(here);
  }
  const { data, error } = await db.from('students').insert(row).select('id').single();
  if (error || !data) fail(here, dbMessage(error!));

  // איש קשר ראשי אופציונלי כבר ביצירה
  const contactName = str(fd, 'contact_name');
  if (contactName) {
    await db.from('contacts').insert({
      student_id: data!.id, name: contactName, relation: str(fd, 'contact_relation'),
      phone: str(fd, 'contact_phone'), email: '', is_primary: true,
    });
  }
  done(`/students/${data!.id}`, 'התלמיד/ה נוספ/ה');
}

export async function deleteStudent(fd: FormData) {
  const db = await createClient();
  const id = num(fd, 'id')!;
  const { error } = await db.from('students').delete().eq('id', id);
  if (error) fail(`/students/${id}`, dbMessage(error));
  done('/students', 'נמחק');
}

export async function saveContact(fd: FormData) {
  const db = await createClient();
  const studentId = num(fd, 'student_id')!;
  const here = `/students/${studentId}`;
  const row = {
    student_id: studentId,
    name: str(fd, 'name'),
    relation: str(fd, 'relation'),
    phone: str(fd, 'phone'),
    email: str(fd, 'email'),
    is_primary: fd.get('is_primary') === 'on',
  };
  if (!row.name) fail(here, 'חסר שם איש קשר');
  if (row.is_primary) await db.from('contacts').update({ is_primary: false }).eq('student_id', studentId);
  const { error } = await db.from('contacts').insert(row);
  if (error) fail(here, dbMessage(error));
  done(here);
}

export async function deleteContact(fd: FormData) {
  const db = await createClient();
  const here = `/students/${num(fd, 'student_id')}`;
  const { error } = await db.from('contacts').delete().eq('id', num(fd, 'id')!);
  if (error) fail(here, dbMessage(error));
  done(here, 'נמחק');
}
