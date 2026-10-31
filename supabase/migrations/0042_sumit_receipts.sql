-- קבלות: כל קבלה (מ-SUMIT, קבלה פנימית מהמערכת, או מספר שהוקלד ביד) שייכת לתשלום. לתשלום יכולות להיות כמה קבלות:
-- במכבי (חלק מראש + זיכוי) - קבלה על השיעורים וקבלה נפרדת על ההשלמה.
-- דרך החיובים שהתשלום כיסה, לכל חיוב רואים את הקבלה שלו.
-- להרצה אחרי 0041. אפשר להריץ שוב בלי נזק (גם אם הגרסה הקודמת של הקובץ כבר הורצה).
alter table payments
  drop column if exists receipt_number,
  drop column if exists receipt_url,
  drop column if exists sumit_document_id;

create table if not exists receipts (
  id bigint generated always as identity primary key,
  payment_id bigint not null references payments(id) on delete cascade,
  student_id bigint not null references students(id) on delete cascade,
  -- lesson = שיעורים / תשלום מראש, maccabi_later = השלמת מכבי (95 ₪), deposit = פיקדון (כללית/מאוחדת/לאומית)
  kind text not null default 'lesson' check (kind in ('lesson', 'maccabi_later', 'deposit')),
  -- sumit = הופקה ב-SUMIT, internal = אישור שהמערכת הפיקה (למשל על פיקדון), manual = מספר שהוקלד ביד
  source text not null default 'manual' check (source in ('sumit', 'internal', 'manual')),
  number text not null default '',
  url text not null default '',
  sumit_document_id bigint,
  amount numeric not null,
  customer_name text not null default '',
  description text not null default '',
  issued_on date not null default current_date,
  created_at timestamptz not null default now()
);
-- אם הגרסה הקודמת של הקובץ כבר הורצה: מעדכנים את סוגי הקבלה (נוסף פיקדון) ומוסיפים את המקור
alter table receipts drop constraint if exists receipts_kind_check;
alter table receipts add constraint receipts_kind_check check (kind in ('lesson', 'maccabi_later', 'deposit'));
alter table receipts add column if not exists source text not null default 'manual'
  check (source in ('sumit', 'internal', 'manual'));
update receipts set source = 'sumit' where sumit_document_id is not null;

-- מספור רץ לקבלות הפנימיות (נפרד מהמספור של SUMIT)
create sequence if not exists internal_receipt_number;
create or replace function next_internal_receipt_number() returns bigint
language sql volatile security invoker as $$ select nextval('internal_receipt_number') $$;
grant usage on sequence internal_receipt_number to authenticated;
grant execute on function next_internal_receipt_number() to authenticated;

create index if not exists receipts_payment on receipts (payment_id);
create index if not exists receipts_student on receipts (student_id);

alter table receipts enable row level security;
drop policy if exists staff_all on receipts;
create policy staff_all on receipts for all to authenticated using (true) with check (true);

-- שהמערכת תכיר מיד את הטבלה והפונקציה החדשות
notify pgrst, 'reload schema';
