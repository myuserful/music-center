import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ConfirmButton } from '@/components/ConfirmButton';
import { TaskFields } from '@/components/TaskFields';
import { BackLink, Flash, PageHead, type SP } from '@/components/ui';
import { deleteTask, saveTask } from '@/lib/actions/tasks';
import { DAYS, normAssignee, TASK_TYPE_ICONS, TASK_TYPE_LABELS } from '@/lib/constants';
import { getRole, getUserId } from '@/lib/roles';
import { createClient, type DB } from '@/lib/supabase/server';
import { defaultAssignee, loadTaskOptions } from '@/lib/taskData';
import { canDeleteTask, canSeeTask, typeOf } from '@/lib/tasks';
import { hhmm } from '@/lib/time';
import type { Contact, Lesson, Task, Teacher } from '@/lib/types';

const weekdayOf = (date: string) => new Date(`${date}T12:00:00Z`).getUTCDay();

/** מה שעוזר לטפל במשימה: טלפונים, והשיעורים שהיא נוגעת בהם */
async function loadContext(db: DB, task: Task) {
  const [contacts, teacher, lessons] = await Promise.all([
    task.student_id
      ? db.from('contacts').select('*').eq('student_id', task.student_id).order('is_primary', { ascending: false })
      : null,
    task.teacher_id ? db.from('teachers').select('id, phone').eq('id', task.teacher_id).maybeSingle() : null,
    // מורה לא מגיע/ה: כל השיעורים של המורה באותו יום בשבוע. תלמיד/ה: השיעורים של התלמיד/ה
    typeOf(task) === 'teacher_absent' && task.teacher_id && task.date_from
      ? db.from('lessons').select('*').eq('teacher_id', task.teacher_id).eq('weekday', weekdayOf(task.date_from)).order('start_time')
      : task.student_id
        ? db.from('lessons').select('*').eq('student_id', task.student_id).order('weekday')
        : null,
  ]);
  const lessonRows = (lessons?.data ?? []) as Lesson[];
  const ids = [...new Set(lessonRows.map((l) => l.student_id))];
  const { data: studs } = ids.length
    ? await db.from('students').select('id, first_name, last_name').in('id', ids)
    : { data: [] };
  const studentName = new Map((studs ?? []).map((s) => [s.id as number, `${s.first_name} ${s.last_name}`]));
  return {
    contacts: (contacts?.data ?? []) as Contact[],
    teacherPhone: (teacher?.data as Pick<Teacher, 'phone'> | null)?.phone ?? '',
    lessons: lessonRows.map((l) => ({ ...l, studentName: studentName.get(l.student_id) ?? '' })),
  };
}

export default async function TaskPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SP }) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const db = await createClient();
  const [{ data }, role, uid] = await Promise.all([
    db.from('tasks').select('*').eq('id', Number(id)).maybeSingle(), getRole(), getUserId(),
  ]);
  const task = data ? { ...(data as Task), assignee: normAssignee((data as Task).assignee) } : null;
  if (!task || !canSeeTask(task, role, uid)) notFound();
  const [options, assignee, ctx] = await Promise.all([loadTaskOptions(db), defaultAssignee(), loadContext(db, task)]);
  const type = typeOf(task);
  const student = options.students.find((s) => s.id === task.student_id);
  const teacher = options.teachers.find((t) => t.id === task.teacher_id);
  const hasContext = student || teacher || ctx.lessons.length > 0;

  return (
    <>
      <BackLink href="/tasks">לוח המשימות</BackLink>
      <PageHead title={task.title} sub={`${TASK_TYPE_ICONS[type]} ${TASK_TYPE_LABELS[type]}`} />
      <Flash sp={sp} />
      {hasContext && (
        <section className="card task-context">
          {student && (
            <p>
              <b>תלמיד/ה:</b> <Link href={`/students/${student.id}`}>{student.name}</Link>
              {ctx.contacts.filter((c) => c.phone).map((c) => (
                <span key={c.id} className="task-phone"> · {c.relation || c.name}: <a href={`tel:${c.phone}`}>{c.phone}</a></span>
              ))}
            </p>
          )}
          {teacher && (
            <p>
              <b>מורה:</b> <Link href={`/teachers/${teacher.id}`}>{teacher.name}</Link>
              {ctx.teacherPhone && <span className="task-phone"> · <a href={`tel:${ctx.teacherPhone}`}>{ctx.teacherPhone}</a></span>}
            </p>
          )}
          {ctx.lessons.length > 0 && (
            <>
              <b>{type === 'teacher_absent' && task.date_from
                ? `השיעורים של המורה ביום ${DAYS[weekdayOf(task.date_from)]} (צריך להודיע להם):`
                : 'השיעורים הקבועים:'}</b>
              <ul className="task-lessons">
                {ctx.lessons.map((l) => (
                  <li key={l.id}>
                    {l.at_home ? `בבית · ${l.home_slot}` : `${l.weekday != null ? DAYS[l.weekday] : ''} ${l.start_time ? hhmm(l.start_time) : ''}`}
                    {type === 'teacher_absent' && <> · <Link href={`/students/${l.student_id}`}>{l.studentName}</Link></>}
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      )}
      <form action={saveTask} className="card">
        <input type="hidden" name="id" value={task.id} />
        <input type="hidden" name="back" value={`/tasks/${task.id}`} />
        <TaskFields task={task} teachers={options.teachers} students={options.students} defaultAssignee={assignee} />
        <div className="form-foot"><button className="btn btn-primary">שמירה</button></div>
      </form>
      {canDeleteTask(task, role, uid) && (
        <form action={deleteTask}>
          <input type="hidden" name="id" value={task.id} />
          <ConfirmButton className="btn btn-danger" message={`למחוק את המשימה "${task.title}"?`}>מחיקת המשימה</ConfirmButton>
        </form>
      )}
    </>
  );
}
