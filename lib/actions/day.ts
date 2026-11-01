'use server';

import { billClosedDays, unbillDay } from '../charging';
import { PAYMENT_TRACKS, type PaymentTrack } from '../constants';
import {
  dayLabel, dayRows, hoursLabel, israelToday, moveRow, parseRows, unknownTrackStudents, validDate, weekdayOf, type DayRow,
} from '../day';
import { isLocked, lockDays, LOCK_MISSING, MissingTracks, rebillDay } from '../dayLock';
import { loadAll } from '../data';
import { createClient } from '../supabase/server';
import { fullName, type DayClosure, type DayLesson } from '../types';
import { dbMessage, done, fail, num, oneOf, str } from './util';

const LOCKED = 'היום הזה נסגר סופית ואי אפשר לשנות אותו';

const back = (date: string, teacherId: number) => `/daily?date=${date}#t${teacherId}`;

/** השמות של תלמידים בשורות שאין להם מסלול תשלום (בשיעורים שמחייבים) */
async function missingTracks(db: Awaited<ReturnType<typeof createClient>>, rows: DayRow[]): Promise<string[]> {
  const ids = [...new Set(rows.map((r) => r.student_id))];
  if (!ids.length) return [];
  const { data, error } = await db.from('students').select('id, first_name, last_name, payment_track').in('id', ids);
  if (error) throw new Error(error.message);
  const byId = new Map((data ?? []).map((s) => [s.id as number, s]));
  return unknownTrackStudents(rows, (id) => byId.get(id)?.payment_track as PaymentTrack | undefined)
    .map((id) => fullName(byId.get(id) as { first_name: string; last_name: string }));
}

/**
 * עדכון מסלול תשלום לתלמידים מתוך סגירת היום (track_<id> = המסלול). ביום שכבר נסגר: השיעורים מחויבים מחדש
 * לפי המסלול החדש, וגם תמונת המצב של יום נעול מתעדכנת
 */
export async function setDayTracks(fd: FormData) {
  const date = str(fd, 'date');
  if (!validDate(date)) fail('/daily', 'תאריך לא תקין');
  const teacherId = num(fd, 'teacher_id');
  const to = teacherId ? back(date, teacherId) : `/daily?date=${date}`;
  const updates = [...fd.keys()].filter((k) => /^track_\d+$/.test(k))
    .map((k) => ({ id: Number(k.slice(6)), track: oneOf(str(fd, k), PAYMENT_TRACKS.filter((t) => t !== 'unknown')) }));
  if (!updates.length || updates.some((u) => !u.track)) fail(to, 'יש לבחור מסלול תשלום');
  const db = await createClient();
  for (const u of updates) {
    const { error } = await db.from('students').update({ payment_track: u.track }).eq('id', u.id);
    if (error) fail(to, dbMessage(error));
  }
  let unbilled: number;
  try {
    unbilled = await rebillDay(db, date);
  } catch (e) {
    fail(to, `המסלול עודכן, אבל החיובים של היום לא חושבו מחדש: ${(e as Error).message}`);
  }
  done(to, `מסלול התשלום עודכן ל-${updates.length} תלמידים${unbilled! ? ` (עדיין ${unbilled!} שיעורים לא חויבו)` : ''}`);
}

/** שמירת היום של מורה (רק ליום הזה, לא משנה את מערכת השעות). close=1: גם סגירת היום */
export async function saveDay(fd: FormData) {
  const date = str(fd, 'date');
  const teacherId = num(fd, 'teacher_id');
  if (!validDate(date) || !teacherId) fail('/daily', 'תאריך או מורה לא תקינים');
  const to = back(date, teacherId!);
  const rows = parseRows(str(fd, 'rows'), teacherId!);
  if (!rows) fail(to, 'השורות לא תקינות');
  const close = str(fd, 'close') === '1';

  const db = await createClient();
  if (await isLocked(db, date)) fail(to, LOCKED);
  if (rows!.some((r) => r.substitute_id)) {
    const { error: e } = await db.from('day_lessons').select('substitute_id').limit(1);
    if (e) fail(to, 'כדי לשמור מילוי מקום צריך להריץ את 0040_substitute_teacher.sql ב-Supabase');
  }
  // תלמידים בלי מסלול תשלום: שומרים, אבל לא סוגרים (אי אפשר לחייב אותם)
  const missing = close ? await missingTracks(db, rows!) : [];
  const { error } = await db.rpc('save_day', { p_teacher: teacherId, p_date: date, p_rows: rows, p_close: close && !missing.length });
  if (error) fail(to, error.code === 'PGRST202' ? 'צריך להריץ את 0039_day_lessons.sql ב-Supabase' : dbMessage(error));
  if (missing.length) fail(to, `נשמר, אבל לא נסגר: אין מסלול תשלום ל${missing.join(', ')}. צריך לעדכן מסלול בכרטיס ואז לסגור`);
  if (!close) done(to, 'נשמר (היום עדיין פתוח)');

  // סגירת יום: כל שיעור שהתקיים יורד מהיתרה של התלמיד/ה
  let billed: Awaited<ReturnType<typeof billClosedDays>>;
  try {
    billed = await billClosedDays(db, { from: date, to: date, teacherId: teacherId! });
  } catch (e) {
    fail(to, `היום נסגר, אבל החיובים לא נוצרו: ${(e as Error).message}`);
  }
  done(to, billed!.unbilled
    ? `היום נסגר. ${billed!.unbilled} שיעורים לא חויבו כי מסלול התשלום לא ידוע (אפשר לקבוע מסלול ולחייב מחדש בדף התשלומים)`
    : 'היום נסגר והשיעורים חויבו');
}

/** ביטול סגירת יום: היום חוזר להיות פתוח לעריכה. השורות שנשמרו נשארות */
export async function reopenDay(fd: FormData) {
  const date = str(fd, 'date');
  const teacherId = num(fd, 'teacher_id');
  if (!validDate(date) || !teacherId) fail('/daily', 'תאריך או מורה לא תקינים');
  const db = await createClient();
  if (await isLocked(db, date)) fail(back(date, teacherId!), LOCKED);
  const { error } = await db.from('day_closures').delete().eq('teacher_id', teacherId!).eq('lesson_date', date);
  if (error) fail(back(date, teacherId!), dbMessage(error));
  try {
    await unbillDay(db, teacherId!, date);
    // שיעורים בזוג: הספירה של "כל רביעי חינם" זזה, ומחייבים מחדש את הימים הסגורים שאחרי היום הזה
    await billClosedDays(db, { from: date, to: date, teacherId: teacherId! });
  } catch (e) {
    fail(back(date, teacherId!), `סגירת היום בוטלה, אבל החיובים לא נמחקו: ${(e as Error).message}`);
  }
  done(back(date, teacherId!), 'סגירת היום בוטלה והחיובים של היום הוסרו. אפשר לערוך');
}

/**
 * העברה חד-פעמית של תלמיד/ה ליום אחר (או למורה אחר/ת): יוצא/ת מהיום הזה ונכנס/ת ליום החדש, בלי לשנות את מערכת השעות.
 * היום הנוכחי נשמר עם מה שבמסך (גם שינויים שעוד לא נשמרו)
 */
export async function moveStudent(fd: FormData) {
  const date = str(fd, 'date');
  const teacherId = num(fd, 'teacher_id');
  if (!validDate(date) || !teacherId) fail('/daily', 'תאריך או מורה לא תקינים');
  const to = back(date, teacherId!);
  const studentId = num(fd, 'move_student');
  const toDate = str(fd, 'to_date');
  const toTeacher = num(fd, 'to_teacher') ?? teacherId!;
  const toTime = str(fd, 'to_time') || null;
  const fromRows = parseRows(str(fd, 'rows'), teacherId!);
  if (!fromRows || !studentId) fail(to, 'השורות לא תקינות');
  if (!validDate(toDate)) fail(to, 'יש לבחור תאריך');
  if (toTime && !/^\d{2}:\d{2}$/.test(toTime)) fail(to, 'שעה לא תקינה');

  const db = await createClient();
  const [locks, closures, saved, all] = await Promise.all([
    db.from('day_locks').select('lesson_date').in('lesson_date', [date, toDate]).is('unlocked_at', null),
    db.from('day_closures').select('*').in('lesson_date', [date, toDate]).in('teacher_id', [teacherId!, toTeacher]),
    db.from('day_lessons').select('*').eq('lesson_date', toDate).eq('teacher_id', toTeacher),
    loadAll(db),
  ]);
  if (locks.error?.code === '42P01' || locks.error?.code === 'PGRST205') fail(to, LOCK_MISSING);
  const error = [locks, closures, saved].find((r) => r.error)?.error;
  if (error) fail(to, dbMessage(error));
  if (locks.data!.length) fail(to, `${locks.data!.some((l) => l.lesson_date === toDate) ? dayLabel(toDate) : 'היום הזה'} כבר נסגר סופית`);
  const isClosed = (d: string, t: number) => (closures.data as DayClosure[]).some((c) => c.lesson_date === d && c.teacher_id === t);
  if (isClosed(date, teacherId!)) fail(to, 'היום של המורה הזה כבר נסגר. צריך לבטל את הסגירה קודם');
  if (isClosed(toDate, toTeacher)) fail(to, `היום של המורה ב${dayLabel(toDate)} כבר נסגר. צריך לבטל שם את הסגירה קודם`);

  const target = all.maps.teacher.get(toTeacher);
  if (!target) fail(to, 'המורה לא נמצא/ה');
  const hours = all.hours.filter((h) => h.teacher_id === toTeacher && h.weekday === weekdayOf(toDate));
  const moved = moveRow({
    fromRows: fromRows!, toRows: dayRows(saved.data as DayLesson[], all.lessons, toTeacher, toDate, false).rows,
    studentId: studentId!, fromDate: date, fromTeacher: teacherId!, toDate, toTeacher,
    toTime: toTime ?? fromRows!.find((r) => r.student_id === studentId)?.start_time ?? null,
    toRoom: hours.find((h) => h.room_id)?.room_id ?? target!.room_id,
  });
  if (typeof moved === 'string') fail(to, moved);
  const { from, to: toRows } = moved as Exclude<typeof moved, string>;

  // קודם היום החדש: אם משהו נכשל באמצע, התלמיד/ה נשאר/ת בשני הימים ולא נעלם/ת
  const save = (t: number, d: string, rows: typeof from) => db.rpc('save_day', { p_teacher: t, p_date: d, p_rows: rows, p_close: false });
  const e1 = (await save(toTeacher, toDate, toRows)).error;
  if (e1) fail(to, e1.code === 'PGRST204' || e1.code === '42703' ? LOCK_MISSING : dbMessage(e1));
  const e2 = (await save(teacherId!, date, from)).error;
  if (e2) fail(to, `התלמיד/ה נוסף/ה ל${dayLabel(toDate)}, אבל לא הוסר/ה מהיום הזה: ${dbMessage(e2)}`);

  const time = toRows.find((r) => r.student_id === studentId)?.start_time;
  done(to, `${fullName(all.maps.student.get(studentId!)) || 'התלמיד/ה'} הועבר/ה ל${dayLabel(toDate)}${time ? ` בשעה ${time}` : ''}`
    + `${toTeacher !== teacherId ? ` אצל ${fullName(target)}` : ''} (חד-פעמי)`);
}

/** תוספת זמן למורה כבר בסגירת היום (למשל עוד 10 דקות, או חצי שעה) */
export async function addDayExtra(fd: FormData) {
  const date = str(fd, 'date');
  const teacherId = num(fd, 'teacher_id');
  if (!validDate(date) || !teacherId) fail('/daily', 'תאריך או מורה לא תקינים');
  const to = back(date, teacherId!);
  const minutes = Math.round(num(fd, 'minutes') ?? num(fd, 'custom') ?? 0);
  if (minutes <= 0 || minutes > 600) fail(to, 'יש לבחור כמה דקות להוסיף');
  const db = await createClient();
  if (await isLocked(db, date)) fail(to, LOCKED);
  const { error } = await db.from('teacher_extras').insert({
    teacher_id: teacherId, extra_date: date, minutes, amount: null, reason: str(fd, 'reason') || 'תוספת בסגירת יום',
  });
  if (error) fail(to, error.code === '42P01' || error.code === 'PGRST205' ? 'צריך להריץ את 0046_teacher_pay.sql ב-Supabase' : dbMessage(error));
  done(to, `נוספו ${minutes} דקות למורה`);
}

export async function deleteDayExtra(fd: FormData) {
  const date = str(fd, 'date');
  const to = back(date, num(fd, 'teacher_id') ?? 0);
  const db = await createClient();
  if (await isLocked(db, date)) fail(to, LOCKED);
  const { error } = await db.from('teacher_extras').delete().eq('id', num(fd, 'id')!).eq('extra_date', date);
  if (error) fail(to, dbMessage(error));
  done(to, 'התוספת נמחקה');
}

/**
 * פתיחת יום סגור: כל המורים של היום חוזרים להיות פתוחים לעריכה והחיובים של היום מוסרים (כמו ביטול סגירה לכל מורה).
 * גם יום שנסגר סופית - והוא לא ייסגר שוב אוטומטית, רק ב"סגירת כל היום". השורות שנשמרו נשארות
 */
export async function unlockDay(fd: FormData) {
  const date = str(fd, 'date');
  if (!validDate(date)) fail('/daily', 'תאריך לא תקין');
  const to = `/daily?date=${date}`;
  const db = await createClient();
  // קודם הנעילה (בלעדיה המסד לא מרשה לבטל סגירה של מורה). לפני 0052 אין נעילות
  const unlock = await db.from('day_locks').update({ unlocked_at: new Date().toISOString() }).eq('lesson_date', date);
  if (unlock.error && !['42P01', 'PGRST205'].includes(unlock.error.code)) fail(to, dbMessage(unlock.error));

  const closures = await db.from('day_closures').delete().eq('lesson_date', date).select('teacher_id');
  if (closures.error) fail(to, dbMessage(closures.error));
  try {
    for (const c of closures.data ?? []) await unbillDay(db, c.teacher_id as number, date);
    // שיעורים בזוג: הספירה של "כל רביעי חינם" זזה, ומחייבים מחדש את הימים הסגורים שאחרי היום הזה
    await billClosedDays(db, { from: date, to: date });
  } catch (e) {
    fail(to, `היום נפתח, אבל החיובים לא נמחקו: ${(e as Error).message}`);
  }
  done(to, `היום נפתח (${closures.data?.length ?? 0} מורים) והחיובים של היום הוסרו. אחרי העריכה סוגרים שוב`);
}

/** סגירת כל היום: כל המורים נסגרים, השיעורים מחויבים, והיום ננעל סופית */
export async function lockWholeDay(fd: FormData) {
  const date = str(fd, 'date');
  if (!validDate(date)) fail('/daily', 'תאריך לא תקין');
  const to = `/daily?date=${date}`;
  if (date > israelToday()) fail(to, 'אי אפשר לסגור סופית יום שעוד לא הגיע');
  const db = await createClient();
  if (await isLocked(db, date)) fail(to, 'היום הזה כבר נסגר סופית');
  let stats: Awaited<ReturnType<typeof lockDays>>;
  try {
    stats = await lockDays(db, [date], false, { requireTracks: true });
  } catch (e) {
    fail(to, e instanceof MissingTracks ? `אי אפשר לסגור את היום: אין מסלול תשלום ל${e.names.join(', ')}. צריך לעדכן מסלול בכרטיס של המורה` : `הסגירה לא הושלמה: ${(e as Error).message}`);
  }
  const s = stats!.get(date)!;
  done(to, `היום נסגר סופית: ${s.students} תלמידים הגיעו, ${s.absent + s.excused + s.cancelled} לא הגיעו או בוטלו, `
    + `${s.teachers} מורים, ${hoursLabel(s.teacherMinutes)} שעות למורים${s.unbilled ? `, ${s.unbilled} שיעורים לא חויבו (מסלול לא ידוע)` : ''}`);
}
