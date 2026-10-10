-- תלמידים: מין, קופת חולים, ת"ז, הפניה ודיווח לקופה, והעדפות שעה (לפי טבלאות האקסל)
alter table students
  add column gender text check (gender in ('boy', 'girl')),
  add column health_fund text check (health_fund in ('maccabi', 'clalit', 'leumit', 'meuhedet', 'private')),
  add column health_plan text not null default '',
  add column id_number text not null default '',
  add column has_referral boolean not null default false,
  add column hmo_reported boolean not null default false,
  add column preferred_times text not null default '';
