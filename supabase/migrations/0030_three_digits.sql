-- שדה "שלוש ספרות" לתלמיד/ה.
-- להרצה פעם אחת בלבד (אחרי 0029).
alter table students add column three_digits text not null default '';
