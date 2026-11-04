import 'server-only';
import { diffCharges, dropWaived, freePairLessons, planCharges, planSiblingDiscounts, type NewCharge } from './billing';
import type { PaymentTrack } from './constants';
import { dmy } from './day';
import type { DB } from './supabase/server';
import type { BillingSettings, Charge, DayClosure, DayLesson } from './types';

const MISSING = ['42P01', 'PGRST205', 'PGRST204', '42703'];
const missingMsg = 'צריך להריץ את 0041_lesson_billing.sql ב-Supabase';

/** "שיעור בזוג פסנתר 20/10/2026" */
const lessonLabel = (r: DayLesson, instrument: Map<number, string>) =>
  `שיעור ${r.pair ? 'בזוג ' : ''}${r.instrument_id ? instrument.get(r.instrument_id) ?? '' : ''} ${dmy(r.lesson_date)}`.replace(/\s+/g, ' ');

/** חיובים שנמחקו ביד. לפני 0057 הטבלה לא קיימת - אין כאלה */
async function loadWaived(db: DB, studentIds: number[]) {
  if (!studentIds.length) return [];
  const { data, error } = await db.from('waived_charges').select('teacher_id, lesson_date, student_id, kind').in('student_id', studentIds);
  if (error && !MISSING.includes(error.code)) throw new Error(error.message);
  return (data ?? []) as { teacher_id: number; lesson_date: string; student_id: number; kind: string }[];
}

/** הנחות אחים מחושבות בנפרד (syncSiblingDiscounts), אז חיוב רגיל של שיעורים לא נוגע בהן */
const notDiscount = (c: Charge) => c.kind !== 'sibling_discount';

/**
 * מעדכן את הנחות האחים של התלמידים לפי חיובי השיעורים שלהם, מהתאריך שנבחר בכרטיס ועד היום.
 * הנחה שכבר קיימת נשארת בסכום שלה, הנחה שנמחקה ביד לא חוזרת, ותלמיד/ה בלי הסימון לא נבדק/ת (מה שכבר נוצר נשאר).
 * לפני 0059 אין עמודות: אין מה לעדכן
 */
export async function syncSiblingDiscounts(db: DB, studentIds: number[]) {
  const none = { inserted: 0, removed: 0 };
  if (!studentIds.length) return none;
  const { data: marked, error } = await db.from('students').select('id, sibling_discount_amount, sibling_discount_from')
    .in('id', studentIds).eq('sibling_discount', true);
  if (error) {
    if (MISSING.includes(error.code)) return none;
    throw new Error(error.message);
  }
  if (!marked?.length) return none;
  const ids = marked.map((s) => s.id as number);
  const [charges, waived] = await Promise.all([
    db.from('lesson_charges').select('*').in('student_id', ids).in('kind', ['lesson', 'sibling_discount']),
    loadWaived(db, ids),
  ]);
  if (charges.error) throw new Error(charges.error.message);

  const insert: NewCharge[] = [];
  const remove: number[] = [];
  for (const s of marked) {
    const from = s.sibling_discount_from as string | null;
    const mine = (charges.data as Charge[]).filter((c) => c.student_id === s.id);
    const planned = planSiblingDiscounts(mine.filter(notDiscount), Number(s.sibling_discount_amount), from);
    // הנחות מלפני התאריך שנבחר (תקופה קודמת) לא נבדקות
    const existing = mine.filter((c) => !notDiscount(c) && c.lesson_date >= (from ?? ''));
    const diff = diffCharges(existing, dropWaived(planned, waived));
    insert.push(...diff.insert);
    remove.push(...diff.remove);
  }
  if (remove.length) {
    const { error: e } = await db.from('lesson_charges').delete().in('id', remove);
    if (e) throw new Error(e.message);
  }
  if (insert.length) {
    const { error: e } = await db.from('lesson_charges').insert(insert);
    if (e) throw new Error(e.message);
  }
  return { inserted: insert.length, removed: remove.length };
}

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
  let existingCharges = (existing.data as Charge[]).filter(notDiscount).filter(isClosed);
  // יום שנפתח כבר לא ב-dayRows, אבל הספירה של התלמידים שלו זזה
  const touched = new Set([...(rows.data as DayLesson[]), ...(existing.data as Charge[])].map((r) => r.student_id));

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
      existingCharges = [...existingCharges, ...(laterCharges.data as Charge[]).filter(notDiscount)
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
  const { insert, remove } = diffCharges(existingCharges, dropWaived(plan.charges, await loadWaived(db, ids)));

  if (insert.length) {
    const { error: e } = await db.from('lesson_charges').insert(insert);
    if (e) throw new Error(e.message);
  }
  if (remove.length) {
    const { error: e } = await db.from('lesson_charges').delete().in('id', remove);
    if (e) throw new Error(e.message);
  }
  await syncSiblingDiscounts(db, [...touched]);
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
  const current = (existing.data as Charge[]).filter(notDiscount).filter((c) => closed.has(`${c.teacher_id}:${c.lesson_date}`));
  const { insert, remove } = diffCharges(current, dropWaived(plan.charges, await loadWaived(db, [studentId])), true);
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
  await syncSiblingDiscounts(db, [studentId]);
  return { changed: lessonsChanged, unbilled: plan.unbilled.length };
}

/** ביטול סגירת יום: מוחק את החיובים של היום (חוץ מפיקדונות שכבר הביאו עליהם התחייבות) */
export async function unbillDay(db: DB, teacherId: number, date: string) {
  const { error } = await db.from('lesson_charges').delete()
    .eq('teacher_id', teacherId).eq('lesson_date', date).neq('kind', 'manual').is('commitment_on', null);
  if (error && !MISSING.includes(error.code)) throw new Error(error.message);
}
