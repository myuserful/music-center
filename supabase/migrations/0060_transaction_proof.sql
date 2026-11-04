-- אסמכתא להעברה (קובץ), בנפרד מהקבלה: לתשלום שכר שומרים את שתיהן.
-- להרצה אחרי 0059. אפשר להריץ שוב בלי נזק.

alter table transactions
  add column if not exists proof_path text,
  add column if not exists proof_name text not null default '';

notify pgrst, 'reload schema';
