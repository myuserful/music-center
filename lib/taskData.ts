import { normAssignee, type Assignee } from './constants';
import { getRole, getUserId } from './roles';
import type { DB } from './supabase/server';
import type { Task } from './types';

/**
 * המשימות שהמשתמש רואה. מנהל: הכול. מזכירה: של מזכירה ומה שפתחה.
 * (ה-RLS ב-0065 אוכף את אותו כלל במסד; כאן גם לעבודה מקומית ולפני שהורצה המיגרציה)
 */
export async function loadTasks(db: DB, opts: { openOnly?: boolean } = {}) {
  const role = await getRole();
  if (role !== 'admin' && role !== 'secretary') return { tasks: [] as Task[], error: null };
  let q = db.from('tasks').select('*');
  if (role === 'secretary') {
    const uid = await getUserId();
    q = uid ? q.or(`assignee.eq.secretary,created_by.eq.${uid}`) : q.eq('assignee', 'secretary');
  }
  if (opts.openOnly) q = q.neq('status', 'done');
  const { data, error } = await q.order('position');
  // לפני 0066: יענקי / שבי / שניהם
  const tasks = ((data ?? []) as Task[]).map((t) => ({ ...t, assignee: normAssignee(t.assignee) }));
  return { tasks, error };
}

/** ברירת המחדל של "מי עושה?" במשימה חדשה */
export async function defaultAssignee(): Promise<Assignee> {
  return (await getRole()) === 'secretary' ? 'secretary' : 'management';
}

/** רשימות לבחירה בטופס: מורים ותלמידים */
export async function loadTaskOptions(db: DB) {
  const [t, s] = await Promise.all([
    db.from('teachers').select('id, first_name, last_name, active').order('first_name'),
    db.from('students').select('id, first_name, last_name, status').order('first_name'),
  ]);
  const name = (x: { first_name: string; last_name: string }) => `${x.first_name} ${x.last_name}`.trim();
  return {
    // מורים שלא פעילים בסוף (כדי שמשימה ישנה עדיין תראה את המורה שלה)
    teachers: [...(t.data ?? [])].sort((a, b) => Number(b.active) - Number(a.active))
      .map((x) => ({ id: x.id as number, name: name(x) + (x.active ? '' : ' (לא פעיל/ה)') })),
    students: (s.data ?? []).map((x) => ({
      id: x.id as number, name: name(x) + (x.status === 'inactive' ? ' (לא פעיל/ה)' : ''),
    })),
  };
}
