import type { NextRequest } from 'next/server';
import { ageFrom } from '@/lib/age';
import { DAYS, GENDER_LABELS, HEALTH_FUND_LABELS, STUDENT_STATUS_LABELS } from '@/lib/constants';
import { loadAll } from '@/lib/data';
import { xlsxResponse, yesNo } from '@/lib/export';
import { filterFundStudents, fundFilters, ID_STATE_LABELS, idState } from '@/lib/funds';
import { createClient } from '@/lib/supabase/server';
import { hhmm } from '@/lib/time';
import { fullName, type Student } from '@/lib/types';

/** הורדת תלמידים לשליחה לקופות (לפי הסינון בלוח הקופות) לאקסל */
export async function GET(req: NextRequest) {
  const all = await loadAll(await createClient());
  const { maps } = all;
  const f = fundFilters(Object.fromEntries(req.nextUrl.searchParams));
  const students = filterFundStudents(all, f);

  const contact = (s: Student) => all.primaryContact(s.id);
  const lessons = (s: Student) => all.lessons.filter((l) => l.student_id === s.id);
  const instruments = (s: Student) => [
    ...lessons(s).map((l) => maps.instrument.get(l.instrument_id)?.name ?? ''),
    ...all.enrollments.filter((e) => e.student_id === s.id).map((e) => maps.choir.get(e.choir_id)?.name ?? ''),
  ].join(', ');

  const name = f.fund && f.fund !== 'none' ? `קופות - ${HEALTH_FUND_LABELS[f.fund]}` : 'קופות';
  return xlsxResponse<Student>(name, [
    { header: 'שם פרטי', value: (s) => s.first_name },
    { header: 'שם משפחה', value: (s) => s.last_name },
    { header: 'ת"ז', width: 13, value: (s) => s.id_number },
    { header: 'תקינות ת"ז', width: 14, value: (s) => ID_STATE_LABELS[idState(s)] },
    { header: 'תאריך לידה', width: 13, value: (s) => (s.birth_date && !s.birth_date_approx ? s.birth_date : '') },
    { header: 'גיל', width: 8, value: (s) => (s.birth_date ? ageFrom(s.birth_date) : null) },
    { header: 'מין', width: 8, value: (s) => (s.gender ? GENDER_LABELS[s.gender] : '') },
    { header: 'קופת חולים', width: 12, value: (s) => (s.health_fund ? HEALTH_FUND_LABELS[s.health_fund] : '') },
    { header: 'סוג מנוי', width: 14, value: (s) => s.health_plan },
    { header: 'יש הפניה', width: 10, value: (s) => yesNo(s.has_referral) },
    { header: 'נשלח לקופה', width: 11, value: (s) => yesNo(s.hmo_reported) },
    { header: 'הורה', width: 14, value: (s) => contact(s)?.name ?? '' },
    { header: 'טלפון', width: 14, value: (s) => contact(s)?.phone ?? '' },
    { header: 'סניף', width: 14, value: (s) => (s.branch_id ? maps.branch.get(s.branch_id)?.name ?? '' : '') },
    { header: 'כלי / מקהלה', width: 18, value: instruments },
    { header: 'מורה', width: 16, value: (s) => [...new Set(lessons(s).map((l) => fullName(maps.teacher.get(l.teacher_id))))].join(', ') },
    { header: 'מועד שיעור', width: 16, value: (s) => lessons(s).map((l) => `${DAYS[l.weekday]} ${hhmm(l.start_time)}`).join(', ') },
    { header: 'סטטוס', width: 12, value: (s) => STUDENT_STATUS_LABELS[s.status] },
  ], students);
}
