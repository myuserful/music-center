-- אישור קבלה לקופה שנשלח במייל: לאן ומתי (האחרון). ריק = עוד לא נשלח.
-- להרצה אחרי 0050. אפשר להריץ שוב בלי נזק.
alter table receipt_certificates add column if not exists emailed_to text not null default '';
alter table receipt_certificates add column if not exists emailed_at timestamptz;
