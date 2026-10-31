-- מילוי מקום: שיעור ביום מסוים שמורה אחר/ת לימד/ה במקום המורה הקבוע/ה.
-- השיעור נשאר בכרטיס של המורה הקבוע/ה (teacher_id), ו-substitute_id אומר מי לימד/ה בפועל (לשכר המורים).
-- ריק = המורה הקבוע/ה לימד/ה. להרצה פעם אחת בלבד (אחרי 0039).
alter table day_lessons add column substitute_id bigint references teachers(id) on delete set null;
alter table day_lessons add constraint day_lessons_substitute_check check (substitute_id is null or substitute_id <> teacher_id);
create index day_lessons_substitute on day_lessons (substitute_id, lesson_date) where substitute_id is not null;

create or replace function save_day(p_teacher bigint, p_date date, p_rows jsonb, p_close boolean)
returns void language plpgsql security invoker as $$
begin
  delete from day_lessons where teacher_id = p_teacher and lesson_date = p_date;
  insert into day_lessons
    (lesson_date, teacher_id, student_id, lesson_id, instrument_id, start_time, room_id, attendance, notes, substitute_id)
  select p_date, p_teacher, (r->>'student_id')::bigint, nullif(r->>'lesson_id', '')::bigint,
         nullif(r->>'instrument_id', '')::bigint, nullif(r->>'start_time', '')::time,
         nullif(r->>'room_id', '')::bigint, coalesce(r->>'attendance', 'present'), coalesce(r->>'notes', ''),
         nullif(r->>'substitute_id', '')::bigint
  from jsonb_array_elements(p_rows) r;
  if p_close then
    insert into day_closures (teacher_id, lesson_date) values (p_teacher, p_date)
    on conflict (teacher_id, lesson_date) do update set closed_at = now();
  end if;
end $$;
