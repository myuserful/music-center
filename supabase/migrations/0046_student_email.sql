-- מייל לתלמיד/ה (חובה), או סימון שאין מייל.
-- להרצה אחרי 0045. אפשר להריץ שוב בלי נזק.
alter table students add column if not exists email text not null default '';
alter table students add column if not exists no_email boolean not null default false;
