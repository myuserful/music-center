-- טלפונים להורים לאישור השיבוץ: מצב השיחה לכל תלמיד/ה
-- to_call = צריך להתקשר, no_answer = התקשרנו ולא ענו
alter table students add column call_state text not null default 'to_call'
  check (call_state in ('to_call', 'no_answer'));
alter table students add column call_attempts integer not null default 0;
alter table students add column last_call_at timestamptz;
