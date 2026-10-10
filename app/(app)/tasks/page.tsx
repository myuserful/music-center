import { Flash, PageHead, type SP } from '@/components/ui';
import { TaskBoard } from '@/components/TaskBoard';
import { TaskFields } from '@/components/TaskFields';
import { saveTask } from '@/lib/actions/tasks';
import { createClient } from '@/lib/supabase/server';
import type { Task } from '@/lib/types';

export default async function TasksPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const db = await createClient();
  const { data, error } = await db.from('tasks').select('*').order('position');
  const tasks = (data ?? []) as Task[];
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' });

  return (
    <>
      <PageHead title="משימות" sub="גוררים כרטיס בין העמודות כדי לעדכן סטטוס. לחיצה על הכותרת פותחת לעריכה." />
      <Flash sp={sp} />
      {error && <div className="flash flash-error" role="alert">לא ניתן לטעון משימות: {error.message}. האם הורץ הקובץ supabase/migrations/0010_tasks.sql?</div>}
      <details className="card task-new">
        <summary className="btn btn-primary">+ משימה חדשה</summary>
        <form action={saveTask}>
          <TaskFields />
          <div className="form-foot"><button className="btn btn-primary">הוספת משימה</button></div>
        </form>
      </details>
      <TaskBoard tasks={tasks} today={today} />
    </>
  );
}
