-- חיובי שיעורים שנמחקו ביד מדף התלמיד/ה: חיוב מחדש של היום לא יוצר אותם שוב.
-- להרצה אחרי 0056. אפשר להריץ שוב בלי נזק.

create table if not exists waived_charges (
  teacher_id bigint not null references teachers(id) on delete cascade,
  lesson_date date not null,
  student_id bigint not null references students(id) on delete cascade,
  kind text not null,
  created_at timestamptz not null default now(),
  primary key (teacher_id, lesson_date, student_id, kind)
);
create index if not exists waived_charges_student on waived_charges (student_id);

alter table waived_charges enable row level security;
drop policy if exists staff_all on waived_charges;
create policy staff_all on waived_charges for all to authenticated using (true) with check (true);
