-- הנחת אחים: מסמנים בכרטיס התלמיד/ה, עם סכום לכל 4 שיעורים ותאריך שממנו סופרים.
-- ההנחה נרשמת כשורת חיוב שלילית מסוג sibling_discount.
-- להרצה אחרי 0058. אפשר להריץ שוב בלי נזק.

alter table students add column if not exists sibling_discount boolean not null default false;
alter table students add column if not exists sibling_discount_amount numeric not null default 25;
alter table students add column if not exists sibling_discount_from date;

alter table lesson_charges drop constraint if exists lesson_charges_kind_check;
alter table lesson_charges add constraint lesson_charges_kind_check
  check (kind in ('lesson', 'maccabi_later', 'deposit', 'manual', 'sibling_discount'));
