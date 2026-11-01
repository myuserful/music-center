-- סגירת כל היום (נעילה סופית), העברה חד-פעמית של תלמיד/ה ליום אחר, וסגירה אוטומטית.
-- להרצה פעם אחת בלבד (אחרי 0051).

-- העברה חד-פעמית: השורה ביום החדש זוכרת מאיזה יום ומאיזה/ו מורה היא הועברה (כדי להראות את זה גם ביום המקורי)
alter table day_lessons
  add column moved_from date,
  add column moved_from_teacher bigint references teachers(id) on delete set null;
create index day_lessons_moved_from on day_lessons (moved_from) where moved_from is not null;

-- יום שנסגר סופית (לכל המורים): אי אפשר יותר לשנות בו כלום.
-- stats = תמונת מצב של היום ברגע הסגירה (תלמידים, נוכחות, מורים, סכומים), לסטטיסטיקות
create table day_locks (
  lesson_date date primary key,
  locked_at timestamptz not null default now(),
  -- נסגר אוטומטית (לא סגרו ביד עד 24 שעות אחרי סוף היום)
  auto boolean not null default false,
  stats jsonb not null default '{}',
  -- פתיחה חריגה של יום נעול (לתיקון טעות). השורה נשארת, כדי שהסגירה האוטומטית לא תנעל אותו שוב
  unlocked_at timestamptz
);
alter table day_locks enable row level security;
create policy staff_all on day_locks for all to authenticated using (true) with check (true);

-- סגירה אוטומטית רק מהיום שהמיגרציה הורצה והלאה (כדי שלא ייסגרו ימים ישנים שלא עבדו בהם עם סגירת יום)
alter table billing_settings add column auto_close_from date not null default current_date;

-- יום נעול: אי אפשר לבטל סגירה של מורה בו (מחיקה בשרשרת, למשל של מורה שנמחק/ה, מותרת)
create or replace function day_closures_locked() returns trigger language plpgsql as $$
begin
  if pg_trigger_depth() = 1 and exists (select 1 from day_locks where lesson_date = old.lesson_date and unlocked_at is null) then
    raise exception 'היום הזה נסגר סופית ואי אפשר לשנות אותו' using errcode = 'P0001';
  end if;
  return old;
end $$;
create trigger day_closures_locked before delete on day_closures
  for each row execute function day_closures_locked();

-- שמירת יום: גם ההעברה החד-פעמית, ולא ביום נעול (מחליף את הגרסה מ-0049)
create or replace function save_day(p_teacher bigint, p_date date, p_rows jsonb, p_close boolean)
returns void language plpgsql security invoker as $$
begin
  if exists (select 1 from day_locks where lesson_date = p_date and unlocked_at is null) then
    raise exception 'היום הזה נסגר סופית ואי אפשר לשנות אותו' using errcode = 'P0001';
  end if;
  delete from day_lessons where teacher_id = p_teacher and lesson_date = p_date;
  insert into day_lessons
    (lesson_date, teacher_id, student_id, lesson_id, instrument_id, start_time, room_id, attendance, notes, substitute_id,
     teacher_paid, pair, moved_from, moved_from_teacher)
  select p_date, p_teacher, (r->>'student_id')::bigint, nullif(r->>'lesson_id', '')::bigint,
         nullif(r->>'instrument_id', '')::bigint, nullif(r->>'start_time', '')::time,
         nullif(r->>'room_id', '')::bigint, coalesce(r->>'attendance', 'present'), coalesce(r->>'notes', ''),
         nullif(r->>'substitute_id', '')::bigint, (r->>'teacher_paid')::boolean, coalesce((r->>'pair')::boolean, false),
         nullif(r->>'moved_from', '')::date, nullif(r->>'moved_from_teacher', '')::bigint
  from jsonb_array_elements(p_rows) r;
  if p_close then
    insert into day_closures (teacher_id, lesson_date) values (p_teacher, p_date)
    on conflict (teacher_id, lesson_date) do update set closed_at = now();
  end if;
end $$;

notify pgrst, 'reload schema';
