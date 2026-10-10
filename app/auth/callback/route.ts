import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/** לכאן מגיעים מהקישור במייל: מחליפים את הקוד בסשן ונכנסים */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');

  if (code) {
    const db = await createClient();
    const { error } = await db.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${origin}/`);
  }

  const msg = 'הקישור לא תקין או שפג תוקפו. יש לבקש קישור חדש באותו דפדפן.';
  return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent(msg)}`);
}
