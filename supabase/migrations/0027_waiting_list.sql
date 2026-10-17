-- סטטוס תלמיד חדש: רשימת המתנה, ושדה חופשי למה ממתינים (למשל "אורגן, רק ביום שני")
alter table students add column waiting_reason text not null default '';

do $$
declare c record;
begin
  -- מחליפים את בדיקת הסטטוס הקיימת (שמה נוצר אוטומטית ב-0007)
  for c in
    select conname from pg_constraint
    where conrelid = 'students'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%''undecided''%'
  loop
    execute format('alter table students drop constraint %I', c.conname);
  end loop;
end $$;

alter table students add constraint students_status_check
  check (status in ('active', 'undecided', 'waiting', 'inactive'));
