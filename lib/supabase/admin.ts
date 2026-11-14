import { createClient } from '@supabase/supabase-js';

/**
 * גישה עם המפתח הסודי, לניהול משתמשים בלבד (רשימת משתמשים, יצירת חשבון).
 * רק בשרת, ורק אחרי בדיקה שהמשתמש המחובר הוא מנהל.
 * מחזיר null אם SUPABASE_SECRET_KEY לא מוגדר (למשל ב-Vercel).
 */
export function createAdminClient() {
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!secret) return null;
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, secret, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
