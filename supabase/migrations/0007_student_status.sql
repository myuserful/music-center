-- סטטוס תלמיד: פעיל / מתלבט / לא פעיל (במקום התיבה "פעיל/ה")
alter table students add column status text not null default 'active'
  check (status in ('active', 'undecided', 'inactive'));
update students set status = case when active then 'active' else 'inactive' end;
alter table students drop column active;
