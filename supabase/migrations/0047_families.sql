-- אחים: כל תלמיד/ה משויך/ת למשפחה. אחים = אותה משפחה.
-- sibling_rejections: זוגות שסימנו "לא אחים", כדי שההצעה (לפי טלפון משותף) לא תחזור.
-- להרצה אחרי 0046. אפשר להריץ שוב בלי נזק.

create table if not exists families (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now()
);
alter table students add column if not exists family_id bigint references families(id) on delete set null;
create index if not exists students_family on students (family_id);

create table if not exists sibling_rejections (
  student_a bigint not null references students(id) on delete cascade,
  student_b bigint not null references students(id) on delete cascade,
  primary key (student_a, student_b),
  check (student_a < student_b)
);

alter table families enable row level security;
alter table sibling_rejections enable row level security;
drop policy if exists staff_all on families;
drop policy if exists staff_all on sibling_rejections;
create policy staff_all on families for all to authenticated using (true) with check (true);
create policy staff_all on sibling_rejections for all to authenticated using (true) with check (true);
