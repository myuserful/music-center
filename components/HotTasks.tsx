import Link from 'next/link';
import { ASSIGNEE_LABELS, TASK_TYPE_ICONS, TASK_TYPE_LABELS } from '@/lib/constants';
import { byPriority, dueLabel, isHot, taskDate, typeOf } from '@/lib/tasks';
import type { Task } from '@/lib/types';

/** משימות שקופצות במסך הראשי: באיחור, היום, עד יומיים, או דחופות בלי תאריך */
export function HotTasks({ tasks, today }: { tasks: Task[]; today: string }) {
  const hot = tasks.filter((t) => isHot(t, today)).sort(byPriority(today));
  if (hot.length === 0) return null;
  const shown = hot.slice(0, 8);
  return (
    <section className="card hot-tasks" aria-label="משימות דחופות">
      <div className="dash-head">
        <h2>⚡ משימות שצריך לטפל בהן עכשיו ({hot.length})</h2>
        <Link href="/tasks" className="btn btn-xs">ללוח המשימות</Link>
      </div>
      <ul className="hot-list">
        {shown.map((t) => {
          const due = dueLabel(taskDate(t), today);
          const type = typeOf(t);
          return (
            <li key={t.id} className={`hot-item ${due?.cls ?? ''}`}>
              <span className="hot-icon" title={TASK_TYPE_LABELS[type]}>{TASK_TYPE_ICONS[type]}</span>
              <Link href={`/tasks/${t.id}`} className="hot-title">{t.title}</Link>
              {t.urgency === 'high' && <span className="inquiry-urgency-tag urgency-high">דחוף</span>}
              <span className={`badge task-who-${t.assignee}`}>{ASSIGNEE_LABELS[t.assignee]}</span>
              {due && <span className={`task-due ${due.cls}`}>{due.text}</span>}
            </li>
          );
        })}
      </ul>
      {hot.length > shown.length && <Link href="/tasks" className="muted">ועוד {hot.length - shown.length}…</Link>}
    </section>
  );
}
