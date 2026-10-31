-- טלפונים להורים לפי נושא (למשל "פרטים חסרים"), בנפרד מטלפוני אישור השיבוץ.
-- call_followups: איפה עומדת השיחה לכל תלמיד/ה בכל נושא. call_log: היסטוריית השיחות.
-- להרצה אחרי 0044. אפשר להריץ שוב בלי נזק.

create table if not exists call_followups (
  student_id bigint not null references students(id) on delete cascade,
  topic text not null,
  -- to_call = צריך להתקשר, no_answer = לא ענו, waiting = ענו, מחכים שישלחו
  state text not null default 'to_call' check (state in ('to_call', 'no_answer', 'waiting')),
  attempts integer not null default 0,
  last_call_at timestamptz,
  note text not null default '',
  primary key (student_id, topic)
);

create table if not exists call_log (
  id bigint generated always as identity primary key,
  student_id bigint not null references students(id) on delete cascade,
  topic text not null,
  outcome text not null check (outcome in ('no_answer', 'answered')),
  note text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists call_log_student on call_log (student_id, created_at desc);

alter table call_followups enable row level security;
alter table call_log enable row level security;
drop policy if exists staff_all on call_followups;
drop policy if exists staff_all on call_log;
create policy staff_all on call_followups for all to authenticated using (true) with check (true);
create policy staff_all on call_log for all to authenticated using (true) with check (true);
