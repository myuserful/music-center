-- פרטי חשבון בנק של המורים, להעברות שכר.
-- להרצה פעם אחת (אפשר להריץ שוב בלי נזק).
-- טקסט ולא מספר: מספרי סניף וחשבון יכולים להתחיל ב-0.

alter table teachers
  add column if not exists bank_name text not null default '',
  add column if not exists bank_branch text not null default '',
  add column if not exists bank_account text not null default '',
  add column if not exists bank_holder text not null default '';

notify pgrst, 'reload schema';
