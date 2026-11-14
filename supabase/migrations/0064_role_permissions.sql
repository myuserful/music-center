-- מה כל תפקיד רואה: נקבע במסך "הרשאות" (מנהל תמיד רואה הכול).
-- ההרשאה של מסך היא השם שלו (students, payroll...), ויש גם פעולות (delete_payments, edit_prices).
-- להריץ אחרי 0063_roles.sql.

create table if not exists role_permissions (
  role text not null check (role in ('secretary', 'teacher', 'parent')),
  perm text not null,
  primary key (role, perm)
);

-- ברירת מחדל למזכירה: כמו היום (בלי שכר מורים והכנסות/הוצאות, בלי מחיקות ומחירון)
insert into role_permissions (role, perm)
select 'secretary', p from unnest(array[
  'home', 'assign', 'tasks', 'calls', 'schedule', 'daily', 'tracking', 'students', 'siblings',
  'funds', 'payments', 'certificates', 'teachers', 'choirs', 'branches', 'instruments'
]) as p
on conflict do nothing;

alter table role_permissions enable row level security;
drop policy if exists own_perms on role_permissions;
drop policy if exists admin_all on role_permissions;
create policy own_perms on role_permissions for select to authenticated using (role = app_role());
create policy admin_all on role_permissions for all to authenticated using (is_admin()) with check (is_admin());

-- מותר? מנהל תמיד כן, צוות אחר לפי הטבלה
create or replace function can(p text) returns boolean
language sql stable security definer set search_path = public as $$
  select is_admin() or (
    is_staff() and exists (select 1 from role_permissions where role = app_role() and perm = p)
  )
$$;

-- שכר מורים והכנסות/הוצאות: מי שיש לו אחד מהשניים (המסכים קוראים זה מזה)
do $$
declare t text;
begin
  foreach t in array array['teacher_payroll', 'transactions', 'recurring_expenses', 'recurring_runs']
  loop
    execute format('drop policy if exists admin_all on %I', t);
    execute format('drop policy if exists money_all on %I', t);
    execute format($p$create policy money_all on %I for all to authenticated
      using (can('payroll') or can('finance')) with check (can('payroll') or can('finance'))$p$, t);
  end loop;

  foreach t in array array['payments', 'receipts']
  loop
    execute format('drop policy if exists admin_delete on %I', t);
    execute format('drop policy if exists perm_delete on %I', t);
    execute format($p$create policy perm_delete on %I for delete to authenticated using (can('delete_payments'))$p$, t);
  end loop;
end $$;

drop policy if exists admin_write on billing_settings;
drop policy if exists perm_write on billing_settings;
create policy perm_write on billing_settings for update to authenticated
  using (can('edit_prices')) with check (can('edit_prices'));
