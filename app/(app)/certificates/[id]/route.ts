import type { NextRequest } from 'next/server';
import { receiptPdf } from '@/lib/receiptPdf';
import { createClient } from '@/lib/supabase/server';
import type { ReceiptCertificate } from '@/lib/types';

/** הורדה חוזרת של אישור קבלה לקופה, מהפרטים שנשמרו כשהופק */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = await createClient();
  const { data: c } = await db.from('receipt_certificates').select('*').eq('id', Number(id)).maybeSingle<ReceiptCertificate>();
  if (!c) return new Response('הקבלה לא נמצאה', { status: 404 });
  return receiptPdf({
    name: c.name, idNumber: c.id_number, gender: c.gender, amount: Number(c.amount), dates: c.dates,
    number: c.number, issuedOn: c.issued_on, field: c.field,
  });
}
