-- בכרטיס התלמיד/ה: חתמו על חוזה, ונלקחו פרטי אשראי.
-- להרצה פעם אחת (אפשר להריץ שוב בלי נזק).
alter table students add column if not exists contract_signed boolean not null default false;
alter table students add column if not exists card_on_file boolean not null default false;
