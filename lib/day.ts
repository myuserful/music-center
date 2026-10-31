import { ATTENDANCES, type Attendance } from './constants';
import { hhmm } from './time';
import { isTimed, type Contact, type DayLesson, type Lesson } from './types';

/** שורה בסגירת יום (מה שנשמר במסד, בלי מזהה) */
export type DayRow = {
  lesson_id: number | null; student_id: number; instrument_id: number | null;
  start_time: string | null; room_id: number | null; attendance: Attendance; notes: string;
  /** מילוי מקום: מי לימד/ה בפועל. null = המורה הקבוע/ה */
  substitute_id: number | null;
  /** משולם למורה על השיעור? null = לפי הכלל (teacherPaidByRule) */
  teacher_paid: boolean | null;
  /** שיעור בזוג (מכל 4, הרביעי חינם) */
  pair: boolean;
};

/** "2026-10-20" -> 0..6 (ראשון = 0, כמו DAYS) */
export const weekdayOf = (date: string) => new Date(`${date}T12:00:00Z`).getUTCDay();

export const validDate = (d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(Date.parse(d));

/** "2026-10-20" + n ימים */
export function addDays(date: string, n: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** "2026-10-20" -> "20/10/2026" */
export const dmy = (date: string) => date.split('-').reverse().join('/');

/** שם פרטי ואות ראשונה משם המשפחה: "משה כ'" */
export function shortName(p: { first_name: string; last_name: string } | null | undefined): string {
  if (!p) return '';
  const initial = p.last_name.trim().charAt(0);
  return initial ? `${p.first_name.trim()} ${initial}'` : p.first_name.trim();
}

const digits = (phone: string) => phone.replace(/\D/g, '');

/** טלפון אחד לתלמיד/ה: עדיפות לפלאפון (05...), ובתוך זה לאיש הקשר הראשי */
export function mobilePhone(contacts: Contact[]): string {
  const withPhone = contacts.filter((c) => digits(c.phone))
    .sort((a, b) => Number(b.is_primary) - Number(a.is_primary));
  const mobile = withPhone.find((c) => /^(05|9725)/.test(digits(c.phone)));
  return (mobile ?? withPhone[0])?.phone ?? '';
}

const byTime = (a: DayRow, b: DayRow) => (a.start_time ?? '99').localeCompare(b.start_time ?? '99');

/** ברירת המחדל של היום: השיעורים הקבועים של המורה ביום הזה בשבוע */
export function scheduledRows(lessons: Lesson[], teacherId: number, date: string): DayRow[] {
  const weekday = weekdayOf(date);
  return lessons.filter(isTimed).filter((l) => l.teacher_id === teacherId && l.weekday === weekday)
    .map((l) => ({
      lesson_id: l.id, student_id: l.student_id, instrument_id: l.instrument_id,
      start_time: hhmm(l.start_time), room_id: l.room_id, attendance: 'present' as const, notes: '', substitute_id: null,
      teacher_paid: null, pair: l.pair ?? false,
    }))
    .sort(byTime);
}

/** המורים של היום: מי שיש לו שיעורים קבועים ביום הזה בשבוע, ומי שכבר נשמר או נסגר לו היום */
export function dayTeacherIds(
  lessons: Lesson[], saved: DayLesson[], closures: { teacher_id: number }[], date: string,
): Set<number> {
  const weekday = weekdayOf(date);
  return new Set([
    ...lessons.filter(isTimed).filter((l) => l.weekday === weekday).map((l) => l.teacher_id),
    ...saved.map((d) => d.teacher_id),
    ...closures.map((c) => c.teacher_id),
  ]);
}

/** השורות של מורה ביום: מה שנשמר, ואם לא נשמר כלום - מערכת השעות הקבועה */
export function dayRows(
  saved: DayLesson[], lessons: Lesson[], teacherId: number, date: string, closed: boolean,
): { rows: DayRow[]; saved: boolean } {
  const mine = saved.filter((d) => d.teacher_id === teacherId && d.lesson_date === date);
  if (!mine.length && !closed) return { rows: scheduledRows(lessons, teacherId, date), saved: false };
  return {
    saved: true,
    rows: mine.map((d) => ({
      lesson_id: d.lesson_id, student_id: d.student_id, instrument_id: d.instrument_id,
      start_time: d.start_time ? hhmm(d.start_time) : null, room_id: d.room_id, attendance: d.attendance, notes: d.notes,
      substitute_id: d.substitute_id ?? null,
      teacher_paid: d.teacher_paid ?? null,
      pair: d.pair ?? false,
    })).sort(byTime),
  };
}

/** בדיקת השורות שהגיעו מהטופס. null = לא תקין */
export function parseRows(json: string, teacherId: number): DayRow[] | null {
  let raw: unknown;
  try { raw = JSON.parse(json); } catch { return null; }
  if (!Array.isArray(raw)) return null;
  const id = (v: unknown) => (v == null || v === '' ? null : Number.isInteger(Number(v)) ? Number(v) : NaN);
  const rows: DayRow[] = [];
  for (const r of raw as Record<string, unknown>[]) {
    const student = id(r.student_id);
    const [lesson, instrument, room, sub] = [id(r.lesson_id), id(r.instrument_id), id(r.room_id), id(r.substitute_id)];
    const time = r.start_time ? String(r.start_time) : null;
    const attendance = ATTENDANCES.find((a) => a === r.attendance);
    if (!student || [lesson, instrument, room, sub].some((v) => Number.isNaN(v)) || !attendance) return null;
    if (time && !/^\d{2}:\d{2}$/.test(time)) return null;
    rows.push({
      lesson_id: lesson, student_id: student, instrument_id: instrument, start_time: time, room_id: room,
      attendance, notes: String(r.notes ?? '').trim().slice(0, 500),
      // המורה הקבוע/ה לא ממלא/ת מקום של עצמו/ה
      substitute_id: sub === teacherId ? null : sub,
      teacher_paid: typeof r.teacher_paid === 'boolean' ? r.teacher_paid : null,
      pair: r.pair === true,
    });
  }
  return rows;
}

// ---- תשלום למורה ----

type PayRow = { attendance: Attendance; start_time: string | null; who: number };
const held = (a: Attendance) => a === 'present' || a === 'absent';

/**
 * הכלל: האם משלמים למורה על שיעור. הגיע/ה או לא הגיע/ה בלי הודעה - כן (המורה היה/תה שם).
 * המורה ביטל/ה - לא. ביטל/ה מראש - רק באמצע היום (יש למורה שיעורים לפני ואחרי, נשאר "חור"),
 * לא בתחילת היום או בסופו (המורה מתחיל/ה מאוחר או מסיים/ת מוקדם)
 */
export function teacherPaidByRule(r: PayRow, day: PayRow[]): boolean {
  if (held(r.attendance)) return true;
  if (r.attendance === 'cancelled' || !r.start_time) return false;
  const times = day.filter((x) => x.who === r.who && held(x.attendance) && x.start_time).map((x) => x.start_time!);
  return times.some((t) => t < r.start_time!) && times.some((t) => t > r.start_time!);
}

/** השיעורים שמשלמים עליהם למורה: מה שסומן ביד, ואם לא סומן - לפי הכלל */
export function teacherPaidRows<T extends DayLesson>(rows: T[]): T[] {
  const pay = (r: DayLesson): PayRow => ({ attendance: r.attendance, start_time: r.start_time, who: taughtBy(r) });
  return rows.filter((r) => r.teacher_paid ?? teacherPaidByRule(pay(r),
    rows.filter((x) => x.lesson_date === r.lesson_date).map(pay)));
}

// ---- היסטוריה ----

/** שיעור שהמורה היה/תה בו: התלמיד/ה הגיע/ה, או לא הגיע/ה בלי הודעה (המורה חיכה/תה) */
export const TEACHER_PRESENT: Attendance[] = ['present', 'absent'];

/** מי לימד/ה בפועל את השיעור */
export const taughtBy = (d: Pick<DayLesson, 'teacher_id' | 'substitute_id'>) => d.substitute_id ?? d.teacher_id;

export const isClosed = (d: Pick<DayLesson, 'teacher_id' | 'lesson_date'>, closures: { teacher_id: number; lesson_date: string }[]) =>
  closures.some((c) => c.teacher_id === d.teacher_id && c.lesson_date === d.lesson_date);

export type TeacherDay = {
  date: string;
  /** השיעורים שהמורה לימד/ה בפועל (כולל מילוי מקום אצל מורה אחר/ת) */
  lessons: DayLesson[];
  /** כמה מהם משולמים למורה (הגיע/ה, לא הגיע/ה, ביטול מראש באמצע היום, או סימון ידני) */
  held: number;
  minutes: number;
  /** כל היום נסגר */
  closed: boolean;
  /** מורים שהמורה מילא/ה את מקומם ביום הזה */
  substituteFor: number[];
  /** שיעורים קבועים של המורה שמישהו/י אחר/ת לימד/ה */
  replaced: DayLesson[];
};

/** כמה שיעורים לימד/ה בפועל: שיעור בזוג (שתי שורות באותו יום ושעה) נספר פעם אחת */
export function lessonCount(rows: DayLesson[]): number {
  const pairs = new Set(rows.filter((r) => r.pair).map((r) => `${taughtBy(r)}:${r.lesson_date}:${r.start_time}`));
  return rows.filter((r) => !r.pair).length + pairs.size;
}

/** היסטוריית ימים של מורה, מהחדש לישן */
export function teacherDays(
  rows: DayLesson[], teacherId: number, closures: { teacher_id: number; lesson_date: string }[], lessonMinutes: number,
): TeacherDay[] {
  const dates = [...new Set(rows.map((r) => r.lesson_date))].sort().reverse();
  return dates.map((date) => {
    const ofDay = rows.filter((r) => r.lesson_date === date);
    const lessons = ofDay.filter((r) => taughtBy(r) === teacherId)
      .sort((a, b) => (a.start_time ?? '99').localeCompare(b.start_time ?? '99'));
    const paid = new Set(teacherPaidRows(ofDay).map((r) => r.id));
    const held = lessonCount(lessons.filter((r) => paid.has(r.id)));
    return {
      date, lessons, held, minutes: held * lessonMinutes,
      closed: lessons.every((r) => isClosed(r, closures)),
      substituteFor: [...new Set(lessons.filter((r) => r.teacher_id !== teacherId).map((r) => r.teacher_id))],
      replaced: ofDay.filter((r) => r.teacher_id === teacherId && r.substitute_id && r.substitute_id !== teacherId),
    };
  }).filter((d) => d.lessons.length || d.replaced.length);
}

/** "90" -> "1:30" */
export const hoursLabel = (minutes: number) => `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}`;

/** התאריכים שהתלמיד/ה הגיע/ה לשיעור בפועל, רק מימים סגורים, לפי הסדר */
export function attendedDates(rows: DayLesson[], closures: { teacher_id: number; lesson_date: string }[]): string[] {
  return [...new Set(rows.filter((r) => r.attendance === 'present' && isClosed(r, closures)).map((r) => r.lesson_date))].sort();
}
