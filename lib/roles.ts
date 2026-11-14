import { cache } from 'react';
import { LOCAL_NO_AUTH } from './auth';
import { ALL_PERMS, DEFAULT_SECRETARY } from './permissions';
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

/**
 * ההרשאות של המשתמש המחובר (פעם אחת לכל בקשה). מנהל: הכול.
 * עד שמריצים את 0064_role_permissions.sql, מזכירה מקבלת את ברירת המחדל.
 */
export const getPermissions = cache(async (): Promise<Set<string>> => {
  const role = await getRole();
  if (role === 'admin') return new Set(ALL_PERMS);
  if (role !== 'secretary') return new Set();
  const db = await createClient();
  const { data, error } = await db.from('role_permissions').select('perm').eq('role', role);
  if (error && (error.code === '42P01' || error.code === 'PGRST205')) return new Set(DEFAULT_SECRETARY);
  return new Set((data ?? []).map((r) => r.perm as string));
});

export const can = async (perm: string) => (await getPermissions()).has(perm);
