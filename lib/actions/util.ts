import { redirect } from 'next/navigation';
import { STATUSES, type Status } from '../constants';

export const str = (fd: FormData, k: string) => String(fd.get(k) ?? '').trim();

export function num(fd: FormData, k: string): number | null {
  const v = str(fd, k);
  return v === '' || Number.isNaN(Number(v)) ? null : Number(v);
}

/** ערך מתוך רשימה סגורה, אחרת null */
export const oneOf = <T extends string>(v: string, options: T[]): T | null =>
  (options as string[]).includes(v) ? (v as T) : null;

export function status(fd: FormData): Status {
  const s = str(fd, 'status') as Status;
  return STATUSES.includes(s) ? s : 'pending';
}

/** לאן לחזור אחרי הפעולה (רק נתיב פנימי) */
export function backTo(fd: FormData, fallback: string): string {
  const b = str(fd, 'back');
  return b.startsWith('/') && !b.startsWith('//') ? b : fallback;
}

function withMsg(path: string, kind: 'error' | 'ok', msg: string): string {
  const u = new URL(path, 'http://local');
  u.searchParams.delete('error');
  u.searchParams.delete('ok');
  u.searchParams.set(kind, msg);
  return u.pathname + u.search;
}

export const fail = (path: string, msg: string): never => redirect(withMsg(path, 'error', msg));
export const done = (path: string, msg = 'נשמר'): never => redirect(withMsg(path, 'ok', msg));

/** תרגום שגיאות מסד נתונים לעברית */
export function dbMessage(e: { code?: string; message: string }): string {
  if (e.code === '23505') return 'קיימת כבר רשומה זהה (או התנגשות בשיבוץ)';
  if (e.code === '23503') return 'לא ניתן למחוק: יש רשומות שמקושרות לזה';
  if (e.code === '23514') return 'ערך לא תקין';
  return e.message;
}
