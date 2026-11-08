-- לאומית: התחייבויות שההורים הביאו, לפי כמות. כל התחייבות מכסה שיעור אחד, מהשיעור הראשון והלאה.
-- מה שנשאר אחרי השיעורים שהתקיימו = התחייבויות בעודף, שמכסות את השיעורים הבאים אוטומטית.
-- עד עכשיו סימנו התחייבות על כל שיעור (commitment_on בשורת החיוב): הסימונים עוברים לטבלה החדשה
-- (שורה לכל תאריך + מספר התחייבות, עם הכמות), והסימון בשורת החיוב מתנקה.
-- בפיקדון (כללית ומאוחדת) לא משתנה כלום.
-- להרצה אחרי 0061. אפשר להריץ שוב בלי נזק.

create table if not exists fund_commitments (
  id bigint generated always as identity primary key,
  student_id bigint not null references students(id) on delete cascade,
  received_on date not null default current_date,
  ref text not null default '',
  count smallint not null check (count > 0),
  notes text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists fund_commitments_student on fund_commitments (student_id);

alter table fund_commitments enable row level security;
drop policy if exists staff_all on fund_commitments;
create policy staff_all on fund_commitments for all to authenticated using (true) with check (true);

insert into fund_commitments (student_id, received_on, ref, count)
  select student_id, commitment_on, commitment_ref, count(*)
  from lesson_charges
  where kind = 'commitment' and commitment_on is not null
  group by student_id, commitment_on, commitment_ref;

update lesson_charges set commitment_on = null, commitment_ref = ''
  where kind = 'commitment' and commitment_on is not null;

notify pgrst, 'reload schema';
