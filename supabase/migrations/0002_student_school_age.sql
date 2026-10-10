-- תלמידים: "כיתה" הופך ל"מקום לימודים", ותאריך לידה יכול להיות משוער (כשהוזן רק גיל)
alter table students rename column grade to school;
alter table students add column birth_date_approx boolean not null default false;
