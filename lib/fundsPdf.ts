import 'server-only';
import { HEALTH_FUND_LABELS } from './constants';
import { validIsraeliId, type FundFilters } from './funds';
import { pdfTableResponse } from './pdf';
import type { Student } from './types';

/** קובץ PDF עם תעודות הזהות בלבד (לשליחה לקופה). מי שאין לו ת"ז לא נכלל בקובץ */
export function idsPdf(students: Student[], f: FundFilters): Promise<Response> {
  const fundName = f.fund && f.fund !== 'none' ? HEALTH_FUND_LABELS[f.fund] : '';
  // ת"ז תקינה תמיד ב-9 ספרות (שלא ייפול אפס מוביל). ת"ז שמופיעה פעמיים (רשומה כפולה) נכתבת פעם אחת
  const ids = [...new Set(students.map((s) => s.id_number.replace(/[\s-]/g, '')).filter(Boolean)
    .map((id) => (validIsraeliId(id) ? id.padStart(9, '0') : id)))];
  return pdfTableResponse<string>(fundName ? `ת"ז ל${fundName}` : 'ת"ז לקופות', [
    { header: 'ת"ז', width: 120, value: (id) => id },
  ], ids, { numbered: false });
}
