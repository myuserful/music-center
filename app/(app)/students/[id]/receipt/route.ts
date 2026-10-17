import type { NextRequest } from 'next/server';
import { activityDates } from '@/lib/activityDays';
import { isoDate } from '@/lib/age';
import { receiptPdf } from '@/lib/receiptPdf';
import { createClient } from '@/lib/supabase/server';
import { fullName, type Student } from '@/lib/types';

const ISO = /^\d{4}-\d{2}-\d{2}$/;

/** אישור קבלה לתלמיד/ה: סכום, ימי הפעילות ומספר הפעילויות. התאריכים מחושבים מלוח מועדי הפעילות */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const q = req.nextUrl.searchParams;
  const amount = Number(q.get('amount'));
  const count = Math.floor(Number(q.get('count')));
  const days = q.getAll('day').map(Number).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6);
  const from = q.get('from') ?? '';
  if (!(amount > 0) || !(count > 0) || count > 200 || days.length === 0 || !ISO.test(from)) {
    return new Response('חסרים פרטים: סכום, מספר פעילויות, יום פעילות ותאריך התחלה', { status: 400 });
  }

  const db = await createClient();
  const { data: s } = await db.from('students').select('*').eq('id', Number(id)).maybeSingle<Student>();
  if (!s) return new Response('התלמיד/ה לא נמצא/ה', { status: 404 });

  const dates = activityDates(days, from, count);
  if (dates.length < count) {
    return new Response(`אחרי ${from.split('-').reverse().join('/')} יש רק ${dates.length} ימי פעילות בימים שנבחרו`, { status: 400 });
  }
  const issuedOn = q.get('date') ?? '';
  return receiptPdf({
    name: fullName(s), idNumber: s.id_number.trim(), amount, dates,
    number: q.get('number')?.trim() ?? '', issuedOn: ISO.test(issuedOn) ? issuedOn : isoDate(new Date()),
  });
}
