import 'server-only';
import { freeSlots, type Busy } from './availability';
import { DAYS, LESSON_MINUTES } from './constants';
import { toMin } from './time';
import type { DB } from './supabase/server';
import { isTimed } from './types';
import type {
  BillingSettings, Branch, Charge, Choir, Contact, DayClosure, DayLesson, Enrollment, Instrument, Receipt, ReceiptCertificate, TeacherExtra, TeacherPayroll, Lesson, Payment, Room, Student,
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
  const [lessons, closures, sub] = await Promise.all([
    db.from('day_lessons').select('*').eq('lesson_date', date).order('start_time'),
    db.from('day_closures').select('*').eq('lesson_date', date),
    // 0040 (מילוי מקום) כבר הורצה?
    db.from('day_lessons').select('substitute_id').limit(1),
  ]);
  const firstError = [lessons, closures].find((r) => r.error)?.error;
  // עד שמריצים את 0039: מציגים את מערכת השעות הקבועה, בלי אפשרות לשמור
  if (firstError?.code === '42P01' || firstError?.code === 'PGRST205') {
    return { lessons: [] as DayLesson[], closures: [] as DayClosure[], missingTables: true, missingSubstitute: true };
  }
  if (firstError) throw new Error(firstError.message);
  return { lessons: lessons.data as DayLesson[], closures: closures.data as DayClosure[], missingTables: false,
    missingSubstitute: sub.error?.code === '42703' || sub.error?.code === 'PGRST204',
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
    db.from('teacher_payroll').select('*').eq('month', range.first),
  ]);
  const err = [lessons, closures].find((r) => r.error)?.error;
  if (err) throw new Error(err.message);
  const missing = !!(extras.error || payroll.error);
  return {
    lessons: lessons.data as DayLesson[], closures: closures.data as DayClosure[],
    extras: (extras.data ?? []) as TeacherExtra[], payroll: (payroll.data ?? []) as TeacherPayroll[], missing,
  };
}
