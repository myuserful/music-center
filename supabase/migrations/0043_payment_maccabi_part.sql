-- בכל תשלום: כמה ממנו מיועד לזיכוי מכבי (95 ₪ לשיעור). השאר הולך לשיעורים הרגילים.
-- כך תשלום רגיל לא מכסה זיכוי מכבי שההורים עוד לא שילמו.
-- להרצה אחרי 0042. אפשר להריץ שוב בלי נזק.
alter table payments add column if not exists maccabi_amount numeric not null default 0;
alter table payments drop constraint if exists payments_maccabi_amount_check;
alter table payments add constraint payments_maccabi_amount_check check (maccabi_amount >= 0 and maccabi_amount <= amount);
