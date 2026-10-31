-- בשינוי חדר בשעות העבודה של מורה, כל השיעורים שלו/ה בשעות האלה עוברים לחדר החדש גם אם החדר תפוס.
-- לכן מסירים את ההגבלה "שיעור אחד בחדר באותו יום ושעת התחלה" (החפיפה תוצג בלוח במקום לחסום).
-- בשיבוץ שיעור רגיל בדיקת "החדר תפוס" נשארת בקוד.
-- להרצה פעם אחת בלבד (אחרי 0034).
do $$
declare c record;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'lessons'::regclass and contype = 'u'
      and pg_get_constraintdef(oid) like '%room_id%'
  loop
    execute format('alter table lessons drop constraint %I', c.conname);
  end loop;
end $$;
