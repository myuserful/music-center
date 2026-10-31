'use server';

import { billClosedDays, unbillDay } from '../charging';
import { parseRows, validDate } from '../day';
import { createClient } from '../supabase/server';
import { dbMessage, done, fail, num, str } from './util';

const back = (date: string, teacherId: number) => `/daily?date=${date}#t${teacherId}`;

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
  if (rows!.some((r) => r.substitute_id)) {
    const { error: e } = await db.from('day_lessons').select('substitute_id').limit(1);
    if (e) fail(to, 'כדי לשמור מילוי מקום צריך להריץ את 0040_substitute_teacher.sql ב-Supabase');
  }
  const { error } = await db.rpc('save_day', { p_teacher: teacherId, p_date: date, p_rows: rows, p_close: close });
  if (error) fail(to, error.code === 'PGRST202' ? 'צריך להריץ את 0039_day_lessons.sql ב-Supabase' : dbMessage(error));
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
