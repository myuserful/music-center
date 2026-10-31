import type { NextRequest } from 'next/server';
import { PAYMENT_METHOD_LABELS } from '@/lib/constants';
import { internalReceiptPdf } from '@/lib/receiptPdf';
import { createClient } from '@/lib/supabase/server';
import { fullName, type Payment, type Receipt, type Student } from '@/lib/types';

/** אישור קבלה פנימי ב-PDF (נוצר מחדש מהפרטים שנשמרו) */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = await createClient();
  const { data: r } = await db.from('receipts').select('*').eq('id', Number(id)).maybeSingle<Receipt>();
  if (!r || r.source !== 'internal') return new Response('הקבלה לא נמצאה', { status: 404 });
  const [{ data: p }, { data: s }] = await Promise.all([
    db.from('payments').select('*').eq('id', r.payment_id).single<Payment>(),
    db.from('students').select('*').eq('id', r.student_id).single<Student>(),
  ]);
  if (!p || !s) return new Response('התשלום לא נמצא', { status: 404 });
  return internalReceiptPdf({
    number: r.number, issuedOn: r.issued_on, customer: r.customer_name || fullName(s), studentName: fullName(s),
    amount: Number(r.amount), method: PAYMENT_METHOD_LABELS[p.method],
    reference: p.method === 'check' ? `צ'ק ${p.check_number}` : p.reference,
    description: r.description, deposit: r.kind === 'deposit',
  });
}
