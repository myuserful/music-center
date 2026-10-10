-- משימות צוות: לוח ממתין / בעבודה / הסתיים
create table tasks (
  id bigint generated always as identity primary key,
  title text not null,
  due_date date,
  kind text not null default '',
  description text not null default '',
  assignee text not null default 'both' check (assignee in ('yanky', 'shevi', 'both')),
  status text not null default 'todo' check (status in ('todo', 'doing', 'done')),
  position double precision not null default 0,
  created_at timestamptz not null default now()
);

alter table tasks enable row level security;
create policy staff_all on tasks for all to authenticated using (true) with check (true);
