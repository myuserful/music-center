-- השם ותעודת הזהות שעל ההפניה, כשהם שונים מהפרטים של התלמיד/ה.
-- אפשר לבחור בהם בהפקת אישור קבלה למכבי.
-- להרצה אחרי 0055. אפשר להריץ שוב בלי נזק.

alter table students add column if not exists referral_name text not null default '';
alter table students add column if not exists referral_id_number text not null default '';
