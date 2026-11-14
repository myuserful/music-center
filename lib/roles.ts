import { cache } from 'react';
import { LOCAL_NO_AUTH } from './auth';
import { createClient } from './supabase/server';

export type Role = 'admin' | 'secretary' | 'teacher' | 'parent';

export const ROLE_LABELS: Record<Role, string> = {
  admin: 'מנהל',
  secretary: 'מזכירה',
  teacher: 'מורה',
  parent: 'הורה',
};

export const isStaff = (r: Role | null) => r === 'admin' || r === 'secretary';

/**
 * התפקיד של המשתמש המחובר (פעם אחת לכל בקשה).
 * בעבודה מקומית בלי התחברות: מנהל.
 * מחזיר null אם אין שורה ב-user_roles.
 */
export const getRole = cache(async (): Promise<Role | null> => {
  if (LOCAL_NO_AUTH) return 'admin';
  const db = await createClient();
  const { data: claims } = await db.auth.getClaims();
  const uid = claims?.claims.sub;
  if (!uid) return null;
  const { data, error } = await db.from('user_roles').select('role').eq('user_id', uid).maybeSingle();
  // עוד לא הריצו את 0063_roles.sql: כמו קודם, כל מחובר הוא מנהל (כדי לא לנעול את כולם בחוץ)
  if (error && (error.code === '42P01' || error.code === 'PGRST205')) return 'admin';
  return (data?.role as Role | undefined) ?? null;
});

export class ForbiddenError extends Error {
  constructor() {
    super('אין הרשאה לפעולה הזו');
  }
}

/** לפעולות שרת ול-route handlers: זורק אם התפקיד לא ברשימה */
export async function requireRole(...allowed: Role[]): Promise<Role> {
  const role = await getRole();
  if (!role || !allowed.includes(role)) throw new ForbiddenError();
  return role;
}
