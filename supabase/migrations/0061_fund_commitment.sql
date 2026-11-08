-- לאומית: בלי פיקדון. על כל שיעור צריך להביא התחייבות אחת (במקום כסף).
-- מסלול תשלום חדש fund_commitment, וסוג חיוב חדש commitment: שורה של 0 ₪ לכל שיעור, שנשארת "חסרה התחייבות"
-- עד שמסמנים עליה מספר התחייבות (commitment_on / commitment_ref, כמו בפיקדון).
-- מעבר חד-פעמי: תלמידי לאומית במסלול פיקדון עוברים למסלול החדש, והפיקדונות שעוד לא הביאו עליהם התחייבות
-- הופכים לשורות "התחייבות חסרה" של 0 ₪. מי ששילם פיקדון נשאר עם הכסף כזכות בחשבון = הסכום להחזיר.
-- פיקדונות שכבר הביאו עליהם התחייבות נשארים כמו שהם. קבלות ואישורים לא משתנים.
-- להרצה אחרי 0060. אפשר להריץ שוב בלי נזק.

alter table students drop constraint if exists students_payment_track_check;
alter table students add constraint students_payment_track_check
  check (payment_track in ('private', 'maccabi_full', 'maccabi_split', 'fund_deposit', 'fund_commitment', 'trial', 'unknown'));

alter table lesson_charges drop constraint if exists lesson_charges_kind_check;
alter table lesson_charges add constraint lesson_charges_kind_check
  check (kind in ('lesson', 'maccabi_later', 'deposit', 'commitment', 'manual', 'sibling_discount'));

-- מתי התקשרנו להורים להודיע על המעבר להתחייבויות (ריק = עוד לא)
alter table students add column if not exists commitment_notified_on date;

-- המעבר של לאומית
update students set payment_track = 'fund_commitment'
  where health_fund = 'leumit' and payment_track = 'fund_deposit';

update lesson_charges c set kind = 'commitment', amount = 0, track = 'fund_commitment'
  from students s
  where s.id = c.student_id and s.payment_track = 'fund_commitment'
    and c.kind = 'deposit' and c.commitment_on is null
    -- אם כבר יש שורת התחייבות לאותו שיעור (הרצה חוזרת), לא יוצרים כפילות
    and not exists (
      select 1 from lesson_charges x
      where x.kind = 'commitment' and x.student_id = c.student_id
        and x.teacher_id is not distinct from c.teacher_id and x.lesson_date = c.lesson_date
    );

-- פיקדונות שנמחקו ביד לא ייווצרו שוב גם כהתחייבות
do $$
begin
  if exists (select 1 from information_schema.tables where table_name = 'waived_charges') then
    update waived_charges w set kind = 'commitment'
      from students s
      where s.id = w.student_id and s.payment_track = 'fund_commitment' and w.kind = 'deposit'
        and not exists (
          select 1 from waived_charges x
          where x.kind = 'commitment' and x.student_id = w.student_id
            and x.teacher_id = w.teacher_id and x.lesson_date = w.lesson_date
        );
  end if;
end $$;

notify pgrst, 'reload schema';
