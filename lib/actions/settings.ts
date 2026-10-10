'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { createClient } from '../supabase/server';
import { dbMessage, done, fail, num, str } from './util';

/** כניסה בקישור למייל. רק משתמשות שהוגדרו ב-Supabase יכולות להיכנס. */
export async function login(fd: FormData) {
  const email = str(fd, 'email').toLowerCase();
  if (!email.includes('@')) fail('/login', 'יש להזין כתובת מייל');

  const h = await headers();
  const origin = h.get('origin') ?? `${h.get('x-forwarded-proto') ?? 'https'}://${h.get('host')}`;
  const db = await createClient();
  const { error } = await db.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: false, emailRedirectTo: `${origin}/auth/callback` },
  });
  if (error) {
    if (/signups not allowed|not found/i.test(error.message)) fail('/login', 'המייל הזה לא רשום במערכת');
    if (/rate limit|security purposes/i.test(error.message))
      fail('/login', 'נשלחו יותר מדי מיילים. נסי שוב בעוד כמה דקות.');
    fail('/login', `שגיאה בשליחת המייל: ${error.message}`);
  }
  done('/login', 'שלחנו לך קישור כניסה למייל. פתחי אותו בדפדפן הזה.');
}

export async function logout() {
  const db = await createClient();
  await db.auth.signOut();
  redirect('/login');
}

// ---- סניפים וחדרים ----

export async function saveBranch(fd: FormData) {
  const db = await createClient();
  const id = num(fd, 'id');
  const row = { name: str(fd, 'name'), address: str(fd, 'address') };
  if (!row.name) fail('/branches', 'חסר שם סניף');
  const { error } = id
    ? await db.from('branches').update(row).eq('id', id)
    : await db.from('branches').insert(row);
  if (error) fail('/branches', dbMessage(error));
  done('/branches');
}

export async function deleteBranch(fd: FormData) {
  const db = await createClient();
  const { error } = await db.from('branches').delete().eq('id', num(fd, 'id')!);
  if (error) fail('/branches', dbMessage(error));
  done('/branches', 'נמחק');
}

export async function saveRoom(fd: FormData) {
  const db = await createClient();
  const id = num(fd, 'id');
  const name = str(fd, 'name');
  if (!name) fail('/branches', 'חסר שם חדר');
  const { error } = id
    ? await db.from('rooms').update({ name }).eq('id', id)
    : await db.from('rooms').insert({ name, branch_id: num(fd, 'branch_id') });
  if (error) fail('/branches', dbMessage(error));
  done('/branches');
}

export async function deleteRoom(fd: FormData) {
  const db = await createClient();
  const { error } = await db.from('rooms').delete().eq('id', num(fd, 'id')!);
  if (error) fail('/branches', dbMessage(error));
  done('/branches', 'נמחק');
}

// ---- כלי נגינה ----

export async function saveInstrument(fd: FormData) {
  const db = await createClient();
  const id = num(fd, 'id');
  const name = str(fd, 'name');
  if (!name) fail('/instruments', 'חסר שם כלי');
  const { error } = id
    ? await db.from('instruments').update({ name }).eq('id', id)
    : await db.from('instruments').insert({ name });
  if (error) fail('/instruments', dbMessage(error));
  done('/instruments');
}

export async function deleteInstrument(fd: FormData) {
  const db = await createClient();
  const { error } = await db.from('instruments').delete().eq('id', num(fd, 'id')!);
  if (error) fail('/instruments', dbMessage(error));
  done('/instruments', 'נמחק');
}
