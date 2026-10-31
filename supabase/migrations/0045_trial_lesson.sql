-- שיעור ניסיון: תלמיד/ה שהיה/תה בשיעור אחד ולא ממשיך/ה (ואנחנו מסכימים) משלם/ת רק מחיר שיעור ניסיון (55 ₪).
-- מסלול תשלום חדש trial, ומחיר במחירון. להרצה פעם אחת (אפשר להריץ שוב בלי נזק).
alter table students drop constraint if exists students_payment_track_check;
alter table students add constraint students_payment_track_check
  check (payment_track in ('private', 'maccabi_full', 'maccabi_split', 'fund_deposit', 'trial', 'unknown'));
alter table billing_settings add column if not exists price_trial numeric not null default 55;
notify pgrst, 'reload schema';
