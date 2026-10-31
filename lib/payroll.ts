import { addDays, isClosed, lessonCount, taughtBy, teacherPaidRows, weekdayOf } from './day';
import type { DayLesson, TeacherExtra } from './types';

/** יום ראשון של השבוע של התאריך */
export const weekStart = (date: string) => addDays(date, -weekdayOf(date));

/** השבועות של חודש: כל שבוע שיום ראשון שלו בחודש (שבוע שמתחיל בחודש הקודם שייך לחודש הקודם) */
export function monthWeeks(month: string): string[] {
  const first = `${month.slice(0, 7)}-01`;
  const [y, m] = first.split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  const out: string[] = [];
  for (let s = weekStart(first) < first ? addDays(weekStart(first), 7) : first; s <= last; s = addDays(s, 7)) out.push(s);
  return out;
}

/** הטווח שצריך לטעון בשביל חודש: מתחילת החודש עד סוף השבוע האחרון שמתחיל בו */
export function payrollRange(month: string) {
  const first = `${month.slice(0, 7)}-01`;
  const [y, m] = first.split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  const weeks = monthWeeks(month);
  const to = weeks.length ? addDays(weeks.at(-1)!, 6) : last;
  return { first, last, to: to > last ? to : last };
}

export type PayrollWeek = { start: string; minutes: number; topup: number; status: 'counted' | 'no_activity' | 'not_ended' };

/**
 * השכר של מורה לחודש, מימים סגורים בלבד:
 * שיעורים שלימד/ה (שלו/ה + מילוי מקום, לפי הכלל או סימון ידני) + תוספות זמן + השלמה למינימום שבועי, כפול השכר לשעה, ועוד בונוסים.
 * השלמה למינימום: בכל שבוע שהסתיים ושיש בו פעילות לפי הלוח, אם עבד/ה פחות מהמינימום
 */
export function teacherPayroll({ teacherId, month, rows, closures, extras, minWeeklyHours, rate, today, lessonMinutes, isActiveWeek }: {
  teacherId: number; month: string; rows: DayLesson[]; closures: { teacher_id: number; lesson_date: string }[];
  extras: TeacherExtra[]; minWeeklyHours: number | null; rate: number | null; today: string; lessonMinutes: number;
  isActiveWeek: (sunday: string) => boolean;
}) {
  const { first, last } = payrollRange(month);
  const inMonth = (d: string) => d >= first && d <= last;
  const mine = rows.filter((r) => taughtBy(r) === teacherId);
  const paid = teacherPaidRows(rows.filter((r) => isClosed(r, closures)))
    .filter((r) => taughtBy(r) === teacherId);
  const minutesOf = (list: DayLesson[]) => lessonCount(list) * lessonMinutes;

  const monthPaid = paid.filter((r) => inMonth(r.lesson_date));
  const own = monthPaid.filter((r) => r.teacher_id === teacherId);
  const sub = monthPaid.filter((r) => r.teacher_id !== teacherId);
  const myExtras = extras.filter((e) => e.teacher_id === teacherId);
  const monthExtras = myExtras.filter((e) => inMonth(e.extra_date));
  const extraMinutes = monthExtras.reduce((n, e) => n + Number(e.minutes ?? 0), 0);
  const bonus = monthExtras.reduce((n, e) => n + Number(e.amount ?? 0), 0);

  const min = Number(minWeeklyHours ?? 0) * 60;
  const weeks: PayrollWeek[] = monthWeeks(month).map((start) => {
    const end = addDays(start, 6);
    const inWeek = (d: string) => d >= start && d <= end;
    const minutes = minutesOf(paid.filter((r) => inWeek(r.lesson_date)))
      + myExtras.filter((e) => inWeek(e.extra_date)).reduce((n, e) => n + Number(e.minutes ?? 0), 0);
    const status = !isActiveWeek(start) ? 'no_activity' : end >= today ? 'not_ended' : 'counted';
    return { start, minutes, status, topup: status === 'counted' && min > 0 ? Math.max(0, min - minutes) : 0 };
  });
  const topupMinutes = weeks.reduce((n, w) => n + w.topup, 0);

  const totalMinutes = minutesOf(own) + minutesOf(sub) + extraMinutes + topupMinutes;
  // ימים בחודש שיש בהם שיעורים של המורה ועוד לא נסגרו (לא נספרו)
  const openDays = [...new Set(mine.filter((r) => inMonth(r.lesson_date) && !isClosed(r, closures)).map((r) => r.lesson_date))].sort();
  return {
    ownMinutes: minutesOf(own), subMinutes: minutesOf(sub), extraMinutes, topupMinutes, bonus, weeks, totalMinutes,
    lessons: lessonCount(monthPaid), openDays, extras: monthExtras,
    amount: rate == null ? null : Math.round((totalMinutes / 60) * rate + bonus),
  };
}
