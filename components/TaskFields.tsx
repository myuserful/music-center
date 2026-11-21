'use client';

import { useState } from 'react';
import { DateCalendar } from '@/components/DateCalendar';
import {
  ASSIGNEE_LABELS, ASSIGNEES, SCHEDULING_TASK_TYPES, TASK_STATUS_LABELS, TASK_STATUSES, TASK_TYPE_ICONS, TASK_TYPE_LABELS,
  TASK_TYPES, URGENCIES, URGENCY_LABELS, type Assignee, type TaskType,
} from '@/lib/constants';
import { TASK_TYPE_FIELDS, typeOf, urgencyOf } from '@/lib/tasks';
import { hhmm } from '@/lib/time';
import type { Task } from '@/lib/types';

export type Option = { id: number; name: string };

/** שדות טופס משימה (חדשה או עריכה). השדות משתנים לפי סוג המשימה */
export function TaskFields({ task, teachers, students, defaultAssignee = 'management' }: {
  task?: Task; teachers: Option[]; students: Option[]; defaultAssignee?: Assignee;
}) {
  const [type, setType] = useState<TaskType>(task ? typeOf(task) : 'admin');
  const f = TASK_TYPE_FIELDS[type];
  const req = (need?: string) => need === 'required';
  const [dateFrom, setDateFrom] = useState(task?.date_from ?? '');
  const [dateTo, setDateTo] = useState(task?.date_to ?? '');
  const option = (t: TaskType) => <option key={t} value={t}>{TASK_TYPE_ICONS[t]} {TASK_TYPE_LABELS[t]}</option>;

  return (
    <div className="form-grid">
      <label>
        סוג המשימה
        <select name="task_type" value={type} onChange={(e) => setType(e.target.value as TaskType)}>
          <optgroup label="שיבוץ (הכי דחוף)">{SCHEDULING_TASK_TYPES.map(option)}</optgroup>
          <optgroup label="כללי">{TASK_TYPES.filter((t) => !SCHEDULING_TASK_TYPES.includes(t)).map(option)}</optgroup>
        </select>
        {f.hint && <span className="task-hint">{f.hint}</span>}
      </label>
      <label>
        דחיפות
        <select name="urgency" defaultValue={task ? urgencyOf(task) : 'normal'}>
          {URGENCIES.map((u) => <option key={u} value={u}>{URGENCY_LABELS[u]}</option>)}
        </select>
      </label>

      {f.student && (
        <label>
          תלמיד/ה{req(f.student) ? '' : ' (לא חובה)'}
          <select name="student_id" defaultValue={task?.student_id ?? ''} required={req(f.student)}>
            <option value="">בחירה…</option>
            {students.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </label>
      )}
      {f.teacher && (
        <label>
          מורה{req(f.teacher) ? '' : ' (לא חובה)'}
          <select name="teacher_id" defaultValue={task?.teacher_id ?? ''} required={req(f.teacher)}>
            <option value="">בחירה…</option>
            {teachers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </label>
      )}
      {/* תאריכי השיבוץ: לוח שנה פתוח. בהעברת שיעור: שני לוחות, מיום וליום */}
      {f.dateFrom && (
        <div className="wide task-cals">
          <DateCalendar name="date_from" label={f.dateFrom.label} value={dateFrom} onChange={setDateFrom}
            required={req(f.dateFrom.need)} mark={f.dateTo ? dateTo : undefined} markLabel={f.dateTo?.label} />
          {f.dateTo && (
            <DateCalendar name="date_to" label={f.dateTo.label} value={dateTo} onChange={setDateTo}
              required={req(f.dateTo.need)} mark={dateFrom} markLabel={f.dateFrom.label} />
          )}
        </div>
      )}
      {f.times && (
        <fieldset className="task-times">
          <legend>שעות (לא חובה: ריק = כל היום)</legend>
          <label>משעה<input type="time" name="time_from" defaultValue={task?.time_from ? hhmm(task.time_from) : ''} /></label>
          <label>עד שעה<input type="time" name="time_to" defaultValue={task?.time_to ? hhmm(task.time_to) : ''} /></label>
        </fieldset>
      )}
      {f.amount && (
        <label>סכום (לא חובה)<input type="number" name="amount" min="0" step="0.01" defaultValue={task?.amount ?? ''} /></label>
      )}

      <label className="wide">
        כותרת
        <input name="title" defaultValue={task?.title} required={type === 'admin'}
          placeholder={type === 'admin' ? '' : 'אפשר להשאיר ריק: הכותרת תיכתב לבד לפי הפרטים'} />
      </label>
      <label>דד ליין (לא חובה)<input type="date" name="due_date" defaultValue={task?.due_date ?? ''} /></label>
      <label>
        סטטוס
        <select name="status" defaultValue={task?.status ?? 'todo'}>
          {TASK_STATUSES.map((s) => <option key={s} value={s}>{TASK_STATUS_LABELS[s]}</option>)}
        </select>
      </label>
      <fieldset className="task-assignee">
        <legend>מי עושה?</legend>
        {ASSIGNEES.map((a) => (
          <label key={a} className="check">
            <input type="radio" name="assignee" value={a} defaultChecked={(task?.assignee ?? defaultAssignee) === a} />
            {ASSIGNEE_LABELS[a]}
          </label>
        ))}
      </fieldset>
      <label className="wide">הסבר על המשימה<textarea name="description" defaultValue={task?.description} /></label>
    </div>
  );
}
