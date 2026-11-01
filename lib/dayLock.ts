import 'server-only';
import { activityDays, ACTIVITY_YEAR } from './activityDays';
import { billClosedDays } from './charging';
import { LESSON_MINUTES } from './constants';
import { addDays, dayRows, dayStats, dayTeacherIds, israelToday, overdueDates } from './day';
import { loadAll } from './data';
import type { DB } from './supabase/server';
import type { DayClosure, DayLesson, DayStats, TeacherExtra } from './types';

const MISSING = ['42P01', 'PGRST205', 'PGRST204', '42703'];
export const LOCK_MISSING = 'צריך להריץ את 0052_day_lock.sql ב-Supabase';

const check = <T extends { error: { code?: string; message: string } | null }>(r: T): T => {
  if (r.error) throw new Error(MISSING.includes(r.error.code ?? '') ? LOCK_MISSING : r.error.message);
  return r;
};

/** היום נסגר סופית? */
export async function isLocked(db: DB, date: string): Promise<boolean> {
  const { data, error } = await db.from('day_locks').select('unlocked_at').eq('lesson_date', date).maybeSingle();
  if (error && MISSING.includes(error.code)) return false;
  return !!data && !data.unlocked_at;
}

/**
 * סגירה סופית של ימים: כל מורה שהיום שלו/ה עוד פתוח נסגר/ת (עם מה שנשמר, ואם לא נשמר כלום - לפי מערכת השעות,
 * כולם "הגיע/ה"), השיעורים מחויבים, ונשמרת תמונת מצב של היום. אחרי זה אי אפשר לשנות את היום
 */
export async function lockDays(db: DB, dates: string[], auto: boolean): Promise<Map<string, DayStats>> {
  const out = new Map<string, DayStats>();
  if (!dates.length) return out;
  const all = await loadAll(db);
  for (const date of dates) {
    const [saved, closures] = (await Promise.all([
      db.from('day_lessons').select('*').eq('lesson_date', date),
      db.from('day_closures').select('*').eq('lesson_date', date),
    ])).map(check);
    const lessons = saved.data as DayLesson[];
    const closed = new Set((closures.data as DayClosure[]).map((c) => c.teacher_id));
    for (const teacherId of dayTeacherIds(all.lessons, lessons, closures.data as DayClosure[], date)) {
      if (closed.has(teacherId)) continue;
      const { rows } = dayRows(lessons, all.lessons, teacherId, date, false);
      check(await db.rpc('save_day', { p_teacher: teacherId, p_date: date, p_rows: rows, p_close: true }));
    }
    const billed = await billClosedDays(db, { from: date, to: date });

    const [final, extras, charges] = (await Promise.all([
      db.from('day_lessons').select('*').eq('lesson_date', date),
      db.from('teacher_extras').select('minutes').eq('extra_date', date),
      db.from('lesson_charges').select('amount').eq('lesson_date', date).neq('kind', 'manual'),
    ])).map(check);
    const stats = dayStats(final.data as DayLesson[], extras.data as Pick<TeacherExtra, 'minutes'>[],
      charges.data as { amount: number }[], billed.unbilled, LESSON_MINUTES);
    // גם יום שנפתח בחריגה ונסגר שוב: תמונת מצב חדשה
    check(await db.from('day_locks').upsert(
      { lesson_date: date, auto, stats, locked_at: new Date().toISOString(), unlocked_at: null }, { onConflict: 'lesson_date' },
    ));
    out.set(date, stats);
  }
  return out;
}

/**
 * סגירה אוטומטית: יום שלא נסגר ביד נסגר 24 שעות אחרי שנגמר (ימי פעילות לפי הלוח, וכל יום שנשמר בו משהו).
 * רץ כשפותחים את המערכת, כך שגם אם לא נכנסו כמה ימים - כל מה שהתאחר נסגר. לא מפיל את הדף אם משהו נכשל
 */
export async function autoLockOverdue(db: DB): Promise<void> {
  try {
    const settings = await db.from('billing_settings').select('auto_close_from').single();
    if (settings.error) return; // עוד לא הריצו את 0052
    const from = settings.data.auto_close_from as string;
    const last = addDays(israelToday(), -2);
    if (from > last) return;
    const [locks, saved] = await Promise.all([
      db.from('day_locks').select('lesson_date').gte('lesson_date', from).lte('lesson_date', last),
      db.from('day_lessons').select('lesson_date').gte('lesson_date', from).lte('lesson_date', last),
    ]);
    if (locks.error || saved.error) return;
    const candidates = [
      ...activityDays(ACTIVITY_YEAR.weekdays).filter((d) => d >= from && d <= last),
      ...saved.data.map((r) => r.lesson_date as string),
    ];
    const overdue = overdueDates(candidates, new Set(locks.data.map((l) => l.lesson_date as string)), from, israelToday());
    await lockDays(db, overdue, true);
  } catch (e) {
    console.error('סגירה אוטומטית של ימים נכשלה:', e);
  }
}
