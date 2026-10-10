'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useTransition } from 'react';
import { moveTask } from '@/lib/actions/tasks';
import { ASSIGNEE_LABELS, ASSIGNEES, TASK_STATUS_LABELS, TASK_STATUSES, type TaskStatus } from '@/lib/constants';
import type { Task } from '@/lib/types';

const byPosition = (a: Task, b: Task) => a.position - b.position || a.id - b.id;

function dueLabel(due: string | null, today: string) {
  if (!due) return null;
  const [y, m, d] = due.split('-');
  const text = `${d}/${m}/${y.slice(2)}`;
  if (due < today) return { text: `באיחור · ${text}`, cls: 'late' };
  if (due === today) return { text: `היום · ${text}`, cls: 'today' };
  return { text, cls: '' };
}

export function TaskBoard({ tasks: initial, today }: { tasks: Task[]; today: string }) {
  const router = useRouter();
  const [tasks, setTasks] = useState(initial);
  const [dragId, setDragId] = useState<number | null>(null);
  const [over, setOver] = useState<{ status: TaskStatus; before: number | null } | null>(null);
  const [who, setWho] = useState('');
  const [error, setError] = useState('');
  const [, startTransition] = useTransition();

  useEffect(() => setTasks(initial), [initial]);

  const visible = tasks.filter((t) => !who || t.assignee === who || t.assignee === 'both');

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
          {ASSIGNEES.filter((a) => a !== 'both').map((a) => (
            <button key={a} type="button" className={`btn btn-xs ${who === a ? 'btn-primary' : ''}`} onClick={() => setWho(a)}>
              {ASSIGNEE_LABELS[a]}
            </button>
          ))}
        </div>
        {error && <span className="flash flash-error" role="alert">{error}</span>}
      </div>

      <div className="kanban">
        {TASK_STATUSES.map((status) => {
          const column = visible.filter((t) => t.status === status).sort(byPosition);
          const isOver = over?.status === status;
          return (
            <section
              key={status}
              className={`kanban-col kanban-${status} ${isOver && over?.before == null ? 'over-end' : ''}`}
              onDragOver={(e) => {
                if (dragId == null) return;
                e.preventDefault();
                if (e.target === e.currentTarget || !(e.target as HTMLElement).closest('.task-card')) {
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
                  const due = status === 'done' ? null : dueLabel(t.due_date, today);
                  return (
                    <article
                      key={t.id}
                      className={`task-card ${dragId === t.id ? 'dragging' : ''} ${isOver && over?.before === t.id ? 'drop-before' : ''}`}
                      draggable
                      onDragStart={(e) => { setDragId(t.id); e.dataTransfer.effectAllowed = 'move'; }}
                      onDragEnd={() => { setDragId(null); setOver(null); }}
                      onDragOver={(e) => {
                        if (dragId == null) return;
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
                      {t.description && <p className="task-desc">{t.description}</p>}
                      {(t.kind || due) && (
                        <div className="task-meta">
                          {t.kind && <span className="badge badge-muted">{t.kind}</span>}
                          {due && <span className={`task-due ${due.cls}`}>⏰ {due.text}</span>}
                        </div>
                      )}
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
