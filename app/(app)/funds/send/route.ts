import type { NextRequest } from 'next/server';
import { loadAll } from '@/lib/data';
import { filterFundStudents, fundFilters } from '@/lib/funds';
import { idsPdf } from '@/lib/fundsPdf';
import { createClient } from '@/lib/supabase/server';

/**
 * שליחה לקופה: מוריד קובץ PDF עם תעודות הזהות של התלמידים לפי הסינון (כמו בלוח הקופות)
 * ומסמן את כולם כנשלחו. POST כי הפעולה משנה נתונים
 */
export async function POST(req: NextRequest) {
  const db = await createClient();
  const all = await loadAll(db);
  const f = fundFilters(Object.fromEntries(req.nextUrl.searchParams));
  const students = filterFundStudents(all, f);
  if (students.length === 0) return new Response('אין תלמידים ברשימה', { status: 404 });

  const file = await idsPdf(students, f);
  const { error } = await db.from('students').update({ hmo_reported: true }).in('id', students.map((s) => s.id));
  if (error) return new Response(error.message, { status: 500 });
  return file;
}
