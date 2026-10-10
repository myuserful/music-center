-- מורים: כמה שפות (רשימה) במקום שדה טקסט אחד
alter table teachers alter column languages drop default;
alter table teachers alter column languages type text[] using
  case when trim(languages) = '' then '{}'::text[]
       else regexp_split_to_array(trim(languages), '\s*[,/]\s*') end;
alter table teachers alter column languages set default '{}';
alter table teachers alter column languages set not null;

-- תלמידים: שפה, ברירת מחדל עברית
alter table students add column language text not null default 'עברית';
