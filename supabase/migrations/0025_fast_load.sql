-- טעינה מהירה: כל הנתונים בקריאה אחת למסד (במקום 12 קריאות נפרדות, כל אחת לוקחת זמן ברשת)
-- security invoker: ההרשאות (RLS) חלות כרגיל
create or replace function app_data() returns json
language sql stable security invoker as $$
  select json_build_object(
    'branches', (select coalesce(json_agg(t order by t.name), '[]') from branches t),
    'rooms', (select coalesce(json_agg(t order by t.name), '[]') from rooms t),
    'instruments', (select coalesce(json_agg(t order by t.name), '[]') from instruments t),
    'teachers', (select coalesce(json_agg(t order by t.first_name), '[]') from teachers t),
    'teacher_instruments', (select coalesce(json_agg(t), '[]') from teacher_instruments t),
    'teacher_branches', (select coalesce(json_agg(t), '[]') from teacher_branches t),
    'teacher_hours', (select coalesce(json_agg(t order by t.weekday, t.start_time), '[]') from teacher_hours t),
    'students', (select coalesce(json_agg(t order by t.first_name), '[]') from students t),
    'contacts', (select coalesce(json_agg(t order by t.is_primary desc), '[]') from contacts t),
    'lessons', (select coalesce(json_agg(t order by t.weekday, t.start_time), '[]') from lessons t),
    'choirs', (select coalesce(json_agg(t order by t.weekday, t.start_time), '[]') from choirs t),
    'choir_enrollments', (select coalesce(json_agg(t order by t.created_at), '[]') from choir_enrollments t)
  )
$$;

-- נתוני תשלומים בקריאה אחת. p_student = null: כל התלמידים
create or replace function billing_data(p_student bigint default null) returns json
language sql stable security invoker as $$
  select json_build_object(
    'settings', (select row_to_json(s) from billing_settings s limit 1),
    'rates', (select coalesce(json_agg(r), '[]') from fund_rates r),
    'charges', (select coalesce(json_agg(c order by c.month desc, c.id), '[]') from charges c
                where p_student is null or c.student_id = p_student),
    'payments', (select coalesce(json_agg(p order by p.paid_on desc, p.id desc), '[]') from payments p
                 where p_student is null or p.student_id = p_student)
  )
$$;

grant execute on function app_data() to authenticated;
grant execute on function billing_data(bigint) to authenticated;
