import 'server-only';
import { freeSlots, type Busy } from './availability';
import { DAYS, LESSON_MINUTES } from './constants';
import { toMin } from './time';
import type { DB } from './supabase/server';
import { isTimed } from './types';
import type {
  BillingSettings, Branch, Charge, Choir, Contact, DayClosure, DayLesson, DayLock, Enrollment, Instrument, Receipt, ReceiptCertificate, TeacherExtra, TeacherPayroll, Lesson, Payment, Room, Student,
  Teacher, TeacherHours,
} from './types';

type Raw = Record<string, unknown[]>;

/** עד שמריצים את 0025: מנסים את הפונקציות רק פעם בדקה, לא בכל בקשה (זה היה מוסיף עוד פנייה למסד) */
const noRpc = { app: 0, billing: 0 };
const tryRpc = (since: number) => Date.now() - since > 60_000;

type Tables = {
  branches: Branch[];
  rooms: Room[];
  instruments: Instrument[];
  teachers: Teacher[];
  teacher_instruments: { teacher_id: number; instrument_id: number }[];
  teacher_branches: { teacher_id: number; branch_id: number }[];
  teacher_hours: TeacherHours[];
  students: Student[];
  contacts: Contact[];
  lessons: Lesson[];
  choirs: Choir[];
  choir_enrollments: Enrollment[];
};

const QUERIES: Record<keyof Tables, (db: DB) => PromiseLike<{ data: unknown; error: { message: string } | null }>> = {
  branches: (db) => db.from('branches').select('*').order('name'),
  rooms: (db) => db.from('rooms').select('*').order('name'),
  instruments: (db) => db.from('instruments').select('*').order('name'),
  teachers: (db) => db.from('teachers').select('*').order('first_name'),
  teacher_instruments: (db) => db.from('teacher_instruments').select('*'),
  teacher_branches: (db) => db.from('teacher_branches').select('*'),
  teacher_hours: (db) => db.from('teacher_hours').select('*').order('weekday').order('start_time'),
  students: (db) => db.from('students').select('*').order('first_name'),
  contacts: (db) => db.from('contacts').select('*').order('is_primary', { ascending: false }),
  lessons: (db) => db.from('lessons').select('*').order('weekday').order('start_time'),
  choirs: (db) => db.from('choirs').select('*').order('weekday').order('start_time'),
  choir_enrollments: (db) => db.from('choir_enrollments').select('*').order('created_at'),
};

/** רק הטבלאות שהדף צריך. מה שלא נטען לא קיים גם בטיפוס, אז שכחה של טבלה נתפסת בקומפילציה */
export async function loadTables<K extends keyof Tables>(db: DB, ...tables: K[]): Promise<Pick<Tables, K>> {
  const results = await Promise.all(tables.map((t) => QUERIES[t](db)));
  const firstError = results.find((r) => r.error)?.error;
  if (firstError) throw new Error(firstError.message);
  return Object.fromEntries(tables.map((t, i) => [t, results[i].data ?? []])) as unknown as Pick<Tables, K>;
}

/** שמות התלמידים בלבד (רוב המשקל של הנתונים הוא שאר הפרטים של התלמידים) */
export async function loadStudentNames(db: DB) {
  const { data, error } = await db.from('students').select('id, first_name, last_name, payment_track');
  if (error) throw new Error(error.message);
  return byId(data as Pick<Student, 'id' | 'first_name' | 'last_name' | 'payment_track'>[]);
}

/** כל הטבלאות בקריאה אחת (פונקציה app_data במסד, 0025). אם עוד לא הורצה - 12 קריאות נפרדות */
async function fetchAll(db: DB): Promise<Raw> {
  if (tryRpc(noRpc.app)) {
    const rpc = await db.rpc('app_data');
    if (!rpc.error) return rpc.data as Raw;
    if (rpc.error.code !== 'PGRST202') throw new Error(rpc.error.message);
    noRpc.app = Date.now();
  }
  return await loadTables(db, ...(Object.keys(QUERIES) as (keyof Tables)[])) as unknown as Raw;
}

export const byId = <T extends { id: number }>(rows: T[]) => new Map(rows.map((r) => [r.id, r]));

/** "חדר 1 · גינות דוד" */
export const makeRoomLabel = (room: Map<number, Room>, branch: Map<number, Branch>) => (id: number | null) => {
  const r = id ? room.get(id) : undefined;
  return r ? `${r.name} · ${branch.get(r.branch_id)?.name ?? ''}` : '';
};

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

  const maps = {
    branch: byId(data.branches),
    room: byId(data.rooms),
    instrument: byId(data.instruments),
    teacher: byId(data.teachers),
    student: byId(data.students),
    choir: byId(data.choirs),
  };

  const roomLabel = makeRoomLabel(maps.room, maps.branch);
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

  /** שיעורים במערכת השעות (בלי שיעורים בבית המורה) */
  const timedLessons = data.lessons.filter(isTimed);

  /** זמנים תפוסים של מורה (שיעורים + מקהלות) */
  const teacherBusy = (teacherId: number): Busy[] => [
    ...timedLessons.filter((l) => l.teacher_id === teacherId)
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

  return { ...data, timedLessons, maps, roomLabel, teacherRooms, primaryContact, teacherInstrumentIds, teacherBranchIds, teacherFree, unassigned };
}

export type All = Awaited<ReturnType<typeof loadAll>>;

/** נתוני תשלומים. studentId מצמצם לתלמיד אחד */
export async function loadBilling(db: DB, studentId?: number) {
  if (tryRpc(noRpc.billing)) {
    const rpc = await db.rpc('billing_data', { p_student: studentId ?? null });
    const d = rpc.data as { settings: BillingSettings; charges: Charge[]; payments: Payment[]; rates?: unknown } | null;
    // הגרסה הישנה של הפונקציה (לפני 0041) מחזירה גם rates ואת החיובים הישנים: לא משתמשים בה
    if (!rpc.error && d && !('rates' in d)) {
      return { settings: d.settings, charges: d.charges, payments: d.payments, missing: false };
    }
    if (rpc.error && rpc.error.code !== 'PGRST202' && !['42P01', '42703'].includes(rpc.error.code)) throw new Error(rpc.error.message);
    noRpc.billing = Date.now();
  }

  const charges = db.from('lesson_charges').select('*').order('due_date').order('id');
  const payments = db.from('payments').select('*').order('paid_on', { ascending: false }).order('id', { ascending: false });
  const [settings, c, p] = await Promise.all([
    db.from('billing_settings').select('*').single(),
    studentId ? charges.eq('student_id', studentId) : charges,
    studentId ? payments.eq('student_id', studentId) : payments,
  ]);
  // עד שמריצים את 0041: אין טבלת חיובים. מציגים בלי חיובים, עם הודעה
  const missing = c.error?.code === '42P01' || c.error?.code === 'PGRST205';
  const firstError = [settings, missing ? { error: null } : c, p].find((r) => r.error)?.error;
  if (firstError) throw new Error(firstError.message);
  const defaults: BillingSettings = {
    price_private: 75, price_maccabi_full: 140, price_maccabi_upfront: 45, price_maccabi_later: 95,
    price_fund_deposit: 75, maccabi_later_months: 2, price_trial: 55,
  };
  return {
    settings: missing ? defaults : settings.data as BillingSettings,
    charges: missing ? [] : c.data as Charge[],
    payments: (p.data as Payment[]).map((x) => ({ ...x, refund: x.refund ?? false, maccabi_amount: Number(x.maccabi_amount ?? 0) })),
    missing,
  };
}

/** סגירת יום: השיעורים שנשמרו והמורים שסגרו את היום */
export async function loadDay(db: DB, date: string) {
  const [lessons, closures, sub, lock, extras, movedOut] = await Promise.all([
    db.from('day_lessons').select('*').eq('lesson_date', date).order('start_time'),
    db.from('day_closures').select('*').eq('lesson_date', date),
    // 0040 (מילוי מקום) כבר הורצה?
    db.from('day_lessons').select('substitute_id').limit(1),
    // נעילת היום, תוספות זמן למורים, ותלמידים שהועברו מהיום הזה ליום אחר (לפני 0052: אין)
    db.from('day_locks').select('*').eq('lesson_date', date).maybeSingle(),
    db.from('teacher_extras').select('*').eq('extra_date', date).not('minutes', 'is', null).order('id'),
    db.from('day_lessons').select('*').eq('moved_from', date),
  ]);
  const firstError = [lessons, closures].find((r) => r.error)?.error;
  // עד שמריצים את 0039: מציגים את מערכת השעות הקבועה, בלי אפשרות לשמור
  if (firstError?.code === '42P01' || firstError?.code === 'PGRST205') {
    return { lessons: [] as DayLesson[], closures: [] as DayClosure[], missingTables: true, missingSubstitute: true,
      missingLock: true, lock: null as DayLock | null, extras: [] as TeacherExtra[], movedOut: [] as DayLesson[] };
  }
  if (firstError) throw new Error(firstError.message);
  return { lessons: lessons.data as DayLesson[], closures: closures.data as DayClosure[], missingTables: false,
    missingSubstitute: sub.error?.code === '42703' || sub.error?.code === 'PGRST204',
    missingLock: !!lock.error || !!movedOut.error,
    lock: (lock.data ?? null) as DayLock | null,
    extras: (extras.data ?? []) as TeacherExtra[],
    movedOut: (movedOut.data ?? []) as DayLesson[],
  };
}

/**
 * היסטוריית שיעורים מסגירות יום, של תלמיד/ה או של מורה (כולל מילוי מקום).
 * month: "2026-10" לחודש אחד, ריק = הכול
 */
export async function loadHistory(db: DB, who: { student: number } | { teacher: number }, month = '') {
  let q = db.from('day_lessons').select('*').order('lesson_date', { ascending: false }).order('start_time');
  q = 'student' in who ? q.eq('student_id', who.student) : q.or(`teacher_id.eq.${who.teacher},substitute_id.eq.${who.teacher}`);
  if (/^\d{4}-\d{2}$/.test(month)) {
    const [y, m] = month.split('-').map(Number);
    const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
    q = q.gte('lesson_date', `${month}-01`).lt('lesson_date', `${next}-01`);
  }
  const lessons = await q;
  if (lessons.error) {
    if (['42P01', 'PGRST205', '42703'].includes(lessons.error.code)) return { lessons: [] as DayLesson[], closures: [] as DayClosure[] };
    throw new Error(lessons.error.message);
  }
  const rows = lessons.data as DayLesson[];
  const dates = [...new Set(rows.map((r) => r.lesson_date))];
  if (!dates.length) return { lessons: rows, closures: [] as DayClosure[] };
  const closures = await db.from('day_closures').select('*').in('lesson_date', dates);
  if (closures.error) throw new Error(closures.error.message);
  return { lessons: rows, closures: closures.data as DayClosure[] };
}

/** הקבלות (של תלמיד/ה אחד/ת, או של כולם). עד שמריצים את 0042 - רשימה ריקה */
export async function loadReceipts(db: DB, studentId?: number): Promise<{ receipts: Receipt[]; missing: boolean }> {
  const q = db.from('receipts').select('*').order('issued_on', { ascending: false }).order('id', { ascending: false });
  const { data, error } = await (studentId ? q.eq('student_id', studentId) : q);
  if (error?.code === '42P01' || error?.code === 'PGRST205') return { receipts: [], missing: true };
  if (error) throw new Error(error.message);
  return { receipts: data as Receipt[], missing: false };
}

/** אישורי קבלה לקופות שהופקו, מהחדש לישן. missing = עוד לא הורץ 0048 */
export async function loadCertificates(db: DB, studentId?: number): Promise<{ certificates: ReceiptCertificate[]; missing: boolean }> {
  const q = db.from('receipt_certificates').select('*').order('created_at', { ascending: false });
  const { data, error } = await (studentId ? q.eq('student_id', studentId) : q);
  if (error?.code === '42P01' || error?.code === 'PGRST205') return { certificates: [], missing: true };
  if (error) throw new Error(error.message);
  return { certificates: data as ReceiptCertificate[], missing: false };
}

/** שכר מורים לחודש: השיעורים מסגירות היום (כולל סוף השבוע האחרון), התוספות, ומה שכבר אושר. עד 0046 - בלי תוספות ואישורים */
export async function loadPayroll(db: DB, range: { first: string; to: string }) {
  const [lessons, closures, extras, payroll] = await Promise.all([
    db.from('day_lessons').select('*').gte('lesson_date', range.first).lte('lesson_date', range.to),
    db.from('day_closures').select('*').gte('lesson_date', range.first).lte('lesson_date', range.to),
    db.from('teacher_extras').select('*').gte('extra_date', range.first).lte('extra_date', range.to).order('extra_date'),
    db.from('teacher_payroll').select('*, transactions(*)').eq('month', range.first),
  ]);
  const err = [lessons, closures].find((r) => r.error)?.error;
  if (err) throw new Error(err.message);
  const missing = !!(extras.error || payroll.error);
  return {
    lessons: lessons.data as DayLesson[], closures: closures.data as DayClosure[],
    extras: (extras.data ?? []) as TeacherExtra[], payroll: (payroll.data ?? []) as TeacherPayroll[], missing,
  };
}
