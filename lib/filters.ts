import type { Gender, Interest, StudentStatus, TeacherGender } from './constants';
import type { All } from './data';
import { fullName } from './types';

type Params = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? '';

/** סינון תלמידים לפי פרמטרי הכתובת. משותף לדף ולייצוא לאקסל */
export function studentFilters(sp: Params) {
  const q = one(sp.q).trim();
  return {
    q,
    qDigits: q.replace(/\D/g, ''),
    branch: Number(one(sp.branch)) || null,
    gender: one(sp.gender) as Gender | '',
    // ברירת מחדל: פעילים ומתלבטים. "all" = כולם
    status: one(sp.status) as StudentStatus | 'all' | '',
    review: one(sp.review) === '1',
  };
}

export function filterStudents(all: All, f: ReturnType<typeof studentFilters>) {
  const { q, qDigits, branch, gender, status, review } = f;
  return all.students.filter((s) =>
    (status === 'all' || (status ? s.status === status : s.status !== 'inactive')) &&
    (!review || s.needs_review) &&
    (!branch || s.branch_id === branch) &&
    (!gender || s.gender === gender) &&
    (!q || fullName(s).includes(q) || s.id_number.includes(q) || all.contacts.some((c) => c.student_id === s.id && ((qDigits !== '' && c.phone.replace(/\D/g, '').includes(qDigits)) || c.name.includes(q)))),
  );
}

/** סינון מורים לפי פרמטרי הכתובת. משותף לדף ולייצוא לאקסל */
export function teacherFilters(sp: Params) {
  const q = one(sp.q).trim();
  return {
    q,
    qDigits: q.replace(/\D/g, ''),
    instrument: Number(one(sp.instrument)) || null,
    branch: Number(one(sp.branch)) || null,
    gender: one(sp.gender) as TeacherGender | '',
    // ברירת מחדל: רק מי שמעוניין/ת. "all" = הכל, "unknown" = עוד לא ידוע
    interest: (one(sp.interest) || 'yes') as Interest | 'unknown' | 'all',
    language: one(sp.language),
    youngBoys: one(sp.young_boys) === '1',
    showInactive: one(sp.inactive) === '1',
  };
}

export function filterTeachers(all: All, f: ReturnType<typeof teacherFilters>) {
  const { q, qDigits, instrument, branch, gender, interest, language, youngBoys, showInactive } = f;
  return all.teachers.filter((t) =>
    (showInactive || t.active) &&
    (!instrument || all.teacherInstrumentIds(t.id).includes(instrument)) &&
    (!branch || all.teacherBranchIds(t.id).includes(branch)) &&
    (!gender || t.gender === gender) &&
    (interest === 'all' || (interest === 'unknown' ? t.interest === null : t.interest === interest)) &&
    (!language || t.languages.includes(language)) &&
    (!youngBoys || t.teaches_young_boys) &&
    (!q || fullName(t).includes(q) || t.notes.includes(q) || (qDigits !== '' && t.phone.replace(/\D/g, '').includes(qDigits))),
  );
}

/** הפרמטרים הנוכחיים כמחרוזת לקישור (למשל לכפתור הייצוא) */
export function queryString(sp: Params): string {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    if (k === 'ok' || k === 'error') continue;
    for (const x of Array.isArray(v) ? v : v ? [v] : []) u.append(k, x);
  }
  const s = u.toString();
  return s ? `?${s}` : '';
}
