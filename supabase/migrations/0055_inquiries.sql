-- טלפונים לבירורים: נכנסים ידנית מכרטיס התלמיד/ה, עם סיבה ורמת דחיפות.
-- מחליף את לוח "אישור שיבוץ" (העמודות call_state וכו' בטבלת students כבר לא בשימוש, הנתונים נשארים בהן).
-- להרצה אחרי 0054. אפשר להריץ שוב בלי נזק.

create table if not exists inquiries (
  id bigint generated always as identity primary key,
  student_id bigint not null references students(id) on delete cascade,
  reason text not null check (length(trim(reason)) > 0),
  urgency text not null default 'normal' check (urgency in ('low', 'normal', 'high')),
  -- to_call = צריך להתקשר, no_answer = לא ענו, undecided = ענו - מתלבטים, done = טופל
  status text not null default 'to_call' check (status in ('to_call', 'no_answer', 'undecided', 'done')),
  attempts integer not null default 0,
  last_call_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists inquiries_student on inquiries (student_id);

alter table inquiries enable row level security;
drop policy if exists staff_all on inquiries;
create policy staff_all on inquiries for all to authenticated using (true) with check (true);
