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

/**
 * כמה שכר יש בחודש, כמה שולם וכמה נותר. נותר = הסכום המחושב של מי שעוד לא שולם, total = שולם + נותר.
 * noRate: מורים עם שעות בלי תעריף, שהסכום שלהם לא ידוע ולא נספר.
 * gap: אצל מי שכבר שולם, כמה החישוב היום גבוה ממה ששולם (למשל שיעורים שנוספו אחרי התשלום)
 */
export function payrollRemaining(rows: { amount: number | null; paid: number | null }[]) {
  const open = rows.filter((r) => r.paid === null && (r.amount === null || r.amount > 0));
  const remaining = open.reduce((n, r) => n + (r.amount ?? 0), 0);
  const paidRows = rows.filter((r) => r.paid !== null);
  const paid = paidRows.reduce((n, r) => n + (r.paid ?? 0), 0);
  return {
    total: paid + remaining,
    paid,
    paidCount: paidRows.length,
    remaining,
    unpaid: open.filter((r) => r.amount !== null).length,
    noRate: open.filter((r) => r.amount === null).length,
    gap: rows.reduce((n, r) => n + (r.paid !== null && r.amount !== null ? Math.max(0, Math.round(r.amount - r.paid)) : 0), 0),
  };
}

/** חודשים אחרים שיש בהם שכר ששולם בלי קבלה, עם כמה תשלומים חסרים. מהישן לחדש */
export function monthsMissingReceipt(
  rows: { month: string; transaction_id: number | null; transactions?: { receipt_path: string | null } | null }[], currentMonth: string,
): { month: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const r of rows) {
    const month = r.month.slice(0, 7);
    if (!r.transaction_id || r.transactions?.receipt_path || month === currentMonth) continue;
    counts.set(month, (counts.get(month) ?? 0) + 1);
  }
  return [...counts].sort(([a], [b]) => a.localeCompare(b)).map(([month, count]) => ({ month, count }));
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
