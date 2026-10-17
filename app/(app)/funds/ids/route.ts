import type { NextRequest } from 'next/server';
import { loadAll } from '@/lib/data';
import { filterFundStudents, fundFilters } from '@/lib/funds';
import { idsPdf } from '@/lib/fundsPdf';
import { createClient } from '@/lib/supabase/server';

/** הורדת PDF עם תעודות הזהות לפי הסינון בלוח הקופות, בלי לשנות כלום */
export async function GET(req: NextRequest) {
  const all = await loadAll(await createClient());
  const f = fundFilters(Object.fromEntries(req.nextUrl.searchParams));
  return idsPdf(filterFundStudents(all, f), f);
}
