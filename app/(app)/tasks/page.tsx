import { Flash, PageHead, type SP } from '@/components/ui';
import { TaskBoard, type TaskNames } from '@/components/TaskBoard';
import { TaskFields } from '@/components/TaskFields';
import { saveTask } from '@/lib/actions/tasks';
import { createClient } from '@/lib/supabase/server';
import { defaultAssignee, loadTaskOptions, loadTasks } from '@/lib/taskData';

export default async function TasksPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const db = await createClient();
  const [{ tasks, error }, options, assignee] = await Promise.all([loadTasks(db), loadTaskOptions(db), defaultAssignee()]);
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' });
  const names: TaskNames = {
    teachers: Object.fromEntries(options.teachers.map((t) => [t.id, t.name])),
    students: Object.fromEntries(options.students.map((s) => [s.id, s.name])),
  };
  const oldDb = tasks.length > 0 && tasks[0].task_type === undefined;

  return (
    <>
      <PageHead title="משימות" sub="הכי דחוף למעלה: לפי התאריך, הדחיפות והסוג. גוררים כרטיס בין העמודות כדי לעדכן סטטוס." />
      <Flash sp={sp} />
      {error && <div className="flash flash-error" role="alert">לא ניתן לטעון משימות: {error.message}</div>}
      {oldDb && (
        <div className="flash flash-error" role="alert">
          כדי לשמור סוגי משימות צריך להריץ ב-Supabase את הקובץ supabase/migrations/0065_task_types.sql
        </div>
      )}
      <details className="card task-new">
        <summary className="btn btn-primary">+ משימה חדשה</summary>
        <form action={saveTask}>
          <TaskFields teachers={options.teachers} students={options.students} defaultAssignee={assignee} />
          <div className="form-foot"><button className="btn btn-primary">הוספת משימה</button></div>
        </form>
      </details>
      <TaskBoard tasks={tasks} today={today} names={names} />
    </>
  );
}
