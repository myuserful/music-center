'use server';

import { revalidatePath } from 'next/cache';
import {
  ASSIGNEES, TASK_STATUSES, TASK_TYPE_LABELS, TASK_TYPES, URGENCIES, type TaskStatus, type TaskType,
} from '../constants';
import { can, getRole, getUserId } from '../roles';
import { createClient, type DB } from '../supabase/server';
import { canDeleteTask, canSeeTask, missingField, TASK_TYPE_FIELDS } from '../tasks';
import type { Task } from '../types';
import { backTo, dbMessage, done, fail, num, oneOf, requirePerm, str } from './util';

const HOME = '/tasks';

/** המשימה, רק אם המשתמש מורשה לראות אותה (ה-RLS אוכף גם הוא, חוץ מעבודה מקומית) */
async function visibleTask(db: DB, id: number): Promise<Task | null> {
  const { data } = await db.from('tasks').select('*').eq('id', id).maybeSingle();
  const task = data as Task | null;
  if (!task) return null;
  return canSeeTask(task, await getRole(), await getUserId()) ? task : null;
}

const shortDate = (d: string) => d.split('-').reverse().slice(0, 2).join('/');

/** כותרת אוטומטית למשימה מסוג מסוים, כשלא כתבו כותרת */
async function autoTitle(
  db: DB, type: TaskType, v: { teacher_id: number | null; student_id: number | null; date_from: string | null; date_to: string | null },
): Promise<string> {
  const parts: string[] = [TASK_TYPE_LABELS[type]];
  if (v.student_id) {
    const { data } = await db.from('students').select('first_name, last_name').eq('id', v.student_id).maybeSingle();
    if (data) parts.push(`${data.first_name} ${data.last_name}`);
  }
  if (v.teacher_id) {
    const { data } = await db.from('teachers').select('first_name, last_name').eq('id', v.teacher_id).maybeSingle();
    if (data) parts.push(`${data.first_name} ${data.last_name}`);
  }
  let title = parts.join(' · ');
  if (v.date_from && v.date_to) title += ` (${shortDate(v.date_from)} ← ${shortDate(v.date_to)})`;
  else if (v.date_from) title += ` (${shortDate(v.date_from)})`;
  return title;
}

export async function saveTask(fd: FormData) {
  const id = num(fd, 'id');
  const here = backTo(fd, HOME);
  await requirePerm('tasks', here);
  const db = await createClient();

  const type = oneOf(str(fd, 'task_type'), TASK_TYPES) ?? 'admin';
  const f = TASK_TYPE_FIELDS[type];
  // שדות שלא שייכים לסוג מתנקים (למשל כשמחליפים סוג בעריכה)
  const fields = {
    teacher_id: f.teacher ? num(fd, 'teacher_id') : null,
    student_id: f.student ? num(fd, 'student_id') : null,
    date_from: f.dateFrom ? str(fd, 'date_from') || null : null,
    date_to: f.dateTo ? str(fd, 'date_to') || null : null,
    time_from: f.times ? str(fd, 'time_from') || null : null,
    time_to: f.times ? str(fd, 'time_to') || null : null,
    amount: f.amount ? num(fd, 'amount') : null,
  };
  const missing = missingField(type, fields);
  if (missing) fail(here, missing);

  let title = str(fd, 'title');
  if (!title && type !== 'admin') title = await autoTitle(db, type, fields);
  if (!title) fail(here, 'חסרה כותרת למשימה');

  const row = {
    title,
    due_date: str(fd, 'due_date') || null,
    description: str(fd, 'description'),
    assignee: oneOf(str(fd, 'assignee'), ASSIGNEES) ?? 'both',
    status: oneOf(str(fd, 'status'), TASK_STATUSES) ?? 'todo',
    task_type: type,
    urgency: oneOf(str(fd, 'urgency'), URGENCIES) ?? 'normal',
    ...fields,
  };

  if (id) {
    if (!(await visibleTask(db, id))) fail(HOME, 'המשימה לא נמצאה');
    const { error } = await db.from('tasks').update(row).eq('id', id);
    if (error) fail(here, dbMessage(error));
    done(HOME, 'המשימה עודכנה');
  }
  // משימה חדשה נכנסת לראש העמודה (בסדר הידני)
  const { data: first } = await db.from('tasks').select('position')
    .eq('status', row.status).order('position').limit(1).maybeSingle();
  const uid = await getUserId();
  const { error } = await db.from('tasks').insert({
    ...row, position: (first?.position ?? 1) - 1, ...(uid ? { created_by: uid } : {}),
  });
  if (error) fail(here, dbMessage(error));
  done(HOME, 'המשימה נוספה');
}

export async function deleteTask(fd: FormData) {
  await requirePerm('tasks', HOME);
  const db = await createClient();
  const id = num(fd, 'id')!;
  const task = await visibleTask(db, id);
  if (!task) fail(HOME, 'המשימה לא נמצאה');
  if (!canDeleteTask(task!, await getRole(), await getUserId())) fail(`${HOME}/${id}`, 'אפשר למחוק רק משימה שפתחת');
  const { error } = await db.from('tasks').delete().eq('id', id);
  if (error) fail(HOME, dbMessage(error));
  done(HOME, 'המשימה נמחקה');
}

/** הזזה בלוח: עמודה חדשה ומיקום (מספר בין שתי המשימות השכנות) */
export async function moveTask(
  id: number, status: TaskStatus, position: number,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!TASK_STATUSES.includes(status)) return { ok: false, error: 'סטטוס לא תקין' };
  if (!(await can('tasks'))) return { ok: false, error: 'אין לך הרשאה לפעולה הזו' };
  const db = await createClient();
  if (!(await visibleTask(db, id))) return { ok: false, error: 'המשימה לא נמצאה' };
  const { error } = await db.from('tasks').update({ status, position }).eq('id', id);
  if (error) return { ok: false, error: dbMessage(error) };
  revalidatePath(HOME);
  revalidatePath('/');
  return { ok: true };
}
