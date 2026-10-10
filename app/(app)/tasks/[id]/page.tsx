import { notFound } from 'next/navigation';
import { ConfirmButton } from '@/components/ConfirmButton';
import { TaskFields } from '@/components/TaskFields';
import { BackLink, Flash, PageHead, type SP } from '@/components/ui';
import { deleteTask, saveTask } from '@/lib/actions/tasks';
import { createClient } from '@/lib/supabase/server';
import type { Task } from '@/lib/types';

export default async function TaskPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SP }) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const db = await createClient();
  const { data } = await db.from('tasks').select('*').eq('id', Number(id)).maybeSingle();
  const task = data as Task | null;
  if (!task) notFound();

  return (
    <>
      <BackLink href="/tasks">לוח המשימות</BackLink>
      <PageHead title={task.title} />
      <Flash sp={sp} />
      <form action={saveTask} className="card">
        <input type="hidden" name="id" value={task.id} />
        <input type="hidden" name="back" value={`/tasks/${task.id}`} />
        <TaskFields task={task} />
        <div className="form-foot"><button className="btn btn-primary">שמירה</button></div>
      </form>
      <form action={deleteTask}>
        <input type="hidden" name="id" value={task.id} />
        <ConfirmButton className="btn btn-danger" message={`למחוק את המשימה "${task.title}"?`}>מחיקת המשימה</ConfirmButton>
      </form>
    </>
  );
}
