-- צ'אט פנימי בין ההנהלה למזכירה: הודעות, הודעות דחופות (נשארות למעלה עד שמסמנים "טופל"), ונקרא / לא נקרא.
-- להריץ אחרי 0067. אפשר להריץ שוב בלי נזק.

create table if not exists staff_messages (
  id          bigint generated always as identity primary key,
  body        text not null check (length(trim(body)) > 0 and length(body) <= 4000),
  urgent      boolean not null default false,
  sender_role text not null check (sender_role in ('admin', 'secretary')),
  sender_id   uuid default auth.uid() references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  read_at     timestamptz,   -- מתי הצד השני קרא
  handled_at  timestamptz    -- הודעה דחופה שטופלה
);

create index if not exists staff_messages_created_idx on staff_messages (created_at desc);

alter table staff_messages enable row level security;
drop policy if exists chat_select on staff_messages;
drop policy if exists chat_insert on staff_messages;
drop policy if exists chat_update on staff_messages;
drop policy if exists chat_delete on staff_messages;

create policy chat_select on staff_messages for select to authenticated using (is_staff());
create policy chat_insert on staff_messages for insert to authenticated
  with check (is_staff() and sender_id = auth.uid() and sender_role = app_role());
-- סימון נקרא / טופל
create policy chat_update on staff_messages for update to authenticated using (is_staff()) with check (is_staff());
-- מוחקים רק הודעה ששלחת (מנהל: כל הודעה)
create policy chat_delete on staff_messages for delete to authenticated
  using (is_admin() or sender_id = auth.uid());

notify pgrst, 'reload schema';
