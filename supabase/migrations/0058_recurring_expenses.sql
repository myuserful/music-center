-- הוצאות קבועות (שכירות וכו'): מגדירים פעם אחת, והן נרשמות לבד כהוצאה בכל חודש.
-- recurring_runs זוכר לכל הוצאה אילו חודשים כבר נרשמו, כדי שלא תירשם פעמיים,
-- ושרישום שנמחק ביד (transaction_id ריק) לא ייווצר שוב.
-- להרצה אחרי 0057. אפשר להריץ שוב בלי נזק.

create table if not exists recurring_expenses (
  id bigint generated always as identity primary key,
  category text not null,
  counterparty text not null default '',
  amount numeric not null check (amount > 0),
  day_of_month int not null default 1 check (day_of_month between 1 and 31),
  method text not null default 'bank_transfer'
    check (method in ('cash', 'credit', 'check', 'bank_transfer', 'standing_order', 'bit')),
  notes text not null default '',
  start_month date not null,
  end_month date,
  created_at timestamptz not null default now()
);

create table if not exists recurring_runs (
  recurring_id bigint not null references recurring_expenses(id) on delete cascade,
  month date not null,
  transaction_id bigint references transactions(id) on delete set null,
  primary key (recurring_id, month)
);

alter table transactions
  add column if not exists recurring_id bigint references recurring_expenses(id) on delete set null;
create index if not exists transactions_recurring on transactions (recurring_id);

alter table recurring_expenses enable row level security;
drop policy if exists staff_all on recurring_expenses;
create policy staff_all on recurring_expenses for all to authenticated using (true) with check (true);

alter table recurring_runs enable row level security;
drop policy if exists staff_all on recurring_runs;
create policy staff_all on recurring_runs for all to authenticated using (true) with check (true);
