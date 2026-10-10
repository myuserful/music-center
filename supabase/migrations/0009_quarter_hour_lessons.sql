-- שיעורים יכולים להתחיל גם ברבעי שעה (:00, :15, :30, :45)
do $$
declare c record;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'lessons'::regclass and contype = 'c'
      and pg_get_constraintdef(oid) like '%start_time%'
  loop
    execute format('alter table lessons drop constraint %I', c.conname);
  end loop;
end $$;

alter table lessons add constraint lessons_start_time_check
  check (extract(minute from start_time) in (0, 15, 30, 45) and extract(second from start_time) = 0);
