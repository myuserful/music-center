import { RECEIPT_FIELD_LABELS, type ReceiptField } from './constants';
import type { Student } from './types';

/** השם ות"ז שעל ההפניה, אם מולאו שניהם. לפני 0056 השדות לא קיימים */
export function referralHolder(s: Pick<Student, 'referral_name' | 'referral_id_number'>) {
  const name = s.referral_name?.trim(), idNumber = s.referral_id_number?.trim();
  return name && idNumber ? { name, idNumber } : null;
}

const MONTHS = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];

/** "א, ב וג" */
const andList = (items: string[]) => (items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} ו${items.at(-1)}`);

/**
 * החודשים של תאריכי הקבלה: "אוקטובר 2026", "ספטמבר ואוקטובר 2026", "דצמבר 2026 וינואר 2027".
 * באותה שנה - השנה פעם אחת בסוף
 */
export function receiptMonths(dates: string[]): string {
  const months = [...new Set(dates.map((d) => d.slice(0, 7)))].sort();
  if (!months.length) return '';
  const name = (m: string) => MONTHS[Number(m.slice(5, 7)) - 1];
  const years = new Set(months.map((m) => m.slice(0, 4)));
  if (years.size === 1) return `${andList(months.map(name))} ${months[0].slice(0, 4)}`;
  return andList(months.map((m) => `${name(m)} ${m.slice(0, 4)}`));
}

/** הנושא והגוף המוצעים למייל עם אישור הקבלה למכבי (אפשר לערוך לפני השליחה) */
export function receiptMail({ name, dates, field }: { name: string; dates: string[]; field: ReceiptField }) {
  const months = receiptMonths(dates);
  const plural = new Set(dates.map((d) => d.slice(0, 7))).size > 1;
  return {
    subject: `קבלה עבור מכבי${months ? ` - ${months}` : ''} - ${name}`,
    body: [
      'שלום רב,',
      '',
      `מצורפת קבלה עבור מכבי על ${dates.length} טיפולים ב${RECEIPT_FIELD_LABELS[field]} של ${name}${months ? ` ${plural ? 'בחודשים' : 'בחודש'} ${months}` : ''}.`,
      'אפשר להגיש אותה למכבי לקבלת ההחזר.',
      '',
      'לכל שאלה אנחנו כאן.',
      '',
      'בברכה,',
      'מקצב',
    ].join('\n'),
  };
}
