-- מי עושה: מנהל, מנהלת, הנהלה (שניהם) או מזכירה, במקום יענקי / שבי / שניהם.
-- להריץ אחרי 0065_task_types.sql, ביחד עם העלאת הקוד החדש.

alter table tasks drop constraint if exists tasks_assignee_check;

update tasks set assignee = case assignee
  when 'yanky' then 'manager'
  when 'shevi' then 'manageress'
  when 'both' then 'management'
  else assignee
end
where assignee in ('yanky', 'shevi', 'both');

alter table tasks alter column assignee set default 'management';
alter table tasks add constraint tasks_assignee_check
  check (assignee in ('manager', 'manageress', 'management', 'secretary'));
