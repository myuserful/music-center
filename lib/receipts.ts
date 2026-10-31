import 'server-only';
import { account, planReceipts, receiptDates } from './billing';
import { mobilePhone } from './day';
import { sumitCreateReceipt } from './sumit';
import type { DB } from './supabase/server';
import { fullName, type Charge, type Contact, type Payment, type Receipt, type Student } from './types';

const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' });

/** הלקוח בקבלה: ההורה (איש הקשר הראשי), ואם אין - התלמיד/ה */
export function receiptCustomer(s: Student, contacts: Contact[]) {
  const parent = contacts.find((c) => c.is_primary && c.name.trim()) ?? contacts.find((c) => c.name.trim());
  return {
    externalId: parent ? `maktzev-contact-${parent.id}` : `maktzev-student-${s.id}`,
    name: parent?.name.trim() || fullName(s),
    phone: mobilePhone(contacts),
    email: parent?.email || contacts.find((c) => c.email)?.email || '',
  };
}

/**
 * מפיק ב-SUMIT את הקבלות של תשלום (על שם ההורה) ושומר אותן. במכבי: קבלה על השיעורים וקבלה נפרדת על ההשלמה.
 * זורק שגיאה בעברית אם לא הצליח. אם קבלה אחת הופקה והשנייה נכשלה - הראשונה כבר שמורה
 */
export async function issueSumitReceipts(db: DB, paymentId: number, email: boolean): Promise<Receipt[]> {
  const { data: p, error } = await db.from('payments').select('*').eq('id', paymentId).single<Payment>();
  if (error || !p) throw new Error('התשלום לא נמצא');
  if (p.refund) throw new Error('על החזר לא מפיקים קבלה');
  const [{ data: existing, error: re }, { data: s }, { data: contacts }, { data: charges }, { data: payments }] = await Promise.all([
    db.from('receipts').select('number').eq('payment_id', p.id),
    db.from('students').select('*').eq('id', p.student_id).single<Student>(),
    db.from('contacts').select('*').eq('student_id', p.student_id),
    db.from('lesson_charges').select('*').eq('student_id', p.student_id),
    db.from('payments').select('*').eq('student_id', p.student_id),
  ]);
  if (re) throw new Error(re.code === '42P01' || re.code === 'PGRST205' ? 'צריך להריץ את 0042_sumit_receipts.sql ב-Supabase' : re.message);
  if (existing?.length) throw new Error(`לתשלום הזה כבר יש קבלה (${existing.map((r) => r.number).join(', ')})`);
  if (!s) throw new Error('התלמיד/ה לא נמצא/ה');

  const customer = receiptCustomer(s, (contacts ?? []) as Contact[]);
  const lines = account((charges ?? []) as Charge[], (payments ?? []) as Payment[], today()).lines;
  const saved: Receipt[] = [];
  for (const plan of planReceipts(lines, p, fullName(s))) {
    let r: Awaited<ReturnType<typeof sumitCreateReceipt>>;
    try {
      r = await sumitCreateReceipt({
        customer, description: plan.description, date: p.paid_on, amount: plan.amount, method: p.method,
        reference: p.reference, check: { number: p.check_number, date: p.check_date }, email,
      });
    } catch (e) {
      const done = saved.length ? ` (קבלה ${saved.map((x) => x.number).join(', ')} כבר הופקה)` : '';
      throw new Error(`${(e as Error).message}${done}`);
    }
    const row = {
      payment_id: p.id, student_id: s.id, kind: plan.kind, number: r.number, url: r.url, sumit_document_id: r.documentId,
      amount: plan.amount, customer_name: customer.name, description: plan.description, issued_on: p.paid_on, source: 'sumit',
    };
    const { data, error: e } = await db.from('receipts').insert(row).select('*').single<Receipt>();
    // הקבלה כבר נוצרה ב-SUMIT: חשוב לא לאבד את המספר
    if (e || !data) throw new Error(`קבלה ${r.number} הופקה ב-SUMIT אבל לא נשמרה כאן: ${e?.message}. צריך להקליד את המספר ביד`);
    saved.push(data);
  }
  return saved;
}

/**
 * אישור קבלה פנימי (לא ב-SUMIT, לא קבלה לצורכי מס): למשל על פיקדון.
 * מספור רץ משלו. פיקדון = התשלום כיסה פיקדונות, או שהתלמיד/ה במסלול פיקדון
 */
export async function issueInternalReceipt(db: DB, paymentId: number): Promise<Receipt> {
  const { data: p, error } = await db.from('payments').select('*').eq('id', paymentId).single<Payment>();
  if (error || !p) throw new Error('התשלום לא נמצא');
  if (p.refund) throw new Error('על החזר לא מפיקים קבלה');
  const [{ data: existing, error: re }, { data: s }, { data: contacts }, { data: charges }, { data: payments }] = await Promise.all([
    db.from('receipts').select('number').eq('payment_id', p.id),
    db.from('students').select('*').eq('id', p.student_id).single<Student>(),
    db.from('contacts').select('*').eq('student_id', p.student_id),
    db.from('lesson_charges').select('*').eq('student_id', p.student_id),
    db.from('payments').select('*').eq('student_id', p.student_id),
  ]);
  if (re) throw new Error(re.code === '42P01' || re.code === 'PGRST205' ? 'צריך להריץ את 0042_sumit_receipts.sql ב-Supabase' : re.message);
  if (existing?.length) throw new Error(`לתשלום הזה כבר יש קבלה (${existing.map((r) => r.number).join(', ')})`);
  if (!s) throw new Error('התלמיד/ה לא נמצא/ה');

  const lines = account((charges ?? []) as Charge[], (payments ?? []) as Payment[], today()).lines;
  const covered = lines.filter((l) => l.paidBy.some((x) => x.paymentId === p.id));
  const deposit = covered.some((l) => l.charge.kind === 'deposit') || s.payment_track === 'fund_deposit';
  const dates = receiptDates(covered.filter((l) => l.charge.kind !== 'manual').map((l) => l.charge.lesson_date));
  const description = deposit
    ? (dates ? `פיקדון עבור שיעורים בתאריכים ${dates}` : 'פיקדון עבור שיעורים')
    : (dates ? `שכר לימוד עבור שיעורים בתאריכים ${dates}` : 'תשלום מראש עבור שיעורים');

  const { data: n, error: ne } = await db.rpc('next_internal_receipt_number');
  if (ne) throw new Error(ne.code === 'PGRST202' ? 'צריך להריץ שוב את 0042_sumit_receipts.sql ב-Supabase (הגרסה המעודכנת)' : ne.message);
  const { data, error: e } = await db.from('receipts').insert({
    payment_id: p.id, student_id: s.id, kind: deposit ? 'deposit' : 'lesson', source: 'internal', number: String(n),
    amount: p.amount, customer_name: receiptCustomer(s, (contacts ?? []) as Contact[]).name, description, issued_on: p.paid_on,
  }).select('*').single<Receipt>();
  if (e || !data) throw new Error(e?.message ?? 'הקבלה לא נשמרה');
  return data;
}
