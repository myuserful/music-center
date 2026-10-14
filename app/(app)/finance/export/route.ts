import type { NextRequest } from 'next/server';
import { TX_KIND_LABELS } from '@/lib/constants';
import { loadAll, loadBilling } from '@/lib/data';
import { xlsxResponse } from '@/lib/export';
import { buildEntries, type Entry } from '@/lib/finance';
import { createClient } from '@/lib/supabase/server';
import { fullName, type Transaction } from '@/lib/types';

/** כל ההכנסות וההוצאות של שנה לאקסל (לרואה החשבון) */
export async function GET(req: NextRequest) {
  const db = await createClient();
  const year = /^\d{4}$/.test(req.nextUrl.searchParams.get('year') ?? '')
    ? req.nextUrl.searchParams.get('year')!
    : new Date().toISOString().slice(0, 4);
  const [all, billing, { data, error }] = await Promise.all([
    loadAll(db), loadBilling(db), db.from('transactions').select('*'),
  ]);
  if (error) return new Response(error.message, { status: 500 });
  const transactions = (data ?? []) as Transaction[];
  const manual = new Map(transactions.map((t) => [t.id, t]));
  const entries = buildEntries(transactions, billing.payments, billing.charges, (id) => fullName(all.maps.student.get(id)))
    .filter((e) => e.date.startsWith(`${year}-`))
    .sort((a, b) => a.date.localeCompare(b.date));
  const tx = (e: Entry) => (e.source === 'manual' ? manual.get(e.id) : undefined);

  return xlsxResponse<Entry>(`הכנסות והוצאות ${year}`, [
    { header: 'תאריך', width: 12, value: (e) => e.date.split('-').reverse().join('/') },
    { header: 'סוג', width: 9, value: (e) => TX_KIND_LABELS[e.kind] },
    { header: 'קטגוריה', width: 20, value: (e) => e.category },
    { header: 'ממי / למי', width: 22, value: (e) => e.label },
    { header: 'אמצעי תשלום', width: 14, value: (e) => e.method },
    { header: 'אסמכתא', width: 14, value: (e) => tx(e)?.reference ?? '' },
    { header: 'הכנסה', width: 12, value: (e) => (e.kind === 'income' ? e.amount : null) },
    { header: 'הוצאה', width: 12, value: (e) => (e.kind === 'expense' ? e.amount : null) },
    { header: 'קבלה', width: 10, value: (e) => (tx(e)?.receipt_path ? 'יש' : '') },
    { header: 'הערות', width: 30, value: (e) => tx(e)?.notes ?? '' },
  ], entries);
}
