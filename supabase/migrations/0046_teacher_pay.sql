-- שכר מורים לפי שעות בפועל (מסגירות היום).
-- להרצה פעם אחת (אפשר להריץ שוב בלי נזק).

-- בכל שיעור ביום: משולם למורה? ריק = לפי הכלל (הגיע/ה, לא הגיע/ה, ביטול מראש באמצע היום)
alter table day_lessons add column if not exists teacher_paid boolean;

-- מינימום שעות בשבוע שהתחייבנו למורה
alter table teachers add column if not exists min_weekly_hours numeric check (min_weekly_hours >= 0);

-- תוספות לשכר: זמן (דקות) או סכום (בונוס, למשל הביא/ה מורה), עם סיבה
create table if not exists teacher_extras (
  id bigint generated always as identity primary key,
  teacher_id bigint not null references teachers(id) on delete cascade,
  extra_date date not null,
  minutes integer,
  amount numeric,
  reason text not null default '',
  created_at timestamptz not null default now(),
  check (minutes is not null or amount is not null)
);
create index if not exists teacher_extras_month on teacher_extras (teacher_id, extra_date);

-- שכר חודש שאושר ושולם (נרשם גם כהוצאה ב"הכנסות והוצאות")
create table if not exists teacher_payroll (
  teacher_id bigint not null references teachers(id) on delete cascade,
  month date not null check (extract(day from month) = 1),
  amount numeric not null,
  minutes integer not null default 0,
  transaction_id bigint references transactions(id) on delete cascade,
  paid_on date not null default current_date,
  created_at timestamptz not null default now(),
  primary key (teacher_id, month)
);

alter table teacher_extras enable row level security;
alter table teacher_payroll enable row level security;
drop policy if exists staff_all on teacher_extras;
drop policy if exists staff_all on teacher_payroll;
create policy staff_all on teacher_extras for all to authenticated using (true) with check (true);
create policy staff_all on teacher_payroll for all to authenticated using (true) with check (true);

-- שמירת יום: גם "משולם למורה" (מחליף את הגרסה מ-0040)
create or replace function save_day(p_teacher bigint, p_date date, p_rows jsonb, p_close boolean)
returns void language plpgsql security invoker as $$
begin
  delete from day_lessons where teacher_id = p_teacher and lesson_date = p_date;
  insert into day_lessons
    (lesson_date, teacher_id, student_id, lesson_id, instrument_id, start_time, room_id, attendance, notes, substitute_id, teacher_paid)
  select p_date, p_teacher, (r->>'student_id')::bigint, nullif(r->>'lesson_id', '')::bigint,
         nullif(r->>'instrument_id', '')::bigint, nullif(r->>'start_time', '')::time,
         nullif(r->>'room_id', '')::bigint, coalesce(r->>'attendance', 'present'), coalesce(r->>'notes', ''),
         nullif(r->>'substitute_id', '')::bigint, (r->>'teacher_paid')::boolean
  from jsonb_array_elements(p_rows) r;
  if p_close then
    insert into day_closures (teacher_id, lesson_date) values (p_teacher, p_date)
    on conflict (teacher_id, lesson_date) do update set closed_at = now();
  end if;
end $$;

notify pgrst, 'reload schema';
