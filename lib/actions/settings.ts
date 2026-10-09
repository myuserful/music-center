'use server';

import { redirect } from 'next/navigation';
import { createClient } from '../supabase/server';
import { dbMessage, done, fail, num, str } from './util';

const loginDomain = () => process.env.NEXT_PUBLIC_LOGIN_DOMAIN || 'staff.maktzev';

export async function login(fd: FormData) {
  const user = str(fd, 'username');
  const email = user.includes('@') ? user : `${user}@${loginDomain()}`;
  const db = await createClient();
  const { error } = await db.auth.signInWithPassword({ email, password: String(fd.get('password') ?? '') });
  if (error) fail('/login', 'שם משתמש או סיסמה שגויים');
  redirect('/');
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
