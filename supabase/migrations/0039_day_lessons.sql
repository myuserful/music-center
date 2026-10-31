-- סגירת יום: מה קרה בפועל בכל יום, לכל מורה. זה הבסיס לחיוב התלמידים לפי שיעורים שהתקיימו.
-- ברירת המחדל של היום היא מערכת השעות הקבועה. שינויים כאן (הוספת תלמיד, שינוי שעה, הסרה) חלים רק על אותו יום.
-- להרצה פעם אחת בלבד (אחרי 0038).

-- שיעור של יום מסוים. lesson_id ריק = תלמיד/ה שנוסף/ה רק ליום הזה (שיעור השלמה, ניסיון...)
create table day_lessons (
  id bigint generated always as identity primary key,
  lesson_date date not null,
  teacher_id bigint not null references teachers(id) on delete cascade,
  student_id bigint not null references students(id) on delete cascade,
  lesson_id bigint references lessons(id) on delete set null,
  instrument_id bigint references instruments(id) on delete set null,
  start_time time,
  room_id bigint references rooms(id) on delete set null,
  -- present = הגיע/ה, absent = לא הגיע/ה בלי הודעה, excused = ביטל/ה מראש, cancelled = המורה ביטל/ה
  attendance text not null default 'present' check (attendance in ('present', 'absent', 'excused', 'cancelled')),
  notes text not null default '',
  created_at timestamptz not null default now()
);
create index day_lessons_date on day_lessons (lesson_date, teacher_id);
create index day_lessons_student on day_lessons (student_id, lesson_date);

-- יום שנסגר אצל מורה: הנוכחות סופית ואפשר לחייב לפיה
create table day_closures (
  teacher_id bigint not null references teachers(id) on delete cascade,
  lesson_date date not null,
  closed_at timestamptz not null default now(),
  primary key (teacher_id, lesson_date)
);

alter table day_lessons enable row level security;
alter table day_closures enable row level security;
create policy staff_all on day_lessons for all to authenticated using (true) with check (true);
create policy staff_all on day_closures for all to authenticated using (true) with check (true);

-- שמירת היום של מורה בפעולה אחת (מחיקה והכנסה מחדש, כדי שלא יישאר חצי יום אם משהו נכשל).
-- p_close: true = סגירת היום, false = שמירה בלי לסגור (היום נשאר פתוח לעריכה)
create or replace function save_day(p_teacher bigint, p_date date, p_rows jsonb, p_close boolean)
returns void language plpgsql security invoker as $$
begin
  delete from day_lessons where teacher_id = p_teacher and lesson_date = p_date;
  insert into day_lessons (lesson_date, teacher_id, student_id, lesson_id, instrument_id, start_time, room_id, attendance, notes)
  select p_date, p_teacher, (r->>'student_id')::bigint, nullif(r->>'lesson_id', '')::bigint,
         nullif(r->>'instrument_id', '')::bigint, nullif(r->>'start_time', '')::time,
         nullif(r->>'room_id', '')::bigint, coalesce(r->>'attendance', 'present'), coalesce(r->>'notes', '')
  from jsonb_array_elements(p_rows) r;
  if p_close then
    insert into day_closures (teacher_id, lesson_date) values (p_teacher, p_date)
    on conflict (teacher_id, lesson_date) do update set closed_at = now();
  end if;
end $$;
