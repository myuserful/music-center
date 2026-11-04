import 'server-only';
import { isActivityDate } from './activityDays';
import { LESSON_MINUTES } from './constants';
import { addDays, taughtBy } from './day';
import { loadPayroll } from './data';
import { payrollRange, payrollRemaining, teacherPayroll } from './payroll';
import type { DB } from './supabase/server';
import { fullName, type Teacher } from './types';

/** שבוע עם פעילות לפי לוח מועדי הפעילות (ראשון עד שישי) */
const isActiveWeek = (sunday: string) => [0, 1, 2, 3, 4, 5].some((i) => isActivityDate(addDays(sunday, i)));

/** שכר המורים של חודש (YYYY-MM): שורה לכל מורה, וכמה שכר יש, כמה שולם וכמה נותר. משותף לדף השכר ולהכנסות והוצאות */
export async function monthPayroll(db: DB, teachers: Teacher[], month: string, today: string) {
  const range = payrollRange(month);
  const data = await loadPayroll(db, range);
  const involved = new Set([
    ...data.lessons.map(taughtBy), ...data.extras.map((e) => e.teacher_id), ...data.payroll.map((p) => p.teacher_id),
  ]);
  const rows = teachers
    .filter((t) => involved.has(t.id) || (t.active && Number(t.min_weekly_hours ?? 0) > 0))
    .sort((a, b) => fullName(a).localeCompare(fullName(b), 'he'))
    .map((t) => ({
      t,
      p: teacherPayroll({
        teacherId: t.id, month, rows: data.lessons, closures: data.closures, extras: data.extras,
        minWeeklyHours: t.min_weekly_hours, rate: t.hourly_rate == null ? null : Number(t.hourly_rate),
        today, lessonMinutes: LESSON_MINUTES, isActiveWeek,
      }),
      paid: data.payroll.find((x) => x.teacher_id === t.id),
    }));
  const left = payrollRemaining(rows.map((r) => ({ amount: r.p.amount, paid: r.paid ? Number(r.paid.amount) : null })));
  return { range, missing: data.missing, rows, left };
}
