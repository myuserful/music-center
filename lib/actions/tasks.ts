'use server';

import { revalidatePath } from 'next/cache';
import { ASSIGNEES, TASK_STATUSES, type TaskStatus } from '../constants';
import { createClient } from '../supabase/server';
import { backTo, dbMessage, done, fail, num, oneOf, str } from './util';

export async function saveTask(fd: FormData) {
  const db = await createClient();
  const id = num(fd, 'id');
  const here = backTo(fd, '/tasks');
  const row = {
    title: str(fd, 'title'),
    due_date: str(fd, 'due_date') || null,
    kind: str(fd, 'kind'),
    description: str(fd, 'description'),
    assignee: oneOf(str(fd, 'assignee'), ASSIGNEES) ?? 'both',
    status: oneOf(str(fd, 'status'), TASK_STATUSES) ?? 'todo',
  };
  if (!row.title) fail(here, 'חסרה כותרת למשימה');

  if (id) {
    const { error } = await db.from('tasks').update(row).eq('id', id);
    if (error) fail(here, dbMessage(error));
    done('/tasks', 'המשימה עודכנה');
  }
  // משימה חדשה נכנסת לראש העמודה
  const { data: first } = await db.from('tasks').select('position')
    .eq('status', row.status).order('position').limit(1).maybeSingle();
  const { error } = await db.from('tasks').insert({ ...row, position: (first?.position ?? 1) - 1 });
  if (error) fail(here, dbMessage(error));
  done('/tasks', 'המשימה נוספה');
}

export async function deleteTask(fd: FormData) {
  const db = await createClient();
  const { error } = await db.from('tasks').delete().eq('id', num(fd, 'id')!);
  if (error) fail('/tasks', dbMessage(error));
  done('/tasks', 'המשימה נמחקה');
}

/** הזזה בלוח: עמודה חדשה ומיקום (מספר בין שתי המשימות השכנות) */
export async function moveTask(
  id: number, status: TaskStatus, position: number,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!TASK_STATUSES.includes(status)) return { ok: false, error: 'סטטוס לא תקין' };
  const db = await createClient();
  const { error } = await db.from('tasks').update({ status, position }).eq('id', id);
  if (error) return { ok: false, error: dbMessage(error) };
  revalidatePath('/tasks');
  return { ok: true };
}
