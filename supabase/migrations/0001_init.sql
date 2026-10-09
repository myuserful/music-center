-- מקצב - סכמת מסד הנתונים
-- להרצה פעם אחת ב-Supabase: SQL Editor > New query > הדבקה > Run

create type assignment_status as enum ('pending', 'undecided', 'confirmed');

-- סניפים
create table branches (
  id bigint generated always as identity primary key,
  name text not null unique,
  address text not null default ''
);

-- חדרים
create table rooms (
  id bigint generated always as identity primary key,
  branch_id bigint not null references branches(id) on delete cascade,
  name text not null,
  unique (branch_id, name)
);

-- כלי נגינה
create table instruments (
  id bigint generated always as identity primary key,
  name text not null unique
);

-- מורים
create table teachers (
  id bigint generated always as identity primary key,
  first_name text not null,
  last_name text not null,
  phone text not null default '',
  email text not null default '',
  room_id bigint references rooms(id) on delete set null,
  notes text not null default '',
  active boolean not null default true
);

create table teacher_instruments (
  teacher_id bigint not null references teachers(id) on delete cascade,
  instrument_id bigint not null references instruments(id) on delete cascade,
  primary key (teacher_id, instrument_id)
);

-- שעות עבודה של מורה (0=ראשון ... 6=שבת)
create table teacher_hours (
  id bigint generated always as identity primary key,
  teacher_id bigint not null references teachers(id) on delete cascade,
  weekday smallint not null check (weekday between 0 and 6),
  start_time time not null,
  end_time time not null,
  check (end_time > start_time)
);

-- תלמידים
create table students (
  id bigint generated always as identity primary key,
  first_name text not null,
  last_name text not null,
  grade text not null default '',
  birth_date date,
  branch_id bigint references branches(id) on delete set null,
  requested_instrument_id bigint references instruments(id) on delete set null,
  notes text not null default '',
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- אנשי קשר (הורים)
create table contacts (
  id bigint generated always as identity primary key,
  student_id bigint not null references students(id) on delete cascade,
  name text not null,
  relation text not null default '',
  phone text not null default '',
  email text not null default '',
  is_primary boolean not null default false
);

-- שיעורים פרטיים שבועיים (30 דקות)
create table lessons (
  id bigint generated always as identity primary key,
  student_id bigint not null references students(id) on delete cascade,
  teacher_id bigint not null references teachers(id) on delete restrict,
  instrument_id bigint not null references instruments(id) on delete restrict,
  room_id bigint not null references rooms(id) on delete restrict,
  weekday smallint not null check (weekday between 0 and 5),
  start_time time not null check (extract(minute from start_time) in (0, 30) and extract(second from start_time) = 0),
  status assignment_status not null default 'pending',
  notes text not null default '',
  created_at timestamptz not null default now(),
  -- הגנה אחרונה מפני התנגשויות (השיעורים תמיד על חצאי שעות)
  unique (teacher_id, weekday, start_time),
  unique (room_id, weekday, start_time),
  unique (student_id, weekday, start_time)
);

-- מקהלות
create table choirs (
  id bigint generated always as identity primary key,
  name text not null,
  teacher_id bigint not null references teachers(id) on delete restrict,
  room_id bigint not null references rooms(id) on delete restrict,
  weekday smallint not null check (weekday between 0 and 5),
  start_time time not null,
  end_time time not null,
  notes text not null default '',
  check (end_time > start_time)
);

create table choir_enrollments (
  id bigint generated always as identity primary key,
  choir_id bigint not null references choirs(id) on delete cascade,
  student_id bigint not null references students(id) on delete cascade,
  status assignment_status not null default 'pending',
  created_at timestamptz not null default now(),
  unique (choir_id, student_id)
);

-- קיבולת מקהלה: עד 15 ילדים
create function check_choir_capacity() returns trigger language plpgsql as $$
begin
  perform pg_advisory_xact_lock(new.choir_id);
  if (select count(*) from choir_enrollments where choir_id = new.choir_id) >= 15 then
    raise exception 'המקהלה מלאה (15 ילדים)';
  end if;
  return new;
end $$;

create trigger choir_capacity before insert on choir_enrollments
  for each row execute function check_choir_capacity();

-- אבטחה: רק משתמשות מחוברות (צוות) רואות ועורכות
do $$
declare t text;
begin
  foreach t in array array['branches','rooms','instruments','teachers','teacher_instruments',
    'teacher_hours','students','contacts','lessons','choirs','choir_enrollments']
  loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy staff_all on %I for all to authenticated using (true) with check (true)', t);
  end loop;
end $$;

-- נתוני פתיחה
insert into branches (name) values ('גינות דוד'), ('מתחם הסופרים');
insert into instruments (name) values
  ('פסנתר'), ('גיטרה'), ('כינור'), ('חליל צד'), ('תופים'), ('חצוצרה'), ('צ''לו'), ('חליליות'), ('מקהלה');
