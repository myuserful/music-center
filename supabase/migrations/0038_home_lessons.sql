-- לימוד בבית המורה: התלמיד/ה לומד/ת אצל המורה בבית ומשלם/ת דרך מקצב.
-- שיעור כזה לא תופס יום, שעה או חדר במערכת - רק מספר משבצת (1, 2, 3...) אצל המורה.
-- נשאר בטבלת lessons כדי שהחיובים, התשלומים והקופות יעבדו כרגיל.
-- להרצה פעם אחת בלבד (אחרי 0037).
alter table lessons add column at_home boolean not null default false;
alter table lessons add column home_slot smallint check (home_slot >= 1);

alter table lessons alter column room_id drop not null;
alter table lessons alter column weekday drop not null;
alter table lessons alter column start_time drop not null;

-- שיעור בבית: מספר משבצת בלי יום/שעה/חדר. שיעור רגיל: יום, שעה וחדר בלי מספר משבצת.
alter table lessons add constraint lessons_home_check check (
  (at_home and home_slot is not null and weekday is null and start_time is null and room_id is null)
  or (not at_home and home_slot is null and weekday is not null and start_time is not null and room_id is not null)
);

-- כל מספר משבצת פעם אחת אצל כל מורה
create unique index lessons_home_slot_unique on lessons (teacher_id, home_slot) where at_home;
