-- הכנסות והוצאות של העסק (מעבר לתשלומי הורים וקופות, שנספרים אוטומטית מטבלאות התשלומים)
create table transactions (
  id bigint generated always as identity primary key,
  kind text not null check (kind in ('income', 'expense')),
  occurred_on date not null default current_date,
  amount numeric not null check (amount > 0),
  category text not null,
  counterparty text not null default '',
  teacher_id bigint references teachers(id) on delete set null,
  method text not null default 'bank_transfer'
    check (method in ('cash', 'credit', 'check', 'bank_transfer', 'standing_order', 'bit')),
  reference text not null default '',
  recurring boolean not null default false,
  notes text not null default '',
  created_at timestamptz not null default now()
);
create index transactions_date on transactions (occurred_on);

alter table transactions enable row level security;
create policy staff_all on transactions for all to authenticated using (true) with check (true);
