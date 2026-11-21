-- משימות: סוגים עם שדות משלהם, דחיפות, מזכירה כאחראית, והרשאות.
-- מזכירה רואה משימות שהוקצו למזכירה ומשימות שהיא פתחה. מנהל רואה הכול.
-- להריץ אחרי 0064_role_permissions.sql.

-- אחראי: גם מזכירה
alter table tasks drop constraint if exists tasks_assignee_check;
alter table tasks add constraint tasks_assignee_check
  check (assignee in ('yanky', 'shevi', 'both', 'secretary'));

-- סוג המשימה (משימות קיימות: מנהלית)
alter table tasks add column if not exists task_type text not null default 'admin';
alter table tasks drop constraint if exists tasks_task_type_check;
alter table tasks add constraint tasks_task_type_check check (task_type in (
  'admin', 'schedule_change', 'teacher_absent', 'student_move', 'student_absent',
  'notify_parents', 'call_teacher', 'payment', 'health_fund', 'makeup_lesson'
));

-- דחיפות (כמו בטלפונים להורים)
alter table tasks add column if not exists urgency text not null default 'normal';
alter table tasks drop constraint if exists tasks_urgency_check;
alter table tasks add constraint tasks_urgency_check check (urgency in ('low', 'normal', 'high'));

-- השדות של הסוגים. date_from: התאריך של האירוע (או "מיום"), date_to: "ליום"
alter table tasks add column if not exists teacher_id bigint references teachers(id) on delete set null;
alter table tasks add column if not exists student_id bigint references students(id) on delete set null;
alter table tasks add column if not exists date_from date;
alter table tasks add column if not exists date_to date;
alter table tasks add column if not exists time_from time;
alter table tasks add column if not exists time_to time;
alter table tasks add column if not exists amount numeric(10, 2);

-- מי פתח (כדי שמזכירה תראה משימות שפתחה למנהלים)
alter table tasks add column if not exists created_by uuid default auth.uid() references auth.users(id) on delete set null;

create index if not exists tasks_student_idx on tasks (student_id);
create index if not exists tasks_teacher_idx on tasks (teacher_id);

-- הרשאות
drop policy if exists staff_all on tasks;
drop policy if exists tasks_select on tasks;
drop policy if exists tasks_insert on tasks;
drop policy if exists tasks_update on tasks;
drop policy if exists tasks_delete on tasks;

create policy tasks_select on tasks for select to authenticated using (
  is_admin() or (can('tasks') and (assignee = 'secretary' or created_by = auth.uid()))
);
create policy tasks_insert on tasks for insert to authenticated with check (
  is_admin() or (can('tasks') and created_by = auth.uid())
);
-- מזכירה מעדכנת משימות שהיא רואה (ואפשר להעביר משימה למנהלים)
create policy tasks_update on tasks for update to authenticated
  using (is_admin() or (can('tasks') and (assignee = 'secretary' or created_by = auth.uid())))
  with check (is_admin() or can('tasks'));
-- מזכירה מוחקת רק משימות שפתחה
create policy tasks_delete on tasks for delete to authenticated using (
  is_admin() or (can('tasks') and created_by = auth.uid())
);
