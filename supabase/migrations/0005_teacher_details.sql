-- מורים: מין, בנים עד גיל 9, מחיר לשעה, מעוניינת, ימים בשבוע, שפה, וסניפים (רבים-לרבים)
alter table teachers
  add column gender text check (gender in ('male', 'female')),
  add column teaches_young_boys boolean not null default false,
  add column hourly_rate numeric(7, 2) check (hourly_rate >= 0),
  add column interest text check (interest in ('yes', 'no', 'maybe', 'follow_up')),
  add column days_per_week smallint check (days_per_week between 1 and 6),
  add column languages text not null default '';

create table teacher_branches (
  teacher_id bigint not null references teachers(id) on delete cascade,
  branch_id bigint not null references branches(id) on delete cascade,
  primary key (teacher_id, branch_id)
);

alter table teacher_branches enable row level security;
create policy staff_all on teacher_branches for all to authenticated using (true) with check (true);
