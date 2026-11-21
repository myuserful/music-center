'use server';

import { getRole, getUserId, isStaff } from '../roles';
import { createClient } from '../supabase/server';
import { dbMessage } from './util';

export type ChatMessage = {
  id: number;
  body: string;
  urgent: boolean;
  sender_role: 'admin' | 'secretary';
  sender_id: string | null;
  created_at: string;
  read_at: string | null;
  handled_at: string | null;
};

export type ChatState =
  | { ok: true; messages: ChatMessage[]; me: 'admin' | 'secretary'; uid: string | null }
  | { ok: false; error: string };

const MISSING = ['42P01', 'PGRST205'];
const MISSING_MSG = "צריך להריץ את 0068_staff_chat.sql ב-Supabase כדי להפעיל את הצ'אט";
type Result = { ok: true } | { ok: false; error: string };

async function staffRole(): Promise<'admin' | 'secretary' | null> {
  const role = await getRole();
  return isStaff(role) ? (role as 'admin' | 'secretary') : null;
}

/** 150 ההודעות האחרונות, מהישנה לחדשה */
export async function loadChat(): Promise<ChatState> {
  const me = await staffRole();
  if (!me) return { ok: false, error: 'אין הרשאה' };
  const db = await createClient();
  const { data, error } = await db.from('staff_messages').select('*')
    .order('created_at', { ascending: false }).limit(150);
  if (error) return { ok: false, error: MISSING.includes(error.code) ? MISSING_MSG : dbMessage(error) };
  return { ok: true, messages: (data as ChatMessage[]).reverse(), me, uid: await getUserId() };
}

export async function sendChatMessage(body: string, urgent: boolean): Promise<Result> {
  const me = await staffRole();
  if (!me) return { ok: false, error: 'אין הרשאה' };
  const text = body.trim().slice(0, 4000);
  if (!text) return { ok: false, error: 'ההודעה ריקה' };
  const db = await createClient();
  const uid = await getUserId();
  const { error } = await db.from('staff_messages').insert({
    body: text, urgent, sender_role: me, ...(uid ? { sender_id: uid } : {}),
  });
  if (error) return { ok: false, error: MISSING.includes(error.code) ? MISSING_MSG : dbMessage(error) };
  return { ok: true };
}

/** פתחו את הצ'אט: כל מה שהצד השני שלח מסומן כנקרא */
export async function markChatRead(): Promise<Result> {
  const me = await staffRole();
  if (!me) return { ok: false, error: 'אין הרשאה' };
  const db = await createClient();
  const { error } = await db.from('staff_messages').update({ read_at: new Date().toISOString() })
    .neq('sender_role', me).is('read_at', null);
  if (error) return { ok: false, error: dbMessage(error) };
  return { ok: true };
}

/** הודעה דחופה: טופל / החזרה לדחוף */
export async function setChatHandled(id: number, handled: boolean): Promise<Result> {
  if (!(await staffRole())) return { ok: false, error: 'אין הרשאה' };
  const db = await createClient();
  const { error } = await db.from('staff_messages')
    .update({ handled_at: handled ? new Date().toISOString() : null }).eq('id', id);
  if (error) return { ok: false, error: dbMessage(error) };
  return { ok: true };
}

export async function deleteChatMessage(id: number): Promise<Result> {
  const me = await staffRole();
  if (!me) return { ok: false, error: 'אין הרשאה' };
  const db = await createClient();
  let q = db.from('staff_messages').delete().eq('id', id);
  // מזכירה מוחקת רק את ההודעות שלה (גם ה-RLS אוכף)
  if (me !== 'admin') q = q.eq('sender_role', me);
  const { error } = await q;
  if (error) return { ok: false, error: dbMessage(error) };
  return { ok: true };
}
