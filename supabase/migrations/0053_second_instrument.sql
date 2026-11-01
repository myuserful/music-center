-- כלי נוסף לתלמיד/ה (למשל אורגן וגם מקהלה).
-- להרצה פעם אחת בלבד (אחרי 0052).

alter table students
  add column if not exists second_instrument_id bigint references instruments(id) on delete set null;
