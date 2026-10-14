-- תלמידים: סימון "לבדיקה" לרשומות שצריך לעבור עליהן.
-- (הייבוא עצמו ב-0012 עד 0022 מכיל פרטים אישיים ולכן לא נמצא ב-repo; כאן רק שינוי המבנה)
alter table students add column if not exists needs_review boolean not null default false;
