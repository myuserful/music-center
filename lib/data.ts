import 'server-only';
import { freeSlots, type Busy } from './availability';
import { LESSON_MINUTES } from './constants';
import { toMin } from './time';
import type { DB } from './supabase/server';
import type {
  Branch, Choir, Contact, Enrollment, Instrument, Lesson, Room, Student, Teacher, TeacherHours,
} from './types';

/** טוען את כל נתוני המערכת. מרכז מוזיקה הוא בהיקף של מאות רשומות, אז זה פשוט ומהיר. */
export async function loadAll(db: DB) {
  const [branches, rooms, instruments, teachers, ti, hours, students, contacts, lessons, choirs, enrollments] =
    await Promise.all([
      db.from('branches').select('*').order('name'),
      db.from('rooms').select('*').order('name'),
      db.from('instruments').select('*').order('name'),
      db.from('teachers').select('*').order('first_name'),
      db.from('teacher_instruments').select('*'),
      db.from('teacher_hours').select('*').order('weekday').order('start_time'),
      db.from('students').select('*').order('first_name'),
      db.from('contacts').select('*').order('is_primary', { ascending: false }),
      db.from('lessons').select('*').order('weekday').order('start_time'),
      db.from('choirs').select('*').order('weekday').order('start_time'),
      db.from('choir_enrollments').select('*').order('created_at'),
    ]);

  const firstError = [branches, rooms, instruments, teachers, ti, hours, students, contacts, lessons, choirs, enrollments]
    .find((r) => r.error)?.error;
  if (firstError) throw new Error(firstError.message);

  const data = {
    branches: branches.data as Branch[],
    rooms: rooms.data as Room[],
    instruments: instruments.data as Instrument[],
    teachers: teachers.data as Teacher[],
    teacherInstruments: ti.data as { teacher_id: number; instrument_id: number }[],
    hours: hours.data as TeacherHours[],
    students: students.data as Student[],
    contacts: contacts.data as Contact[],
    lessons: lessons.data as Lesson[],
    choirs: choirs.data as Choir[],
    enrollments: enrollments.data as Enrollment[],
  };

  const byId = <T extends { id: number }>(rows: T[]) => new Map(rows.map((r) => [r.id, r]));
  const maps = {
    branch: byId(data.branches),
    room: byId(data.rooms),
    instrument: byId(data.instruments),
    teacher: byId(data.teachers),
    student: byId(data.students),
    choir: byId(data.choirs),
  };

  const roomLabel = (id: number | null) => {
    const r = id ? maps.room.get(id) : undefined;
    return r ? `${r.name} · ${maps.branch.get(r.branch_id)?.name ?? ''}` : '';
  };
  const primaryContact = (studentId: number) => data.contacts.find((c) => c.student_id === studentId);
  const teacherInstrumentIds = (teacherId: number) =>
    data.teacherInstruments.filter((x) => x.teacher_id === teacherId).map((x) => x.instrument_id);

  /** זמנים תפוסים של מורה (שיעורים + מקהלות) */
  const teacherBusy = (teacherId: number): Busy[] => [
    ...data.lessons.filter((l) => l.teacher_id === teacherId)
      .map((l) => ({ weekday: l.weekday, start: toMin(l.start_time), end: toMin(l.start_time) + LESSON_MINUTES })),
    ...data.choirs.filter((c) => c.teacher_id === teacherId)
      .map((c) => ({ weekday: c.weekday, start: toMin(c.start_time), end: toMin(c.end_time) })),
  ];
  const teacherFree = (teacherId: number) =>
    freeSlots(data.hours.filter((h) => h.teacher_id === teacherId), teacherBusy(teacherId));

  const assignedStudentIds = new Set([
    ...data.lessons.map((l) => l.student_id),
    ...data.enrollments.map((e) => e.student_id),
  ]);
  const unassigned = data.students.filter((s) => s.active && !assignedStudentIds.has(s.id));

  return { ...data, maps, roomLabel, primaryContact, teacherInstrumentIds, teacherFree, unassigned };
}

export type All = Awaited<ReturnType<typeof loadAll>>;
