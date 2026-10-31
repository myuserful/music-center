import 'server-only';
import { diffCharges, freePairLessons, planCharges } from './billing';
import type { PaymentTrack } from './constants';
import { dmy } from './day';
import type { DB } from './supabase/server';
import type { BillingSettings, Charge, DayClosure, DayLesson } from './types';

const MISSING = ['42P01', 'PGRST205', 'PGRST204', '42703'];
const missingMsg = 'צריך להריץ את 0041_lesson_billing.sql ב-Supabase';

/**
 * יוצר חיובים לשיעורים של ימים סגורים בטווח (ומוחק חיובים ששייכים לשיעורים שכבר לא מחייבים).
 * teacherId: רק יום של מורה אחד/ת. מחזיר כמה נוספו/נמחקו, וכמה שיעורים לא חויבו כי המסלול לא ידוע
 */
export async function billClosedDays(db: DB, { from, to, teacherId }: { from: string; to: string; teacherId?: number }) {
  const scoped = <Q extends { eq: (c: string, v: number) => Q }>(q: Q) => (teacherId ? q.eq('teacher_id', teacherId) : q);
  const [closures, rows, existing, settings] = await Promise.all([
    scoped(db.from('day_closures').select('*').gte('lesson_date', from).lte('lesson_date', to)),
    scoped(db.from('day_lessons').select('*').gte('lesson_date', from).lte('lesson_date', to)),
    scoped(db.from('lesson_charges').select('*').gte('lesson_date', from).lte('lesson_date', to).neq('kind', 'manual')),
    db.from('billing_settings').select('*').single(),
  ]);
  const error = [closures, rows, existing, settings].find((r) => r.error)?.error;
  if (error) throw new Error(MISSING.includes(error.code) ? missingMsg : error.message);

  const closed = new Set((closures.data as DayClosure[]).map((c) => `${c.teacher_id}:${c.lesson_date}`));
  const isClosed = (r: { teacher_id: number | null; lesson_date: string }) => closed.has(`${r.teacher_id}:${r.lesson_date}`);
  let dayRows = (rows.data as DayLesson[]).filter(isClosed);
  let existingCharges = (existing.data as Charge[]).filter(isClosed);

  // שיעורים בזוג: מכל 4 הרביעי חינם, בספירה רציפה מההתחלה. לכן צריך את כל השיעורים בזוג של התלמידים האלה,
  // ושינוי ביום אחד (סגירה, ביטול סגירה, נוכחות) מחייב מחדש גם את הימים הסגורים שאחריו
  const pairStudents = [...new Set((rows.data as DayLesson[]).filter((r) => r.pair).map((r) => r.student_id))];
  let free = new Set<number>();
  if (pairStudents.length) {
    const all = await db.from('day_lessons').select('*').in('student_id', pairStudents).eq('pair', true);
    if (all.error) throw new Error(all.error.message);
    const pairRows = all.data as DayLesson[];
    const allClosures = await db.from('day_closures').select('*')
      .in('teacher_id', [...new Set(pairRows.map((r) => r.teacher_id))]);
    if (allClosures.error) throw new Error(allClosures.error.message);
    for (const c of allClosures.data as DayClosure[]) closed.add(`${c.teacher_id}:${c.lesson_date}`);
    const closedPair = pairRows.filter(isClosed);
    free = freePairLessons(closedPair);

    const later = closedPair.filter((r) => r.lesson_date > to);
    if (later.length) {
      const laterKeys = new Set(later.map((r) => `${r.teacher_id}:${r.lesson_date}:${r.student_id}`));
      const laterCharges = await db.from('lesson_charges').select('*')
        .in('student_id', [...new Set(later.map((r) => r.student_id))]).gt('lesson_date', to).neq('kind', 'manual');
      if (laterCharges.error) throw new Error(laterCharges.error.message);
      dayRows = [...dayRows, ...later];
      existingCharges = [...existingCharges, ...(laterCharges.data as Charge[])
        .filter((c) => laterKeys.has(`${c.teacher_id}:${c.lesson_date}:${c.student_id}`))];
    }
  }

  const ids = [...new Set(dayRows.map((r) => r.student_id))];
  const [students, instruments] = await Promise.all([
    ids.length ? db.from('students').select('id, payment_track').in('id', ids) : { data: [], error: null },
    db.from('instruments').select('id, name'),
  ]);
  const track = new Map((students.data ?? []).map((s) => [s.id as number, s.payment_track as PaymentTrack]));
  const instrument = new Map((instruments.data ?? []).map((i) => [i.id as number, i.name as string]));

  const plan = planCharges(dayRows, (id) => track.get(id) ?? 'unknown', settings.data as BillingSettings,
    (r) => `שיעור ${r.pair ? 'בזוג ' : ''}${r.instrument_id ? instrument.get(r.instrument_id) ?? '' : ''} ${dmy(r.lesson_date)}`.replace(/\s+/g, ' '),
    free);
  // רק חיובים של ימים סגורים נבדקים כאן (יום פתוח מטופל בביטול הסגירה)
  const { insert, remove } = diffCharges(existingCharges, plan.charges);

  if (insert.length) {
    const { error: e } = await db.from('lesson_charges').insert(insert);
    if (e) throw new Error(e.message);
  }
  if (remove.length) {
    const { error: e } = await db.from('lesson_charges').delete().in('id', remove);
    if (e) throw new Error(e.message);
  }
  return { inserted: insert.length, removed: remove.length, unbilled: plan.unbilled.length };
}

/** ביטול סגירת יום: מוחק את החיובים של היום (חוץ מפיקדונות שכבר הביאו עליהם התחייבות) */
export async function unbillDay(db: DB, teacherId: number, date: string) {
  const { error } = await db.from('lesson_charges').delete()
    .eq('teacher_id', teacherId).eq('lesson_date', date).neq('kind', 'manual').is('commitment_on', null);
  if (error && !MISSING.includes(error.code)) throw new Error(error.message);
}
