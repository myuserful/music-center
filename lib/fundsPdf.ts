import 'server-only';
import { HEALTH_FUND_LABELS } from './constants';
import { mobilePhone } from './day';
import { validIsraeliId, type FundFilters } from './funds';
import { pdfTableResponse } from './pdf';
import type { Contact, Student } from './types';

/** קובץ PDF לשליחה לקופה: ת"ז, שם פרטי וטלפון. מי שאין לו ת"ז לא נכלל בקובץ */
export function idsPdf(students: Student[], contacts: Contact[], f: FundFilters): Promise<Response> {
  const fundName = f.fund && f.fund !== 'none' ? HEALTH_FUND_LABELS[f.fund] : '';
  // ת"ז תקינה תמיד ב-9 ספרות (שלא ייפול אפס מוביל). ת"ז שמופיעה פעמיים (רשומה כפולה) נכתבת פעם אחת
  const rows = new Map<string, Student>();
  for (const s of students) {
    const raw = s.id_number.replace(/[\s-]/g, '');
    if (!raw) continue;
    const id = validIsraeliId(raw) ? raw.padStart(9, '0') : raw;
    if (!rows.has(id)) rows.set(id, s);
  }
  return pdfTableResponse<[string, Student]>(fundName ? `ת"ז ל${fundName}` : 'ת"ז לקופות', [
    { header: 'ת"ז', width: 120, value: ([id]) => id },
    { header: 'שם פרטי', width: 140, value: ([, s]) => s.first_name },
    { header: 'טלפון', width: 120, value: ([, s]) => mobilePhone(contacts.filter((c) => c.student_id === s.id)) },
  ], [...rows], { numbered: false });
}
