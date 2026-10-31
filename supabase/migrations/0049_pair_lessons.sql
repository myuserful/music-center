-- שיעור בזוג: שני תלמידים באותו שיעור (אותו מורה, יום ושעה). כל תלמיד/ה עם שורת שיעור משלו/ה, מסומנת pair.
-- בחיוב: מכל 4 שיעורים בזוג שהתלמיד/ה חויב/ה עליהם, 3 בתשלום והרביעי חינם.
-- למורה: שיעור בזוג נספר כשיעור אחד.
-- להרצה פעם אחת בלבד (אחרי 0048).
alter table lessons add column pair boolean not null default false;
alter table day_lessons add column pair boolean not null default false;

-- "שיעור אחד למורה באותו יום ושעה" - עכשיו רק לשיעורים שלא בזוג. הזוג נבדק בטריגר למטה
do $$
declare c record;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'lessons'::regclass and contype = 'u'
      and pg_get_constraintdef(oid) like '%teacher_id%'
  loop
    execute format('alter table lessons drop constraint %I', c.conname);
  end loop;
end $$;
create unique index lessons_teacher_slot_unique on lessons (teacher_id, weekday, start_time) where not pair;

-- באותו יום ושעה אצל מורה: שיעור אחד, או זוג (שני שיעורים מסומנים pair, לא יותר)
create or replace function lessons_pair_check() returns trigger language plpgsql as $$
declare others int; single int;
begin
  if new.at_home then
    new.pair := false;
    return new;
  end if;
  -- שיעור בזוג שעבר לשעה או למורה אחר/ת: כבר לא בזוג
  if tg_op = 'UPDATE' and (new.teacher_id, new.weekday, new.start_time) is distinct from (old.teacher_id, old.weekday, old.start_time) then
    new.pair := false;
  end if;
  select count(*), count(*) filter (where not pair) into others, single
  from lessons
  where teacher_id = new.teacher_id and weekday = new.weekday and start_time = new.start_time and id <> new.id;
  if others > 0 and (not new.pair or single > 0) then
    raise exception 'למורה כבר יש שיעור בשעה זו' using errcode = '23505';
  end if;
  if others > 1 then
    raise exception 'בשיעור בזוג יש כבר שני תלמידים' using errcode = '23505';
  end if;
  return new;
end $$;
create trigger lessons_pair_check before insert or update on lessons
  for each row execute function lessons_pair_check();

-- תלמיד/ה שנשאר/ה לבד (בן/בת הזוג נמחק/ה או הועבר/ה): השיעור חוזר להיות רגיל
create or replace function lessons_pair_cleanup() returns trigger language plpgsql as $$
begin
  update lessons l set pair = false
  where l.pair and l.teacher_id = old.teacher_id and l.weekday = old.weekday and l.start_time = old.start_time
    and not exists (
      select 1 from lessons o
      where o.id <> l.id and o.teacher_id = l.teacher_id and o.weekday = l.weekday and o.start_time = l.start_time
    );
  return null;
end $$;
create trigger lessons_pair_cleanup after delete or update of teacher_id, weekday, start_time, at_home on lessons
  for each row execute function lessons_pair_cleanup();

-- שמירת יום: גם הסימון "בזוג" (לחיוב)
create or replace function save_day(p_teacher bigint, p_date date, p_rows jsonb, p_close boolean)
returns void language plpgsql security invoker as $$
begin
  delete from day_lessons where teacher_id = p_teacher and lesson_date = p_date;
  insert into day_lessons
    (lesson_date, teacher_id, student_id, lesson_id, instrument_id, start_time, room_id, attendance, notes, substitute_id, teacher_paid, pair)
  select p_date, p_teacher, (r->>'student_id')::bigint, nullif(r->>'lesson_id', '')::bigint,
         nullif(r->>'instrument_id', '')::bigint, nullif(r->>'start_time', '')::time,
         nullif(r->>'room_id', '')::bigint, coalesce(r->>'attendance', 'present'), coalesce(r->>'notes', ''),
         nullif(r->>'substitute_id', '')::bigint, (r->>'teacher_paid')::boolean, coalesce((r->>'pair')::boolean, false)
  from jsonb_array_elements(p_rows) r;
  if p_close then
    insert into day_closures (teacher_id, lesson_date) values (p_teacher, p_date)
    on conflict (teacher_id, lesson_date) do update set closed_at = now();
  end if;
end $$;

notify pgrst, 'reload schema';
