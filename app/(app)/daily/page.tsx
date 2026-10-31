import Link from 'next/link';
import { DayBoard, type DayTeacher, type DayStudent } from '@/components/DayBoard';
import { Empty, Flash, one, PageHead, type SP } from '@/components/ui';
import { isoDate } from '@/lib/age';
import { DAYS } from '@/lib/constants';
import { addDays, dayRows, dayTeacherIds, dmy, mobilePhone, scheduledRows, validDate, weekdayOf } from '@/lib/day';
import { loadAll, loadDay } from '@/lib/data';
import { createClient } from '@/lib/supabase/server';
import { fullName } from '@/lib/types';

/** סגירת יום: כל המורים של היום והשיעורים שלהם. מה שמשנים כאן חל רק על היום הזה */
export default async function DailyPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const dateParam = one(sp.date);
  const date = validDate(dateParam) ? dateParam : isoDate(new Date());
  const added = Number(one(sp.add)) || null;
  const db = await createClient();
  const [all, day] = await Promise.all([loadAll(db), loadDay(db, date)]);
  const { maps } = all;
  const weekday = weekdayOf(date);

  const closedAt = new Map(day.closures.map((c) => [c.teacher_id, c.closed_at]));
  // מורים עם שיעורים קבועים ביום הזה, מי שכבר נשמר לו משהו, ומורה שהוסיפו ידנית
  const teacherIds = dayTeacherIds(all.lessons, day.lessons, day.closures, date);
  if (added) teacherIds.add(added);

  const teachers: DayTeacher[] = [...teacherIds].map((id) => maps.teacher.get(id)!).filter(Boolean)
    .sort((a, b) => fullName(a).localeCompare(fullName(b), 'he'))
    .map((t) => {
      const closed = closedAt.has(t.id);
      const { rows, saved } = dayRows(day.lessons, all.lessons, t.id, date, closed);
      const hours = all.hours.filter((h) => h.teacher_id === t.id && h.weekday === weekday);
      return {
        id: t.id, name: fullName(t), rows, saved, closedAt: closedAt.get(t.id) ?? null,
        scheduledCount: scheduledRows(all.lessons, t.id, date).length,
        instrumentIds: all.teacherInstrumentIds(t.id),
        roomId: hours.find((h) => h.room_id)?.room_id ?? t.room_id,
        firstTime: hours[0]?.start_time.slice(0, 5) ?? null,
      };
    });

  const contactsOf = new Map<number, typeof all.contacts>();
  for (const c of all.contacts) contactsOf.set(c.student_id, [...(contactsOf.get(c.student_id) ?? []), c]);
  const students: DayStudent[] = all.students.map((s) => ({
    id: s.id, name: fullName(s), active: s.status === 'active', phone: mobilePhone(contactsOf.get(s.id) ?? []),
    lessons: all.lessons.filter((l) => l.student_id === s.id)
      .map((l) => ({ id: l.id, teacher_id: l.teacher_id, instrument_id: l.instrument_id, status: l.status })),
    requested: s.requested_instrument_id,
  }));

  const closedCount = teachers.filter((t) => t.closedAt).length;
  const others = all.teachers.filter((t) => t.active && !teacherIds.has(t.id))
    .sort((a, b) => fullName(a).localeCompare(fullName(b), 'he'));

  return (
    <>
      <PageHead
        title="סגירת יום"
        sub={`יום ${DAYS[weekday]} ${dmy(date)} · ${teachers.length} מורים · ${closedCount} נסגרו`}
      >
        <Link className="btn btn-xs" href={`/daily?date=${addDays(date, -1)}`}>→ יום קודם</Link>
        <form className="inline" method="get">
          <input type="date" name="date" defaultValue={date} aria-label="תאריך" />
          <button className="btn btn-xs">הצגה</button>
        </form>
        <Link className="btn btn-xs" href={`/daily?date=${addDays(date, 1)}`}>יום הבא ←</Link>
        {date !== isoDate(new Date()) && <Link className="btn btn-xs" href="/daily">היום</Link>}
        {teachers.length > 0 && (
          <a className="btn btn-primary" href={`/daily/print?date=${date}`} target="_blank" rel="noreferrer">
            הדפסת כל היום (PDF)
          </a>
        )}
      </PageHead>
      <Flash sp={sp} />
      {day.missingTables && (
        <div className="flash flash-error" role="alert">
          חסרות הטבלאות של סגירת יום: צריך להריץ את 0039_day_lessons.sql ב-Supabase. עד אז אפשר לראות ולהדפיס, אבל לא לשמור.
        </div>
      )}
      {!day.missingTables && day.missingSubstitute && (
        <div className="flash flash-error" role="alert">
          כדי לשמור מילוי מקום צריך להריץ את 0040_substitute_teacher.sql ב-Supabase.
        </div>
      )}

      {teachers.length === 0 ? <Empty>אין שיעורים קבועים ביום {DAYS[weekday]}</Empty> : (
        <DayBoard
          date={date}
          teachers={teachers}
          students={students}
          instruments={all.instruments.map((i) => ({ id: i.id, name: i.name }))}
          allTeachers={all.teachers.filter((t) => t.active).map((t) => ({ id: t.id, name: fullName(t) }))
            .sort((a, b) => a.name.localeCompare(b.name, 'he'))}
        />
      )}

      {others.length > 0 && (
        <form className="card filters no-print" method="get">
          <input type="hidden" name="date" value={date} />
          <label>
            הוספת מורה ליום הזה (למשל שיעור השלמה)
            <select name="add" defaultValue="" required>
              <option value="" disabled>בחירת מורה</option>
              {others.map((t) => <option key={t.id} value={t.id}>{fullName(t)}</option>)}
            </select>
          </label>
          <button className="btn">הוספה</button>
        </form>
      )}
    </>
  );
}
