import type { NextRequest } from 'next/server';
import { isoDate } from '@/lib/age';
import { account } from '@/lib/billing';
import { attendedDates } from '@/lib/day';
import { loadBilling, loadHistory, loadReceipts } from '@/lib/data';
import type { ReceiptField } from '@/lib/constants';
import { receiptPdf } from '@/lib/receiptPdf';
import { createClient } from '@/lib/supabase/server';
import { fullName, type Student } from '@/lib/types';

const ISO = /^\d{4}-\d{2}-\d{2}$/;

/**
 * אישור קבלה לתלמיד/ה (לקופה, למשל מכבי): סכום, מספר הטיפולים ותאריכיהם.
 * source=lessons: התאריכים הם השיעורים שהתלמיד/ה הגיע/ה אליהם בפועל (ימים סגורים) בין from ל-to,
 * והסכום הוא מחיר מכבי המלא לכל שיעור. אחרת: ידני, התאריכים נשלחים מהטופס (d), כל תאריך שנבחר.
 * כל קבלה נשמרת ב-receipt_certificates, ומורידים אותה שוב מ-/certificates/[id]
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const fd = await req.formData();
  const q = { get: (k: string) => (fd.has(k) ? String(fd.get(k)) : null), getAll: (k: string) => fd.getAll(k).map(String) };
  const from = q.get('from') ?? '';
  const db = await createClient();
  const { data: s } = await db.from('students').select('*').eq('id', Number(id)).maybeSingle<Student>();
  if (!s) return new Response('התלמיד/ה לא נמצא/ה', { status: 404 });

  let dates: string[];
  let amount = Number(q.get('amount'));
  let number = q.get('number')?.trim() ?? '';
  if (q.get('source') === 'lessons') {
    const to = q.get('to') ?? '';
    if (!ISO.test(from) || !ISO.test(to)) return new Response('חסר טווח תאריכים', { status: 400 });
    const [history, billing, receipts] = await Promise.all([loadHistory(db, { student: s.id }), loadBilling(db, s.id), loadReceipts(db, s.id)]);
    dates = attendedDates(history.lessons, history.closures).filter((d) => d >= from && d <= to);
    if (!dates.length) return new Response('אין שיעורים שהתלמיד/ה הגיע/ה אליהם בתאריכים האלה (בימים סגורים)', { status: 400 });
    if (!(amount > 0)) amount = dates.length * Number(billing.settings.price_maccabi_full);
    // בלי מספר: מספרי הקבלות של התשלומים ששילמו את השיעורים האלה
    if (!number) {
      const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' });
      const paidBy = new Set(account(billing.charges, billing.payments, today).lines
        .filter((l) => dates.includes(l.charge.lesson_date) && l.charge.kind !== 'manual')
        .flatMap((l) => l.paidBy.map((x) => x.paymentId)));
      number = [...new Set(receipts.receipts.filter((r) => paidBy.has(r.payment_id)).map((r) => r.number).filter(Boolean))]
        .sort((a, b) => Number(a) - Number(b)).join(', ');
    }
  } else {
    dates = [...new Set(q.getAll('d').filter((d) => ISO.test(d)))].sort();
    if (!(amount > 0) || dates.length === 0 || dates.length > 200) {
      return new Response('חסרים פרטים: סכום ולפחות תאריך פעילות אחד', { status: 400 });
    }
  }

  const date = q.get('date') ?? '';
  const issuedOn = ISO.test(date) ? date : isoDate(new Date());
  const name = fullName(s), idNumber = s.id_number.trim();
  const field: ReceiptField = q.get('field') === 'art' ? 'art' : 'expression';
  // שמירה להורדה חוזרת. אם הטבלה עוד לא קיימת (0048) - הקבלה בכל זאת נוצרת
  const row = {
    student_id: s.id, name, id_number: idNumber, gender: s.gender, amount, dates, number, issued_on: issuedOn,
    source: q.get('source') === 'lessons' ? 'lessons' : 'manual',
  };
  let { error } = await db.from('receipt_certificates').insert({ ...row, field });
  // לפני 0050 אין עמודת תחום: שומרים בלעדיה (ההורדה החוזרת תהיה "הבעה ויצירה")
  if (error && /field/.test(error.message)) ({ error } = await db.from('receipt_certificates').insert(row));
  if (error) console.error('receipt_certificates:', error.message);
  return receiptPdf({ name, idNumber, gender: s.gender, amount, dates, number, issuedOn, field });
}
