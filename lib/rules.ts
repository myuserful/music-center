import 'server-only';
import { CHOIR_CAPACITY, CHOIR_INSTRUMENT, DAYS, LESSON_MINUTES } from './constants';
import { daySlots, withinHours } from './availability';
import { fmt, overlaps, START_STEP, toMin } from './time';
import type { DB } from './supabase/server';

type Named = { first_name: string; last_name: string };
type ChoirTime = { weekday: number; start_time: string; end_time: string };

type LessonInput = {
  student_id: number; teacher_id: number; instrument_id: number; room_id: number;
  weekday: number; start_time: string;
};

/** בדיקות שיבוץ שיעור פרטי. מחזיר הודעת שגיאה בעברית או null */
export async function validateLesson(db: DB, l: LessonInput, excludeId?: number): Promise<string | null> {
  const start = toMin(l.start_time);
  const end = start + LESSON_MINUTES;
  if (start % START_STEP !== 0) return 'שיעור מתחיל בשעה עגולה או ברבעי שעה (:00, :15, :30, :45)';

  const [hours, teaches, clash, choirs, studentChoirs] = await Promise.all([
    db.from('teacher_hours').select('weekday,start_time,end_time').eq('teacher_id', l.teacher_id).eq('weekday', l.weekday),
    db.from('teacher_instruments').select('teacher_id').eq('teacher_id', l.teacher_id).eq('instrument_id', l.instrument_id),
    db.from('lessons').select('id,teacher_id,room_id,student_id,start_time')
      .eq('weekday', l.weekday)
      .or(`teacher_id.eq.${l.teacher_id},room_id.eq.${l.room_id},student_id.eq.${l.student_id}`)
      .neq('id', excludeId ?? -1),
    db.from('choirs').select('teacher_id,room_id,start_time,end_time')
      .eq('weekday', l.weekday).or(`teacher_id.eq.${l.teacher_id},room_id.eq.${l.room_id}`),
    db.from('choir_enrollments').select('choir:choirs!inner(weekday,start_time,end_time)')
      .eq('student_id', l.student_id).eq('choir.weekday', l.weekday),
  ]);

  if (!withinHours(hours.data ?? [], l.weekday, start)) return 'השעה מחוץ לשעות העבודה של המורה';
  const slots = daySlots(hours.data ?? [], l.weekday);
  if (!slots.includes(start)) {
    const sample = slots.slice(0, 3).map(fmt).join(', ');
    return `אצל המורה השיעורים ביום ${DAYS[l.weekday]} מתחילים ב-${sample}... (כל חצי שעה מתחילת העבודה)`;
  }
  if (!teaches.data?.length) return 'המורה לא מלמד/ת את הכלי הזה';

  // שיעורים חופפים (גם כשהם לא מתחילים באותה שעה, למשל 16:00 ו-16:15)
  const overlapping = (clash.data ?? []).filter((c) => {
    const s = toMin(c.start_time);
    return overlaps(start, end, s, s + LESSON_MINUTES);
  });
  for (const c of overlapping) {
    if (c.teacher_id === l.teacher_id) return 'למורה כבר יש שיעור בשעה זו';
    if (c.room_id === l.room_id) return 'החדר תפוס בשעה זו';
    if (c.student_id === l.student_id) return 'לתלמיד/ה כבר יש שיעור בשעה זו';
  }
  for (const c of choirs.data ?? []) {
    if (!overlaps(start, end, toMin(c.start_time), toMin(c.end_time))) continue;
    return c.teacher_id === l.teacher_id ? 'המורה מעביר/ה מקהלה בשעה זו' : 'החדר תפוס במקהלה בשעה זו';
  }
  for (const e of (studentChoirs.data ?? []) as unknown as { choir: ChoirTime }[]) {
    if (overlaps(start, end, toMin(e.choir.start_time), toMin(e.choir.end_time)))
      return 'התלמיד/ה במקהלה בשעה זו';
  }
  return null;
}

type ChoirInput = { teacher_id: number; room_id: number; weekday: number; start_time: string; end_time: string };

export async function validateChoir(db: DB, c: ChoirInput, excludeId?: number): Promise<string | null> {
  const start = toMin(c.start_time);
  const end = toMin(c.end_time);
  if (end <= start) return 'שעת הסיום חייבת להיות אחרי שעת ההתחלה';

  const [teaches, lessons, choirs, members] = await Promise.all([
    db.from('teacher_instruments').select('instrument:instruments!inner(name)')
      .eq('teacher_id', c.teacher_id).eq('instrument.name', CHOIR_INSTRUMENT),
    db.from('lessons').select('teacher_id,room_id,start_time')
      .eq('weekday', c.weekday).or(`teacher_id.eq.${c.teacher_id},room_id.eq.${c.room_id}`),
    db.from('choirs').select('id,teacher_id,room_id,start_time,end_time')
      .eq('weekday', c.weekday).or(`teacher_id.eq.${c.teacher_id},room_id.eq.${c.room_id}`)
      .neq('id', excludeId ?? -1),
    db.from('choir_enrollments').select('student_id').eq('choir_id', excludeId ?? -1),
  ]);

  if (!teaches.data?.length) return `המורה צריך/ה להיות משויך/ת לכלי "${CHOIR_INSTRUMENT}"`;
  for (const l of lessons.data ?? []) {
    const s = toMin(l.start_time);
    if (!overlaps(start, end, s, s + LESSON_MINUTES)) continue;
    return l.teacher_id === c.teacher_id ? 'למורה יש שיעור פרטי בזמן הזה' : 'החדר תפוס בשיעור פרטי בזמן הזה';
  }
  for (const o of choirs.data ?? []) {
    if (!overlaps(start, end, toMin(o.start_time), toMin(o.end_time))) continue;
    return o.teacher_id === c.teacher_id ? 'למורה יש מקהלה אחרת בזמן הזה' : 'החדר תפוס במקהלה אחרת בזמן הזה';
  }
  // בשינוי זמן של מקהלה קיימת: לוודא שאף ילד רשום לא מתנגש
  const ids = (members.data ?? []).map((m) => m.student_id);
  if (ids.length) return studentsBusy(db, ids, c.weekday, start, end, excludeId);
  return null;
}

async function studentsBusy(
  db: DB, studentIds: number[], weekday: number, start: number, end: number, skipChoirId?: number,
): Promise<string | null> {
  const [lessons, enr] = await Promise.all([
    db.from('lessons').select('start_time,student:students(first_name,last_name)')
      .in('student_id', studentIds).eq('weekday', weekday),
    db.from('choir_enrollments')
      .select('choir_id,choir:choirs!inner(weekday,start_time,end_time),student:students(first_name,last_name)')
      .in('student_id', studentIds).eq('choir.weekday', weekday).neq('choir_id', skipChoirId ?? -1),
  ]);
  for (const l of (lessons.data ?? []) as unknown as { start_time: string; student: Named }[]) {
    const s = toMin(l.start_time);
    if (overlaps(start, end, s, s + LESSON_MINUTES))
      return `ל${l.student.first_name} ${l.student.last_name} יש שיעור פרטי בזמן הזה`;
  }
  for (const e of (enr.data ?? []) as unknown as { choir: ChoirTime; student: Named }[]) {
    if (overlaps(start, end, toMin(e.choir.start_time), toMin(e.choir.end_time)))
      return `${e.student.first_name} ${e.student.last_name} במקהלה אחרת בזמן הזה`;
  }
  return null;
}

export async function validateEnrollment(db: DB, choirId: number, studentId: number): Promise<string | null> {
  const [{ data: choir }, { count }] = await Promise.all([
    db.from('choirs').select('weekday,start_time,end_time').eq('id', choirId).single(),
    db.from('choir_enrollments').select('id', { count: 'exact', head: true }).eq('choir_id', choirId),
  ]);
  if (!choir) return 'המקהלה לא נמצאה';
  if ((count ?? 0) >= CHOIR_CAPACITY) return `המקהלה מלאה (${CHOIR_CAPACITY} ילדים)`;
  return studentsBusy(db, [studentId], choir.weekday, toMin(choir.start_time), toMin(choir.end_time), choirId);
}
