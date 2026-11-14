-- הרשאות לפי תפקיד: מנהל, מזכירה, (בהמשך) מורה והורה.
-- משתמש מחובר בלי שורה ב-user_roles לא רואה כלום.
-- כל המשתמשים שקיימים היום מקבלים תפקיד מנהל, כדי שאף אחד לא יינעל בחוץ.

create table if not exists user_roles (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  role       text not null check (role in ('admin', 'secretary', 'teacher', 'parent')),
  teacher_id bigint references teachers(id) on delete set null,
  family_id  bigint references families(id) on delete set null,
  created_at timestamptz not null default now(),
  check (role <> 'teacher' or teacher_id is not null),
  check (role <> 'parent' or family_id is not null)
);

insert into user_roles (user_id, role)
select id, 'admin' from auth.users
on conflict (user_id) do nothing;

-- פונקציות עזר למדיניות (security definer כדי לקרוא את user_roles בלי לולאה של RLS)
create or replace function app_role() returns text
language sql stable security definer set search_path = public as $$
  select role from user_roles where user_id = auth.uid()
$$;

create or replace function is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(app_role() = 'admin', false)
$$;

create or replace function is_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(app_role() in ('admin', 'secretary'), false)
$$;

alter table user_roles enable row level security;
drop policy if exists own_role on user_roles;
drop policy if exists admin_all on user_roles;
create policy own_role on user_roles for select to authenticated using (user_id = auth.uid());
create policy admin_all on user_roles for all to authenticated using (is_admin()) with check (is_admin());

-- מחליפים את כל המדיניות הקיימת בטבלאות (היום: כל מחובר רואה הכול)
do $$
declare
  r record;
  t text;
  admin_only text[] := array['teacher_payroll', 'transactions', 'recurring_expenses', 'recurring_runs'];
  no_staff_delete text[] := array['payments', 'receipts'];
begin
  for r in
    select schemaname, tablename, policyname from pg_policies
    where schemaname = 'public' and tablename <> 'user_roles'
  loop
    execute format('drop policy %I on %I.%I', r.policyname, r.schemaname, r.tablename);
  end loop;

  for t in
    select tablename from pg_tables where schemaname = 'public' and tablename <> 'user_roles'
  loop
    execute format('alter table %I enable row level security', t);
    if t = any(admin_only) then
      -- שכר מורים והכנסות/הוצאות: מנהל בלבד
      execute format('create policy admin_all on %I for all to authenticated using (is_admin()) with check (is_admin())', t);
    elsif t = any(no_staff_delete) then
      -- תשלומים וקבלות: מזכירה רושמת ומפיקה, רק מנהל מוחק
      execute format('create policy staff_select on %I for select to authenticated using (is_staff())', t);
      execute format('create policy staff_insert on %I for insert to authenticated with check (is_staff())', t);
      execute format('create policy staff_update on %I for update to authenticated using (is_staff()) with check (is_staff())', t);
      execute format('create policy admin_delete on %I for delete to authenticated using (is_admin())', t);
    elsif t = 'billing_settings' then
      -- מחירון: כולם בצוות קוראים, רק מנהל משנה
      execute format('create policy staff_select on %I for select to authenticated using (is_staff())', t);
      execute format('create policy admin_write on %I for update to authenticated using (is_admin()) with check (is_admin())', t);
    else
      execute format('create policy staff_all on %I for all to authenticated using (is_staff()) with check (is_staff())', t);
    end if;
  end loop;
end $$;

-- קבצים (קבלות, אסמכתאות): צוות בלבד
drop policy if exists receipts_staff_select on storage.objects;
drop policy if exists receipts_staff_insert on storage.objects;
drop policy if exists receipts_staff_update on storage.objects;
drop policy if exists receipts_staff_delete on storage.objects;
create policy receipts_staff_select on storage.objects for select to authenticated using (bucket_id = 'receipts' and is_staff());
create policy receipts_staff_insert on storage.objects for insert to authenticated with check (bucket_id = 'receipts' and is_staff());
create policy receipts_staff_update on storage.objects for update to authenticated using (bucket_id = 'receipts' and is_staff());
create policy receipts_staff_delete on storage.objects for delete to authenticated using (bucket_id = 'receipts' and is_staff());
