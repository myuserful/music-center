-- אישור קבלה לקופה: התחום שכתוב באישור ("טיפולים בהבעה ויצירה" / "טיפולים באומנות").
-- expression = הבעה ויצירה (ברירת המחדל, כמו בכל האישורים הקודמים), art = אומנות.
-- להרצה אחרי 0049. אפשר להריץ שוב בלי נזק.
alter table receipt_certificates add column if not exists field text not null default 'expression';
