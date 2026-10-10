-- תשלומים: מסלול תשלום לתלמיד, מחירון, חיובים חודשיים, תשלומים והתחייבויות לקופות

-- מסלול תשלום: פרטי / מכבי (שני חלקים) / התחייבות דרך הקופה / לא ידוע (לבירור)
alter table students
  add column payment_track text not null default 'unknown'
    check (payment_track in ('private', 'maccabi', 'commitment', 'unknown')),
  add column standing_order boolean not null default false;

-- ברירת מחדל לפי הקופה. כללית/לאומית/מאוחדת נשארים "לא ידוע" עד שמוודאים שיש התחייבות
update students set payment_track = case health_fund
  when 'private' then 'private'
  when 'maccabi' then 'maccabi'
  else 'unknown' end;

-- מחירון שיעור פרטי (שורה אחת)
create table billing_settings (
  id smallint primary key default 1 check (id = 1),
  lesson_private numeric not null default 300,
  lesson_maccabi_1 numeric not null default 280,
  lesson_maccabi_2 numeric not null default 280,
  lesson_commitments smallint not null default 4
);
insert into billing_settings default values;

-- מחירון מקהלה: לכל מקהלה מחיר משלה (ריק = עדיין לא נקבע)
alter table choirs
  add column price_private numeric,
  add column price_maccabi_1 numeric,
  add column price_maccabi_2 numeric,
  add column commitments smallint;

-- כמה הקופה משלמת על התחייבות אחת (ריק = עדיין לא ידוע)
create table fund_rates (
  fund text primary key check (fund in ('clalit', 'leumit', 'meuhedet')),
  amount numeric
);
insert into fund_rates (fund) values ('clalit'), ('leumit'), ('meuhedet');

-- חיובים חודשיים
--   הורים: due = לתשלום, awaiting_refund = חלק שני של מכבי, מחכה שההורים יקבלו החזר
--   קופה: to_submit -> submitted -> paid / rejected
create table charges (
  id bigint generated always as identity primary key,
  student_id bigint not null references students(id) on delete cascade,
  month date not null check (extract(day from month) = 1),
  lesson_id bigint references lessons(id) on delete set null,
  choir_id bigint references choirs(id) on delete set null,
  part smallint not null default 1,
  description text not null default '',
  payer text not null check (payer in ('parents', 'fund')),
  fund text,
  amount numeric,
  commitments smallint,
  state text not null check (state in ('due', 'awaiting_refund', 'to_submit', 'submitted', 'paid', 'rejected', 'cancelled')),
  created_at timestamptz not null default now()
);
-- אותה פעילות לא מחויבת פעמיים באותו חודש (חיובים ידניים בלי פעילות לא מוגבלים)
create unique index charges_once on charges
  (student_id, month, coalesce(lesson_id, 0), coalesce(choir_id, 0), part)
  where lesson_id is not null or choir_id is not null;
create index charges_month on charges (month);

-- תשלומים מההורים
create table payments (
  id bigint generated always as identity primary key,
  student_id bigint not null references students(id) on delete cascade,
  paid_on date not null default current_date,
  amount numeric not null check (amount > 0),
  method text not null check (method in ('cash', 'credit', 'check', 'standing_order')),
  reference text not null default '',
  check_number text not null default '',
  check_bank text not null default '',
  check_date date,
  check_status text check (check_status in ('pending', 'deposited', 'bounced')),
  notes text not null default '',
  created_at timestamptz not null default now()
);
create index payments_student on payments (student_id);

alter table billing_settings enable row level security;
alter table fund_rates enable row level security;
alter table charges enable row level security;
alter table payments enable row level security;
create policy staff_all on billing_settings for all to authenticated using (true) with check (true);
create policy staff_all on fund_rates for all to authenticated using (true) with check (true);
create policy staff_all on charges for all to authenticated using (true) with check (true);
create policy staff_all on payments for all to authenticated using (true) with check (true);
