import type { NextRequest } from 'next/server';
import { DAYS, INTEREST_LABELS, TEACHER_GENDER_LABELS } from '@/lib/constants';
import { loadAll } from '@/lib/data';
import { xlsxResponse, yesNo } from '@/lib/export';
import { filterTeachers, teacherFilters } from '@/lib/filters';
import { createClient } from '@/lib/supabase/server';
import { hhmm } from '@/lib/time';
import type { Teacher } from '@/lib/types';

/** הורדת רשימת המורים (לפי הסינון הנוכחי) לאקסל */
export async function GET(req: NextRequest) {
  const all = await loadAll(await createClient());
  const { maps } = all;
  const teachers = filterTeachers(all, teacherFilters(Object.fromEntries(req.nextUrl.searchParams)));

  const hours = (t: Teacher) => all.hours.filter((h) => h.teacher_id === t.id)
    .map((h) => `${DAYS[h.weekday]} ${hhmm(h.start_time)}-${hhmm(h.end_time)}`).join('\n');

  return xlsxResponse<Teacher>('מורים', [
    { header: 'שם פרטי', value: (t) => t.first_name },
    { header: 'שם משפחה', value: (t) => t.last_name },
    { header: 'מין', width: 8, value: (t) => (t.gender ? TEACHER_GENDER_LABELS[t.gender] : '') },
    { header: 'טלפון', width: 15, value: (t) => t.phone },
    { header: 'אימייל', width: 22, value: (t) => t.email },
    { header: 'כלים', width: 22, value: (t) => all.teacherInstrumentIds(t.id).map((i) => maps.instrument.get(i)?.name).join(', ') },
    { header: 'סניפים', width: 24, value: (t) => all.teacherBranchIds(t.id).map((b) => maps.branch.get(b)?.name).join(', ') },
    { header: 'מעוניין/ת', width: 12, value: (t) => (t.interest ? INTEREST_LABELS[t.interest] : '') },
    { header: 'מחיר לשעה', width: 11, value: (t) => t.hourly_rate },
    { header: 'ימים בשבוע', width: 11, value: (t) => t.days_per_week },
    { header: 'שפות', width: 14, value: (t) => t.languages.join(', ') },
    { header: 'בנים עד 9', width: 10, value: (t) => yesNo(t.teaches_young_boys) },
    { header: 'חדרים לפי ימים', width: 30, value: (t) => all.teacherRooms(t.id).join(', ') },
    { header: 'שעות עבודה', width: 22, value: hours },
    { header: 'שיעורים', width: 9, value: (t) => all.lessons.filter((l) => l.teacher_id === t.id).length },
    { header: 'פעיל/ה', width: 8, value: (t) => yesNo(t.active) },
    { header: 'הערות', width: 40, value: (t) => t.notes },
  ], teachers);
}
