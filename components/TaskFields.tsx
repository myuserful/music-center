import { ASSIGNEE_LABELS, ASSIGNEES, TASK_KINDS, TASK_STATUS_LABELS, TASK_STATUSES } from '@/lib/constants';
import type { Task } from '@/lib/types';

/** שדות טופס משימה (חדשה או עריכה) */
export function TaskFields({ task }: { task?: Task }) {
  return (
    <div className="form-grid">
      <label className="wide">כותרת<input name="title" defaultValue={task?.title} required autoFocus={!task} /></label>
      <label>דד ליין<input type="date" name="due_date" defaultValue={task?.due_date ?? ''} /></label>
      <label>
        אופי המשימה
        <input name="kind" list="task-kinds" defaultValue={task?.kind} placeholder="בחירה או הקלדה" />
        <datalist id="task-kinds">{TASK_KINDS.map((k) => <option key={k} value={k} />)}</datalist>
      </label>
      <fieldset className="task-assignee">
        <legend>מי עושה?</legend>
        {ASSIGNEES.map((a) => (
          <label key={a} className="check">
            <input type="radio" name="assignee" value={a} defaultChecked={(task?.assignee ?? 'both') === a} />
            {ASSIGNEE_LABELS[a]}
          </label>
        ))}
      </fieldset>
      <label>
        סטטוס
        <select name="status" defaultValue={task?.status ?? 'todo'}>
          {TASK_STATUSES.map((s) => <option key={s} value={s}>{TASK_STATUS_LABELS[s]}</option>)}
        </select>
      </label>
      <label className="wide">הסבר על המשימה<textarea name="description" defaultValue={task?.description} /></label>
    </div>
  );
}
