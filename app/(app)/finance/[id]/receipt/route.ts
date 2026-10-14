import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/** פתיחת הקבלה: קישור זמני (5 דקות) לקובץ בתיקייה הפרטית */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = await createClient();
  const { data } = await db.from('transactions').select('receipt_path').eq('id', Number(id)).maybeSingle();
  if (!data?.receipt_path) return new Response('אין קבלה', { status: 404 });
  const { data: signed, error } = await db.storage.from('receipts').createSignedUrl(data.receipt_path, 300);
  if (error || !signed) return new Response(error?.message ?? 'שגיאה', { status: 500 });
  return NextResponse.redirect(signed.signedUrl);
}
