import 'server-only';
import { activityDays, ACTIVITY_YEAR } from './activityDays';
import { billClosedDays } from './charging';
import { LESSON_MINUTES } from './constants';
import { addDays, dayRows, dayStats, dayTeacherIds, israelToday, overdueDates, unknownTrackStudents } from './day';
import { loadAll } from './data';
import { oncePerKey } from './oncePerKey';
import type { DB } from './supabase/server';
import { fullName, type DayClosure, type DayLesson, type DayStats, type TeacherExtra } from './types';

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
export async function lockDays(
  db: DB, dates: string[], auto: boolean, { requireTracks = false } = {},
): Promise<Map<string, DayStats>> {
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
    const toClose = [...dayTeacherIds(all.lessons, lessons, closures.data as DayClosure[], date)]
      .filter((id) => !closed.has(id))
      .map((id) => ({ id, rows: dayRows(lessons, all.lessons, id, date, false).rows }));

    // סגירה ביד: לא סוגרים כשיש תלמידים בלי מסלול תשלום (סגירה אוטומטית סוגרת, והם נשארים לא מחויבים)
    if (requireTracks) {
      const missing = unknownTrackStudents([...lessons, ...toClose.flatMap((t) => t.rows)],
        (id) => all.maps.student.get(id)?.payment_track);
      if (missing.length) throw new MissingTracks(missing.map((id) => fullName(all.maps.student.get(id))));
    }
    for (const t of toClose) {
      check(await db.rpc('save_day', { p_teacher: t.id, p_date: date, p_rows: t.rows, p_close: true }));
    }
    const billed = await billClosedDays(db, { from: date, to: date });
    const stats = await snapshot(db, date, billed.unbilled);
    // גם יום שנפתח בחריגה ונסגר שוב: תמונת מצב חדשה
    check(await db.from('day_locks').upsert(
      { lesson_date: date, auto, stats, locked_at: new Date().toISOString(), unlocked_at: null }, { onConflict: 'lesson_date' },
    ));
    out.set(date, stats);
  }
  return out;
}

/** יש תלמידים בלי מסלול תשלום ביום שמנסים לסגור */
export class MissingTracks extends Error {
  constructor(readonly names: string[]) {
    super(`יש תלמידים בלי מסלול תשלום: ${names.join(', ')}. צריך לעדכן להם מסלול לפני שסוגרים`);
  }
}

/** תמונת המצב של היום, מהמסד */
async function snapshot(db: DB, date: string, unbilled: number): Promise<DayStats> {
  const [final, extras, charges] = (await Promise.all([
    db.from('day_lessons').select('*').eq('lesson_date', date),
    db.from('teacher_extras').select('minutes').eq('extra_date', date),
    db.from('lesson_charges').select('amount').eq('lesson_date', date).neq('kind', 'manual'),
  ])).map(check);
  return dayStats(final.data as DayLesson[], extras.data as Pick<TeacherExtra, 'minutes'>[],
    charges.data as { amount: number }[], unbilled, LESSON_MINUTES);
}

/**
 * אחרי שעדכנו מסלול תשלום לתלמידים ביום שכבר נסגר: מחייבים את היום מחדש,
 * ואם הוא נעול - מעדכנים את תמונת המצב (הסכומים ומי שלא חויב)
 */
export async function rebillDay(db: DB, date: string): Promise<number> {
  const billed = await billClosedDays(db, { from: date, to: date });
  const lock = await db.from('day_locks').select('lesson_date').eq('lesson_date', date).maybeSingle();
  if (lock.data) {
    check(await db.from('day_locks').update({ stats: await snapshot(db, date, billed.unbilled) }).eq('lesson_date', date));
  }
  return billed.unbilled;
}

/** מחזיר true אם הבדיקה הושלמה (ואפשר לא לבדוק שוב היום), false אם משהו נכשל */
async function lockOverdueDays(db: DB): Promise<boolean> {
  try {
    const settings = await db.from('billing_settings').select('auto_close_from').single();
    if (settings.error) return false; // עוד לא הריצו את 0052
    const from = settings.data.auto_close_from as string;
    const last = addDays(israelToday(), -2);
    if (from > last) return true;
    const [locks, saved] = await Promise.all([
      db.from('day_locks').select('lesson_date').gte('lesson_date', from).lte('lesson_date', last),
      db.from('day_lessons').select('lesson_date').gte('lesson_date', from).lte('lesson_date', last),
    ]);
    if (locks.error || saved.error) return false;
    const candidates = [
      ...activityDays(ACTIVITY_YEAR.weekdays).filter((d) => d >= from && d <= last),
      ...saved.data.map((r) => r.lesson_date as string),
    ];
    const overdue = overdueDates(candidates, new Set(locks.data.map((l) => l.lesson_date as string)), from, israelToday());
    await lockDays(db, overdue, true);
    return true;
  } catch (e) {
    console.error('סגירה אוטומטית של ימים נכשלה:', e);
    return false;
  }
}

const lockOncePerDay = oncePerKey(lockOverdueDays);

/**
 * סגירה אוטומטית: יום שלא נסגר ביד נסגר 24 שעות אחרי שנגמר (ימי פעילות לפי הלוח, וכל יום שנשמר בו משהו).
 * רץ כשפותחים את המערכת, כך שגם אם לא נכנסו כמה ימים - כל מה שהתאחר נסגר. לא מפיל את הדף אם משהו נכשל.
 * מה שמתאחר משתנה רק כשהתאריך מתחלף, אז כל שרת בודק פעם ביום ולא בכל טעינת דף
 */
export function autoLockOverdue(db: DB): Promise<void> {
  return lockOncePerDay(israelToday(), db);
}
