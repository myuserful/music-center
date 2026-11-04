import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/** פתיחת הקבלה (או האסמכתא, עם file=proof): קישור זמני (5 דקות) לקובץ בתיקייה הפרטית */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const proof = req.nextUrl.searchParams.get('file') === 'proof';
  const db = await createClient();
  const { data } = await db.from('transactions').select('*').eq('id', Number(id)).maybeSingle();
  const path = proof ? data?.proof_path : data?.receipt_path;
  if (!path) return new Response(proof ? 'אין אסמכתא' : 'אין קבלה', { status: 404 });
  const { data: signed, error } = await db.storage.from('receipts').createSignedUrl(path, 300);
  if (error || !signed) return new Response(error?.message ?? 'שגיאה', { status: 500 });
  return NextResponse.redirect(signed.signedUrl);
}
