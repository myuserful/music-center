-- חדר שייך לשעות העבודה של המורה ביום מסוים, ולא למורה: כל יום המורה יכול/ה ללמד בחדר (ובסניף) אחר.
-- teachers.room_id נשאר במסד אבל המערכת כבר לא משתמשת בו.
-- להרצה פעם אחת בלבד (אחרי 0028).
alter table teacher_hours add column room_id bigint references rooms(id) on delete set null;

-- מילוי ראשוני: החדר הקבוע של המורה (אם היה)
update teacher_hours h set room_id = t.room_id
from teachers t
where t.id = h.teacher_id and t.room_id is not null;

-- אחרת: החדר שבו רוב השיעורים הקיימים באותן שעות עבודה
update teacher_hours h set room_id = (
  select l.room_id from lessons l
  where l.teacher_id = h.teacher_id and l.weekday = h.weekday
    and l.start_time >= h.start_time and l.start_time < h.end_time
  group by l.room_id
  order by count(*) desc, l.room_id
  limit 1
)
where h.room_id is null;
