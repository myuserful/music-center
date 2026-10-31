-- חיוב לפי שיעורים שהתקיימו: כל שיעור ביום שנסגר מוריד מהיתרה של התלמיד/ה לפי המסלול שלו/ה.
-- מחליף את החיובים החודשיים לפי השיבוץ (charges), שלא היו בשימוש.
-- להרצה פעם אחת בלבד (אחרי 0040).

-- ---- מסלולי תשלום ----
-- private        = פרטי: 75 ₪ לשיעור, מראש לחודש
-- maccabi_full   = מכבי, אפשרות 1: 140 ₪ לשיעור, מראש לחודש
-- maccabi_split  = מכבי, אפשרות 2: 45 ₪ לשיעור מראש, ועוד 95 ₪ עד חודשיים מיום השיעור (חוב זיכוי מכבי)
-- fund_deposit   = כללית / מאוחדת / לאומית: 75 ₪ פיקדון לשיעור. כשההורים מביאים התחייבות - הפיקדון חוזר אליהם
do $$
declare c record;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'students'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%payment_track%'
  loop
    execute format('alter table students drop constraint %I', c.conname);
  end loop;
end $$;
update students set payment_track = 'maccabi_split' where payment_track = 'maccabi';
update students set payment_track = 'fund_deposit' where payment_track = 'commitment';
alter table students add constraint students_payment_track_check
  check (payment_track in ('private', 'maccabi_full', 'maccabi_split', 'fund_deposit', 'unknown'));

-- ---- מחירון ----
alter table billing_settings
  drop column if exists lesson_private,
  drop column if exists lesson_maccabi_1,
  drop column if exists lesson_maccabi_2,
  drop column if exists lesson_commitments,
  add column price_private numeric not null default 75,
  add column price_maccabi_full numeric not null default 140,
  add column price_maccabi_upfront numeric not null default 45,
  add column price_maccabi_later numeric not null default 95,
  add column price_fund_deposit numeric not null default 75,
  add column maccabi_later_months smallint not null default 2 check (maccabi_later_months between 1 and 12);

-- ---- חיובים ----
drop table if exists charges;

-- שורת חיוב. lesson = מחיר השיעור (או החלק שמשלמים מראש במכבי), maccabi_later = 95 ₪ שמשלמים אחר כך,
-- deposit = פיקדון בקופות האחרות, manual = חיוב או הנחה ידניים (הנחה = סכום שלילי)
create table lesson_charges (
  id bigint generated always as identity primary key,
  student_id bigint not null references students(id) on delete cascade,
  -- השיעור: המורה של הכרטיס בסגירת היום (גם כשהיה מילוי מקום) והתאריך. בחיוב ידני - ריק
  teacher_id bigint references teachers(id) on delete set null,
  lesson_date date not null,
  kind text not null check (kind in ('lesson', 'maccabi_later', 'deposit', 'manual')),
  track text not null default '',
  description text not null default '',
  amount numeric not null,
  -- מתי צריך לשלם (שיעור: יום השיעור, maccabi_later: חודשיים אחריו)
  due_date date not null,
  -- פיקדון: ההורים הביאו התחייבות, הפיקדון חוזר אליהם
  commitment_on date,
  commitment_ref text not null default '',
  created_at timestamptz not null default now()
);
create unique index lesson_charges_once on lesson_charges (teacher_id, lesson_date, student_id, kind) where kind <> 'manual';
create index lesson_charges_student on lesson_charges (student_id, due_date);
create index lesson_charges_date on lesson_charges (lesson_date);

alter table lesson_charges enable row level security;
create policy staff_all on lesson_charges for all to authenticated using (true) with check (true);

-- ---- תשלומים ----
-- העברה בנקאית, והחזר להורים (למשל פיקדון שחזר)
do $$
declare c record;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'payments'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%method%'
  loop
    execute format('alter table payments drop constraint %I', c.conname);
  end loop;
end $$;
alter table payments add constraint payments_method_check
  check (method in ('cash', 'credit', 'transfer', 'check', 'standing_order'));
alter table payments add column refund boolean not null default false;

-- ---- טעינה מהירה (מחליף את הגרסה מ-0025) ----
create or replace function billing_data(p_student bigint default null) returns json
language sql stable security invoker as $$
  select json_build_object(
    'settings', (select row_to_json(s) from billing_settings s limit 1),
    'charges', (select coalesce(json_agg(c order by c.due_date, c.id), '[]') from lesson_charges c
                where p_student is null or c.student_id = p_student),
    'payments', (select coalesce(json_agg(p order by p.paid_on desc, p.id desc), '[]') from payments p
                 where p_student is null or p.student_id = p_student)
  )
$$;
grant execute on function billing_data(bigint) to authenticated;
