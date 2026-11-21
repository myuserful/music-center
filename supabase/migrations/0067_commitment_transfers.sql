-- לאומית: מתוך ההתחייבויות שההורים הביאו - כמה כבר העברנו לקופה.
-- מעבירים רק על שיעורים שכבר התקיימו: הורה יכול להביא בתחילת החודש 4 התחייבויות, ואחרי שיעור אחד מעבירים רק 1.
-- מעבר חד-פעמי: כל ההתחייבויות שכבר רשומות במערכת מסומנות כהועברו (אפשר לבטל בכרטיס התלמיד/ה).
-- להריץ אחרי 0066. אפשר להריץ שוב בלי נזק: הסימון של מה שכבר קיים קורה רק בהרצה הראשונה.

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_name = 'fund_commitments' and column_name = 'transferred'
  ) then
    alter table fund_commitments add column transferred smallint not null default 0;
    alter table fund_commitments add column transferred_on date;
    update fund_commitments set transferred = count, transferred_on = current_date;
  end if;
end $$;

alter table fund_commitments drop constraint if exists fund_commitments_transferred_check;
alter table fund_commitments add constraint fund_commitments_transferred_check
  check (transferred >= 0 and transferred <= count);

notify pgrst, 'reload schema';
