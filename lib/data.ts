import 'server-only';
import { freeSlots, type Busy } from './availability';
import { DAYS, LESSON_MINUTES } from './constants';
import { toMin } from './time';
import type { DB } from './supabase/server';
import type {
  BillingSettings, Branch, Charge, Choir, Contact, Enrollment, FundRate, Instrument, Lesson, Payment, Room, Student,
  Teacher, TeacherHours,
} from './types';

type Raw = Record<string, unknown[]>;

/** עד שמריצים את 0025: מנסים את הפונקציות רק פעם בדקה, לא בכל בקשה (זה היה מוסיף עוד פנייה למסד) */
const noRpc = { app: 0, billing: 0 };
const tryRpc = (since: number) => Date.now() - since > 60_000;

/** כל הטבלאות בקריאה אחת (פונקציה app_data במסד, 0025). אם עוד לא הורצה - 12 קריאות נפרדות */
async function fetchAll(db: DB): Promise<Raw> {
  if (tryRpc(noRpc.app)) {
    const rpc = await db.rpc('app_data');
    if (!rpc.error) return rpc.data as Raw;
    if (rpc.error.code !== 'PGRST202') throw new Error(rpc.error.message);
    noRpc.app = Date.now();
  }

  const queries = {
    branches: db.from('branches').select('*').order('name'),
    rooms: db.from('rooms').select('*').order('name'),
    instruments: db.from('instruments').select('*').order('name'),
    teachers: db.from('teachers').select('*').order('first_name'),
    teacher_instruments: db.from('teacher_instruments').select('*'),
    teacher_branches: db.from('teacher_branches').select('*'),
    teacher_hours: db.from('teacher_hours').select('*').order('weekday').order('start_time'),
    students: db.from('students').select('*').order('first_name'),
    contacts: db.from('contacts').select('*').order('is_primary', { ascending: false }),
    lessons: db.from('lessons').select('*').order('weekday').order('start_time'),
    choirs: db.from('choirs').select('*').order('weekday').order('start_time'),
    choir_enrollments: db.from('choir_enrollments').select('*').order('created_at'),
  };
  const results = await Promise.all(Object.values(queries));
  const firstError = results.find((r) => r.error)?.error;
  if (firstError) throw new Error(firstError.message);
  return Object.fromEntries(Object.keys(queries).map((k, i) => [k, results[i].data ?? []]));
}

/** טוען את כל נתוני המערכת. מרכז מוזיקה הוא בהיקף של מאות רשומות, אז זה פשוט ומהיר. */
export async function loadAll(db: DB) {
  const raw = await fetchAll(db);
  const data = {
    branches: raw.branches as Branch[],
    rooms: raw.rooms as Room[],
    instruments: raw.instruments as Instrument[],
    teachers: raw.teachers as Teacher[],
    teacherInstruments: raw.teacher_instruments as { teacher_id: number; instrument_id: number }[],
    teacherBranches: raw.teacher_branches as { teacher_id: number; branch_id: number }[],
    hours: raw.teacher_hours as TeacherHours[],
    students: raw.students as Student[],
    contacts: raw.contacts as Contact[],
    lessons: raw.lessons as Lesson[],
    choirs: raw.choirs as Choir[],
    enrollments: raw.choir_enrollments as Enrollment[],
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
  /** החדרים של מורה לפי ימים (החדר שייך לשעות העבודה ביום מסוים), למשל "שני: חדר 1 · גינות דוד" */
  const teacherRooms = (teacherId: number) => {
    const seen = new Set<string>();
    return data.hours.filter((h) => h.teacher_id === teacherId && h.room_id).flatMap((h) => {
      const label = `${DAYS[h.weekday]}: ${roomLabel(h.room_id)}`;
      if (seen.has(label)) return [];
      seen.add(label);
      return [label];
    });
  };
  const primaryContact = (studentId: number) => data.contacts.find((c) => c.student_id === studentId);
  const teacherInstrumentIds = (teacherId: number) =>
    data.teacherInstruments.filter((x) => x.teacher_id === teacherId).map((x) => x.instrument_id);
  const teacherBranchIds = (teacherId: number) =>
    data.teacherBranches.filter((x) => x.teacher_id === teacherId).map((x) => x.branch_id);

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
  const unassigned = data.students.filter((s) => s.status === 'active' && !assignedStudentIds.has(s.id));

  return { ...data, maps, roomLabel, teacherRooms, primaryContact, teacherInstrumentIds, teacherBranchIds, teacherFree, unassigned };
}

export type All = Awaited<ReturnType<typeof loadAll>>;

/** נתוני תשלומים. studentId מצמצם לתלמיד אחד */
export async function loadBilling(db: DB, studentId?: number) {
  if (tryRpc(noRpc.billing)) {
    const rpc = await db.rpc('billing_data', { p_student: studentId ?? null });
    if (!rpc.error) {
      const d = rpc.data as { settings: BillingSettings; rates: FundRate[]; charges: Charge[]; payments: Payment[] };
      return { settings: d.settings, rates: d.rates, charges: d.charges, payments: d.payments };
    }
    if (rpc.error.code !== 'PGRST202') throw new Error(rpc.error.message);
    noRpc.billing = Date.now();
  }

  const charges = db.from('charges').select('*').order('month', { ascending: false }).order('id');
  const payments = db.from('payments').select('*').order('paid_on', { ascending: false }).order('id', { ascending: false });
  const [settings, rates, c, p] = await Promise.all([
    db.from('billing_settings').select('*').single(),
    db.from('fund_rates').select('*'),
    studentId ? charges.eq('student_id', studentId) : charges,
    studentId ? payments.eq('student_id', studentId) : payments,
  ]);
  const firstError = [settings, rates, c, p].find((r) => r.error)?.error;
  if (firstError) throw new Error(firstError.message);
  return {
    settings: settings.data as BillingSettings,
    rates: rates.data as FundRate[],
    charges: c.data as Charge[],
    payments: p.data as Payment[],
  };
}
