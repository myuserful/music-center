import 'server-only';
import { HEALTH_FUND_LABELS } from './constants';
import { mobilePhone } from './day';
import { fundIdNumber, fundPersonName, validIsraeliId, type FundFilters } from './funds';
import { pdfTableResponse } from './pdf';
import type { Contact, Student } from './types';

/**
 * קובץ PDF לשליחה לקופה: ת"ז, שם וטלפון. מי שאין לו ת"ז לא נכלל בקובץ.
 * במכבי, כשמולאו שם ות"ז על ההפניה - הם שנכתבים במקום הפרטים של התלמיד/ה
 */
export function idsPdf(students: Student[], contacts: Contact[], f: FundFilters): Promise<Response> {
  const fundName = f.fund && f.fund !== 'none' ? HEALTH_FUND_LABELS[f.fund] : '';
  // ת"ז תקינה תמיד ב-9 ספרות (שלא ייפול אפס מוביל). ת"ז שמופיעה פעמיים (רשומה כפולה) נכתבת פעם אחת
  const rows = new Map<string, Student>();
  for (const s of students) {
    const raw = fundIdNumber(s).replace(/[\s-]/g, '');
    if (!raw) continue;
    const id = validIsraeliId(raw) ? raw.padStart(9, '0') : raw;
    if (!rows.has(id)) rows.set(id, s);
  }
  return pdfTableResponse<[string, Student]>(fundName ? `ת"ז ל${fundName}` : 'ת"ז לקופות', [
    { header: 'ת"ז', width: 120, value: ([id]) => id },
    { header: 'שם', width: 140, value: ([, s]) => fundPersonName(s) },
    { header: 'טלפון', width: 120, value: ([, s]) => mobilePhone(contacts.filter((c) => c.student_id === s.id)) },
  ], [...rows], { numbered: false });
}
