-- קבלות / חשבוניות להכנסות והוצאות: תמונה או מסמך, נשמרים ב-Storage בתיקייה פרטית
alter table transactions
  add column receipt_path text,
  add column receipt_name text not null default '';

-- תיקייה פרטית (צפייה רק דרך קישור זמני מהמערכת), עד 10MB לקובץ
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('receipts', 'receipts', false, 10485760, array[
  'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'image/gif',
  'application/pdf',
  'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
])
on conflict (id) do nothing;

create policy receipts_staff_select on storage.objects for select to authenticated using (bucket_id = 'receipts');
create policy receipts_staff_insert on storage.objects for insert to authenticated with check (bucket_id = 'receipts');
create policy receipts_staff_update on storage.objects for update to authenticated using (bucket_id = 'receipts');
create policy receipts_staff_delete on storage.objects for delete to authenticated using (bucket_id = 'receipts');
