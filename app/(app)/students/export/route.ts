import type { NextRequest } from 'next/server';
import { ageFrom } from '@/lib/age';
import { DAYS, GENDER_LABELS, HEALTH_FUND_LABELS, STATUS_LABELS, STUDENT_STATUS_LABELS } from '@/lib/constants';
import { loadAll } from '@/lib/data';
import { xlsxResponse, yesNo } from '@/lib/export';
import { filterStudents, studentFilters } from '@/lib/filters';
import { createClient } from '@/lib/supabase/server';
import { hhmm } from '@/lib/time';
import { fullName, type Student } from '@/lib/types';

/** הורדת רשימת התלמידים (לפי הסינון הנוכחי) לאקסל */
export async function GET(req: NextRequest) {
  const all = await loadAll(await createClient());
  const { maps } = all;
  const students = filterStudents(all, studentFilters(Object.fromEntries(req.nextUrl.searchParams)));

  const contact = (s: Student) => all.primaryContact(s.id);
  const assignments = (s: Student) => [
    ...all.lessons.filter((l) => l.student_id === s.id).map((l) =>
      `${maps.instrument.get(l.instrument_id)?.name} · ${fullName(maps.teacher.get(l.teacher_id))} · ${DAYS[l.weekday]} ${hhmm(l.start_time)} (${STATUS_LABELS[l.status]})`),
    ...all.enrollments.filter((e) => e.student_id === s.id).map((e) =>
      `${maps.choir.get(e.choir_id)?.name} (${STATUS_LABELS[e.status]})`),
  ].join('\n');

  return xlsxResponse<Student>('תלמידים', [
    { header: 'שם פרטי', value: (s) => s.first_name },
    { header: 'שם משפחה', value: (s) => s.last_name },
    { header: 'סטטוס', width: 12, value: (s) => STUDENT_STATUS_LABELS[s.status] },
    { header: 'ממתין/ה ל...', width: 24, value: (s) => (s.status === 'waiting' ? s.waiting_reason ?? '' : '') },
    { header: 'מין', width: 8, value: (s) => (s.gender ? GENDER_LABELS[s.gender] : '') },
    { header: 'גיל', width: 8, value: (s) => (s.birth_date ? ageFrom(s.birth_date) : null) },
    { header: 'תאריך לידה', width: 13, value: (s) => (s.birth_date && !s.birth_date_approx ? s.birth_date : '') },
    { header: 'ת"ז', width: 13, value: (s) => s.id_number },
    { header: 'מקום לימודים', value: (s) => s.school },
    { header: 'סניף', width: 14, value: (s) => (s.branch_id ? maps.branch.get(s.branch_id)?.name ?? '' : '') },
    { header: 'כלי מבוקש', width: 12, value: (s) => (s.requested_instrument_id ? maps.instrument.get(s.requested_instrument_id)?.name ?? '' : '') },
    { header: 'שפה', width: 10, value: (s) => s.language },
    { header: 'קופת חולים', width: 12, value: (s) => (s.health_fund ? HEALTH_FUND_LABELS[s.health_fund] : '') },
    { header: 'סוג מנוי', width: 14, value: (s) => s.health_plan },
    { header: 'יש הפניה', width: 10, value: (s) => yesNo(s.has_referral) },
    { header: 'עודכן בקופה', width: 11, value: (s) => yesNo(s.hmo_reported) },
    { header: 'איש קשר', width: 14, value: (s) => contact(s)?.name ?? '' },
    { header: 'טלפון', width: 14, value: (s) => contact(s)?.phone ?? '' },
    { header: 'העדפות שעה', width: 24, value: (s) => s.preferred_times },
    { header: 'שיבוצים', width: 36, value: assignments },
    { header: 'הערות', width: 40, value: (s) => s.notes },
    { header: 'לבדיקה', width: 10, value: (s) => yesNo(s.needs_review) },
  ], students);
}
