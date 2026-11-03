import 'server-only';
import { diffCharges, freePairLessons, planCharges } from './billing';
import type { PaymentTrack } from './constants';
import { dmy } from './day';
import type { DB } from './supabase/server';
import type { BillingSettings, Charge, DayClosure, DayLesson } from './types';

const MISSING = ['42P01', 'PGRST205', 'PGRST204', '42703'];
const missingMsg = 'צריך להריץ את 0041_lesson_billing.sql ב-Supabase';

/** "שיעור בזוג פסנתר 20/10/2026" */
const lessonLabel = (r: DayLesson, instrument: Map<number, string>) =>
  `שיעור ${r.pair ? 'בזוג ' : ''}${r.instrument_id ? instrument.get(r.instrument_id) ?? '' : ''} ${dmy(r.lesson_date)}`.replace(/\s+/g, ' ');

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
    (r) => lessonLabel(r, instrument),
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

/**
 * חישוב מחדש של כל החיובים של תלמיד/ה בימים שנסגרו, לפי המסלול הנוכחי (אחרי שינוי מסלול, כשבוחרים לעדכן גם את העבר).
 * חיוב שחושב לפי מסלול או מחיר אחר מוחלף. לא נוגע בחיובים ידניים ובפיקדונות שכבר הביאו עליהם התחייבות.
 * התשלומים לא משתנים: הם מתחלקים מחדש על החיובים בחשבון
 */
export async function rebillStudent(db: DB, studentId: number) {
  const [rows, existing, student, settings, instruments] = await Promise.all([
    db.from('day_lessons').select('*').eq('student_id', studentId),
    db.from('lesson_charges').select('*').eq('student_id', studentId).neq('kind', 'manual'),
    db.from('students').select('payment_track').eq('id', studentId).single(),
    db.from('billing_settings').select('*').single(),
    db.from('instruments').select('id, name'),
  ]);
  const error = [rows, existing, student, settings].find((r) => r.error)?.error;
  if (error) throw new Error(MISSING.includes(error.code) ? missingMsg : error.message);

  const lessons = rows.data as DayLesson[];
  const teachers = [...new Set(lessons.map((r) => r.teacher_id).filter((t): t is number => t != null))];
  const closures = teachers.length
    ? await db.from('day_closures').select('*').in('teacher_id', teachers)
    : { data: [], error: null };
  if (closures.error) throw new Error(closures.error.message);
  const closed = new Set((closures.data as DayClosure[]).map((c) => `${c.teacher_id}:${c.lesson_date}`));
  const closedRows = lessons.filter((r) => closed.has(`${r.teacher_id}:${r.lesson_date}`));
  const instrument = new Map((instruments.data ?? []).map((i) => [i.id as number, i.name as string]));

  const track = student.data!.payment_track as PaymentTrack;
  const plan = planCharges(closedRows, () => track, settings.data as BillingSettings,
    (r) => lessonLabel(r, instrument),
    freePairLessons(closedRows.filter((r) => r.pair)));
  // חיובים של ימים שכבר לא סגורים לא נבדקים כאן (כמו בחיוב יום)
  const current = (existing.data as Charge[]).filter((c) => closed.has(`${c.teacher_id}:${c.lesson_date}`));
  const { insert, remove } = diffCharges(current, plan.charges, true);
  const lessonsChanged = new Set([...insert, ...current.filter((c) => remove.includes(c.id))]
    .map((c) => `${c.teacher_id}:${c.lesson_date}`)).size;

  if (remove.length) {
    const { error: e } = await db.from('lesson_charges').delete().in('id', remove);
    if (e) throw new Error(e.message);
  }
  if (insert.length) {
    const { error: e } = await db.from('lesson_charges').insert(insert);
    if (e) throw new Error(e.message);
  }
  return { changed: lessonsChanged, unbilled: plan.unbilled.length };
}

/** ביטול סגירת יום: מוחק את החיובים של היום (חוץ מפיקדונות שכבר הביאו עליהם התחייבות) */
export async function unbillDay(db: DB, teacherId: number, date: string) {
  const { error } = await db.from('lesson_charges').delete()
    .eq('teacher_id', teacherId).eq('lesson_date', date).neq('kind', 'manual').is('commitment_on', null);
  if (error && !MISSING.includes(error.code)) throw new Error(error.message);
}
