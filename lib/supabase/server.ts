import { createServerClient } from '@supabase/ssr';
import { createClient as createPlainClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { LOCAL_NO_AUTH } from '../auth';

async function createUserClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
          } catch {
            // נקרא מתוך Server Component - ה-middleware מרענן את הסשן
          }
        },
      },
    },
  );
}

export type DB = Awaited<ReturnType<typeof createUserClient>>;

export async function createClient(): Promise<DB> {
  if (!LOCAL_NO_AUTH) return createUserClient();

  // עבודה מקומית בלי התחברות: השרת ניגש עם המפתח הסודי (לא נשלח לדפדפן)
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!secret) {
    throw new Error('חסר SUPABASE_SECRET_KEY בקובץ .env.local (נדרש כש-AUTH_DISABLED=true)');
  }
  return createPlainClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, secret, {
    auth: { persistSession: false, autoRefreshToken: false },
  }) as unknown as DB;
}
