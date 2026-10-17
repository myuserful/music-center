import { HEALTH_FUND_LABELS, type HealthFund, type StudentStatus } from './constants';
import type { All } from './data';
import { fullName, type Student } from './types';

type Params = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? '';

export type IdState = 'ok' | 'missing' | 'invalid';
export const ID_STATE_LABELS: Record<IdState, string> = { ok: 'ת"ז תקינה', missing: 'חסרה ת"ז', invalid: 'ת"ז לא תקינה' };

/** בדיקת ספרת ביקורת של תעודת זהות ישראלית (עד 9 ספרות, משלימים באפסים משמאל) */
export function validIsraeliId(raw: string): boolean {
  const id = raw.replace(/[\s-]/g, '');
  if (!/^\d{5,9}$/.test(id)) return false;
  const digits = id.padStart(9, '0');
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    const n = Number(digits[i]) * ((i % 2) + 1);
    sum += n > 9 ? n - 9 : n;
  }
  return sum % 10 === 0;
}

export const idState = (s: Pick<Student, 'id_number'>): IdState =>
  !s.id_number.trim() ? 'missing' : validIsraeliId(s.id_number) ? 'ok' : 'invalid';

/** מוכן/ה לשליחה לקופה: יש קופה (לא פרטי), יש הפניה, ת"ז תקינה ועוד לא נשלח */
export const readyToSend = (s: Student) =>
  !!s.health_fund && s.health_fund !== 'private' && s.has_referral && idState(s) === 'ok' && !s.hmo_reported;

type YesNo = 'yes' | 'no' | '';
const yesNo = (v: string): YesNo => (v === 'yes' || v === 'no' ? v : '');

/** סינון לוח הקופות לפי פרמטרי הכתובת. משותף לדף ולייצוא לאקסל */
export function fundFilters(sp: Params) {
  const q = one(sp.q).trim();
  const fund = one(sp.fund);
  const idn = one(sp.idn);
  return {
    q,
    qDigits: q.replace(/\D/g, ''),
    fund: (fund in HEALTH_FUND_LABELS || fund === 'none' ? fund : '') as HealthFund | 'none' | '',
    plan: one(sp.plan),
    referral: yesNo(one(sp.referral)),
    sent: yesNo(one(sp.sent)),
    idn: (['ok', 'missing', 'invalid', 'not_ok'].includes(idn) ? idn : '') as IdState | 'not_ok' | '',
    branch: Number(one(sp.branch)) || null,
    assigned: yesNo(one(sp.assigned)),
    ready: one(sp.ready) === '1',
    // ברירת מחדל: כולם חוץ מלא פעילים (פעילים, מתלבטים וממתינים). "all" = כולם
    status: one(sp.status) as StudentStatus | 'all' | '',
  };
}
export type FundFilters = ReturnType<typeof fundFilters>;

export function filterFundStudents(all: All, f: FundFilters) {
  const assigned = new Set([...all.lessons.map((l) => l.student_id), ...all.enrollments.map((e) => e.student_id)]);
  const yn = (want: YesNo, v: boolean) => !want || (want === 'yes') === v;
  return all.students.filter((s) => {
    const ids = idState(s);
    return (f.status === 'all' || (f.status ? s.status === f.status : s.status !== 'inactive')) &&
      (!f.fund || (f.fund === 'none' ? !s.health_fund : s.health_fund === f.fund)) &&
      (!f.plan || (f.plan === '-' ? !s.health_plan : s.health_plan === f.plan)) &&
      yn(f.referral, s.has_referral) &&
      yn(f.sent, s.hmo_reported) &&
      (!f.idn || (f.idn === 'not_ok' ? ids !== 'ok' : ids === f.idn)) &&
      (!f.branch || s.branch_id === f.branch) &&
      yn(f.assigned, assigned.has(s.id)) &&
      (!f.ready || readyToSend(s)) &&
      (!f.q || fullName(s).includes(f.q) || s.id_number.includes(f.q) ||
        all.contacts.some((c) => c.student_id === s.id && ((f.qDigits !== '' && c.phone.replace(/\D/g, '').includes(f.qDigits)) || c.name.includes(f.q))));
  });
}
