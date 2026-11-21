'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useTransition } from 'react';
import { moveTask } from '@/lib/actions/tasks';
import {
  ASSIGNEE_LABELS, SCHEDULING_TASK_TYPES, TASK_STATUS_LABELS, TASK_STATUSES, TASK_TYPE_ICONS, TASK_TYPE_LABELS, TASK_TYPES,
  URGENCY_LABELS, type Assignee, type TaskStatus, type TaskType,
} from '@/lib/constants';
import {
  byPriority, dueLabel, FILTER_ASSIGNEES, inDateRange, isHot, matchesAssignee, taskDate, typeOf, urgencyOf,
} from '@/lib/tasks';
import { hhmm } from '@/lib/time';
import type { Task } from '@/lib/types';

const byPosition = (a: Task, b: Task) => a.position - b.position || a.id - b.id;

type SortMode = 'priority' | 'manual';
const SORT_KEY = 'tasks-sort';

/** תאריך + ימים (YYYY-MM-DD) */
function addDays(date: string, n: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** שמות לפי מזהה, להצגת המורה / התלמיד/ה בכרטיס */
export type TaskNames = { teachers: Record<number, string>; students: Record<number, string> };

export function TaskBoard({ tasks: initial, today, names }: { tasks: Task[]; today: string; names: TaskNames }) {
  const router = useRouter();
  const [tasks, setTasks] = useState(initial);
  const [dragId, setDragId] = useState<number | null>(null);
  const [over, setOver] = useState<{ status: TaskStatus; before: number | null } | null>(null);
  const [who, setWho] = useState<Assignee | ''>('');
  /** סוג, או "scheduling" לכל משימות השיבוץ */
  const [type, setType] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [sort, setSort] = useState<SortMode>('priority');
  const [error, setError] = useState('');
  const [, startTransition] = useTransition();

  useEffect(() => setTasks(initial), [initial]);
  useEffect(() => {
    try { if (localStorage.getItem(SORT_KEY) === 'manual') setSort('manual'); } catch { /* אין גישה לאחסון */ }
  }, []);
  function changeSort(mode: SortMode) {
    setSort(mode);
    try { localStorage.setItem(SORT_KEY, mode); } catch { /* אין גישה לאחסון */ }
  }

  const matchesType = (t: Task) =>
    !type || (type === 'scheduling' ? SCHEDULING_TASK_TYPES.includes(typeOf(t)) : typeOf(t) === type);
  const visible = tasks.filter((t) => matchesAssignee(t, who) && matchesType(t) && inDateRange(t, from, to));
  const filtered = !!(who || type || from || to);
  const range = (a: string, b: string) => { setFrom(a); setTo(b); };
  const option = (t: TaskType) => <option key={t} value={t}>{TASK_TYPE_ICONS[t]} {TASK_TYPE_LABELS[t]}</option>;
  // "הסתיים" תמיד בסדר הידני. בשאר העמודות: לפי עדיפות, או ידני
  const sortFor = (status: TaskStatus) => (sort === 'priority' && status !== 'done' ? byPriority(today) : byPosition);
  const manual = (status: TaskStatus) => sortFor(status) === byPosition;

  /** מעביר משימה לעמודה, לפני משימה מסוימת (או לסוף העמודה) */
  function place(id: number, status: TaskStatus, beforeId: number | null) {
    setDragId(null);
    setOver(null);
    if (id === beforeId) return;

    const column = tasks.filter((t) => t.status === status && t.id !== id).sort(byPosition);
    const idx = beforeId == null ? column.length : column.findIndex((t) => t.id === beforeId);
    const prev = column[idx - 1]?.position;
    const next = column[idx]?.position;
    const position =
      prev == null && next == null ? 0 :
      prev == null ? next! - 1 :
      next == null ? prev + 1 :
      (prev + next) / 2;

    const before = tasks;
    setTasks(tasks.map((t) => (t.id === id ? { ...t, status, position } : t)));
    setError('');
    startTransition(async () => {
      const res = await moveTask(id, status, position);
      if (!res.ok) {
        setTasks(before);
        setError(res.error);
      } else {
        router.refresh();
      }
    });
  }

  return (
    <>
      <div className="task-toolbar">
        <div className="task-who" role="group" aria-label="סינון לפי אחראי">
          <button type="button" className={`btn btn-xs ${who === '' ? 'btn-primary' : ''}`} onClick={() => setWho('')}>כולם</button>
          {FILTER_ASSIGNEES.map((a) => (
            <button key={a} type="button" className={`btn btn-xs ${who === a ? 'btn-primary' : ''}`} onClick={() => setWho(a)}>
              {ASSIGNEE_LABELS[a]}
            </button>
          ))}
        </div>
        <select value={type} onChange={(e) => setType(e.target.value)} aria-label="סינון לפי סוג">
          <option value="">כל הסוגים</option>
          <optgroup label="שיבוץ">
            <option value="scheduling">כל משימות השיבוץ</option>
            {SCHEDULING_TASK_TYPES.map(option)}
          </optgroup>
          <optgroup label="כללי">{TASK_TYPES.filter((t) => !SCHEDULING_TASK_TYPES.includes(t)).map(option)}</optgroup>
        </select>
        <div className="task-who" role="group" aria-label="סדר הכרטיסים">
          <button type="button" className={`btn btn-xs ${sort === 'priority' ? 'btn-primary' : ''}`} onClick={() => changeSort('priority')}
            title="הכי דחוף למעלה: לפי התאריך, הדחיפות והסוג">לפי עדיפות</button>
          <button type="button" className={`btn btn-xs ${sort === 'manual' ? 'btn-primary' : ''}`} onClick={() => changeSort('manual')}
            title="הסדר שקובעים בגרירה">סדר ידני</button>
        </div>
        {error && <span className="flash flash-error" role="alert">{error}</span>}
      </div>
      {/* טווח תאריכים: דד ליין או תאריכי השיבוץ (מיום / ליום) */}
      <div className="task-toolbar task-filters" role="group" aria-label="סינון לפי תאריכים">
        <label>מתאריך<input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
        <label>עד תאריך<input type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} /></label>
        <button type="button" className="btn btn-xs" onClick={() => range(today, today)}>היום</button>
        <button type="button" className="btn btn-xs" onClick={() => range(addDays(today, 1), addDays(today, 1))}>מחר</button>
        <button type="button" className="btn btn-xs" onClick={() => range(today, addDays(today, 6))}>7 הימים הקרובים</button>
        <button type="button" className="btn btn-xs" onClick={() => range('', addDays(today, -1))}>באיחור</button>
        {filtered && (
          <button type="button" className="btn btn-xs btn-ghost" onClick={() => { setWho(''); setType(''); range('', ''); }}>
            ניקוי הסינון ({visible.length} מתוך {tasks.length})
          </button>
        )}
      </div>

      <div className="kanban">
        {TASK_STATUSES.map((status) => {
          const column = visible.filter((t) => t.status === status).sort(sortFor(status));
          const isOver = over?.status === status;
          return (
            <section
              key={status}
              className={`kanban-col kanban-${status} ${isOver && over?.before == null ? 'over-end' : ''}`}
              onDragOver={(e) => {
                if (dragId == null) return;
                e.preventDefault();
                if (!manual(status) || e.target === e.currentTarget || !(e.target as HTMLElement).closest('.task-card')) {
                  setOver({ status, before: null });
                }
              }}
              onDrop={(e) => {
                e.preventDefault();
                if (dragId != null) place(dragId, status, over?.status === status ? over.before : null);
              }}
            >
              <header className="kanban-head">
                <h2>{TASK_STATUS_LABELS[status]}</h2>
                <span className="kanban-count">{column.length}</span>
              </header>
              <div className="kanban-cards">
                {column.length === 0 && <p className="empty">גוררים לכאן משימות</p>}
                {column.map((t) => {
                  const due = status === 'done' ? null : dueLabel(taskDate(t), today);
                  const tt = typeOf(t);
                  const urgency = urgencyOf(t);
                  const hot = isHot(t, today);
                  const people = [
                    t.student_id ? names.students[t.student_id] : null,
                    t.teacher_id ? names.teachers[t.teacher_id] : null,
                  ].filter(Boolean).join(' · ');
                  return (
                    <article
                      key={t.id}
                      className={`task-card ${hot ? 'task-hot' : ''} ${dragId === t.id ? 'dragging' : ''} ${isOver && over?.before === t.id ? 'drop-before' : ''}`}
                      draggable
                      onDragStart={(e) => { setDragId(t.id); e.dataTransfer.effectAllowed = 'move'; }}
                      onDragEnd={() => { setDragId(null); setOver(null); }}
                      onDragOver={(e) => {
                        if (dragId == null || !manual(status)) return;
                        e.preventDefault();
                        // חצי עליון: לפני הכרטיס. חצי תחתון: לפני הכרטיס הבא
                        const r = e.currentTarget.getBoundingClientRect();
                        const i = column.indexOf(t);
                        const before = e.clientY < r.top + r.height / 2 ? t.id : column[i + 1]?.id ?? null;
                        if (over?.status !== status || over.before !== before) setOver({ status, before });
                      }}
                    >
                      <div className="task-card-top">
                        <Link href={`/tasks/${t.id}`} className="task-title" draggable={false}>{t.title}</Link>
                        <span className={`badge task-who-${t.assignee}`}>{ASSIGNEE_LABELS[t.assignee]}</span>
                      </div>
                      {people && <p className="task-people">{people}</p>}
                      {t.description && <p className="task-desc">{t.description}</p>}
                      <div className="task-meta">
                        <span className={`badge task-type task-type-${tt}`}>{TASK_TYPE_ICONS[tt]} {TASK_TYPE_LABELS[tt]}</span>
                        {urgency !== 'normal' && <span className={`inquiry-urgency-tag urgency-${urgency}`}>{URGENCY_LABELS[urgency]}</span>}
                        {t.kind && <span className="badge badge-muted">{t.kind}</span>}
                        {due && <span className={`task-due ${due.cls}`}>⏰ {due.text}</span>}
                        {t.time_from && <span className="task-due">🕑 {hhmm(t.time_from)}{t.time_to ? `–${hhmm(t.time_to)}` : ''}</span>}
                      </div>
                      {/* העברה בלחיצה (גם בטלפון, בלי גרירה) */}
                      <div className="task-move">
                        {TASK_STATUSES.filter((s) => s !== status).map((s) => (
                          <button key={s} type="button" className="btn btn-xs btn-ghost"
                            onClick={() => place(t.id, s, null)}>
                            ← {TASK_STATUS_LABELS[s]}
                          </button>
                        ))}
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
    </>
  );
}
