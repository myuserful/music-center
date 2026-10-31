-- אישורי קבלה לקופות (מכבי וכו') שהופקו מכרטיס התלמיד/ה: נשמרים כדי שאפשר יהיה להוריד אותם שוב.
-- נשמר כל מה שמודפס (שם, ת"ז, סכום, תאריכים), כך שהקובץ ייצא זהה גם אם הכרטיס השתנה אחר כך.
-- להרצה אחרי 0047. אפשר להריץ שוב בלי נזק.

create table if not exists receipt_certificates (
  id bigint generated always as identity primary key,
  student_id bigint references students(id) on delete set null,
  name text not null,
  id_number text not null default '',
  gender text,
  amount numeric not null,
  dates date[] not null,
  number text not null default '',
  issued_on date not null,
  source text not null default 'manual',
  created_at timestamptz not null default now()
);
create index if not exists receipt_certificates_student on receipt_certificates (student_id);

alter table receipt_certificates enable row level security;
drop policy if exists staff_all on receipt_certificates;
create policy staff_all on receipt_certificates for all to authenticated using (true) with check (true);
