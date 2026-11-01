import Link from 'next/link';
import { DayBoard, type DayTeacher, type DayStudent } from '@/components/DayBoard';
import { ConfirmButton } from '@/components/ConfirmButton';
import { Empty, Flash, one, PageHead, type SP } from '@/components/ui';
import { lockWholeDay, unlockDay } from '@/lib/actions/day';
import { DAYS } from '@/lib/constants';
import {
  addDays, dayLabel, dayRows, dayTeacherIds, dmy, hoursLabel, israelToday, mobilePhone, scheduledRows, validDate, weekdayOf,
} from '@/lib/day';
import { autoLockOverdue } from '@/lib/dayLock';
import { loadAll, loadDay } from '@/lib/data';
import { createClient } from '@/lib/supabase/server';
import { fullName, type DayLock } from '@/lib/types';

/** סגירת יום: כל המורים של היום והשיעורים שלהם. מה שמשנים כאן חל רק על היום הזה */
export default async function DailyPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const dateParam = one(sp.date);
  const today = israelToday();
  const date = validDate(dateParam) ? dateParam : today;
  const db = await createClient();
  // ימים שלא נסגרו ביד נסגרים 24 שעות אחרי שנגמרו
  await autoLockOverdue(db);
  const [all, day] = await Promise.all([loadAll(db), loadDay(db, date)]);
  const { maps } = all;
  const weekday = weekdayOf(date);
  // יום שנפתח בחריגה לתיקון: פתוח כרגיל, עד שסוגרים אותו שוב
  const locked = day.lock && !day.lock.unlocked_at ? day.lock : null;
  const added = locked ? null : Number(one(sp.add)) || null;

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
        extras: day.extras.filter((e) => e.teacher_id === t.id).map((e) => ({ id: e.id, minutes: e.minutes ?? 0, reason: e.reason })),
        movedOut: day.movedOut.filter((m) => (m.moved_from_teacher ?? m.teacher_id) === t.id).map((m) => ({
          studentId: m.student_id, date: m.lesson_date, label: dayLabel(m.lesson_date), teacherId: m.teacher_id,
          time: m.start_time?.slice(0, 5) ?? null,
          teacher: m.teacher_id === t.id ? null : fullName(maps.teacher.get(m.teacher_id)),
        })),
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
  const others = locked ? [] : all.teachers.filter((t) => t.active && !teacherIds.has(t.id))
    .sort((a, b) => fullName(a).localeCompare(fullName(b), 'he'));

  return (
    <>
      <PageHead
        title="סגירת יום"
        sub={`יום ${DAYS[weekday]} ${dmy(date)} · ${teachers.length} מורים · ${locked ? 'היום נסגר סופית' : `${closedCount} נסגרו`}`}
      >
        <Link className="btn btn-xs" href={`/daily?date=${addDays(date, -1)}`}>→ יום קודם</Link>
        <form className="inline" method="get">
          <input type="date" name="date" defaultValue={date} aria-label="תאריך" />
          <button className="btn btn-xs">הצגה</button>
        </form>
        <Link className="btn btn-xs" href={`/daily?date=${addDays(date, 1)}`}>יום הבא ←</Link>
        {date !== today && <Link className="btn btn-xs" href="/daily">היום</Link>}
        {teachers.length > 0 && (
          <a className="btn btn-primary" href={`/daily/print?date=${date}`} target="_blank" rel="noreferrer">
            הדפסת כל היום (PDF)
          </a>
        )}
        {!locked && !day.missingLock && date <= today && (
          <form action={lockWholeDay} className="inline">
            <input type="hidden" name="date" value={date} />
            <ConfirmButton
              className="btn btn-primary"
              message={`לסגור סופית את ${dayLabel(date)}?

כל המורים שעוד לא נסגרו ייסגרו עם מה שנשמר (ומי שלא נשמר לו כלום - לפי המערכת הקבועה, כולם "הגיע/ה"), השיעורים יחויבו, ואחרי זה אי אפשר יותר לשנות את היום.

שינויים שלא שמרת בכרטיסים לא ייכללו.`}
            >
              סגירת כל היום 🔒
            </ConfirmButton>
          </form>
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

      {!day.missingTables && day.missingLock && (
        <div className="flash flash-error" role="alert">
          כדי לסגור את כל היום, להעביר תלמידים ליום אחר ולסגור ימים אוטומטית צריך להריץ את 0052_day_lock.sql ב-Supabase.
        </div>
      )}
      {locked && <DaySummary lock={locked} />}
      {day.lock?.unlocked_at && (
        <div className="flash flash-error" role="alert">
          היום הזה נפתח לתיקון אחרי שנסגר סופית. הוא לא ייסגר שוב אוטומטית: אחרי התיקון צריך ללחוץ על &quot;סגירת כל היום&quot;.
        </div>
      )}
      {!locked && !day.missingLock && date <= today && (
        <p className="muted no-print">
          אם לא סוגרים את היום ביד, הוא נסגר סופית אוטומטית 24 שעות אחרי שנגמר (בסוף {dayLabel(addDays(date, 1))}), עם מה שנשמר.
        </p>
      )}

      {teachers.length === 0 ? <Empty>אין שיעורים קבועים ביום {DAYS[weekday]}</Empty> : (
        <DayBoard
          date={date}
          locked={!!locked}
          canMove={!day.missingLock}
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

/** מה היה ביום שנסגר סופית (תמונת המצב מרגע הסגירה) */
function DaySummary({ lock }: { lock: DayLock }) {
  const s = lock.stats;
  const n = (v: number | undefined) => v ?? 0;
  const when = new Date(lock.locked_at).toLocaleString('he-IL', {
    timeZone: 'Asia/Jerusalem', day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit',
  });
  const tiles: { label: string; value: string | number; tone: string }[] = [
    { label: 'תלמידים הגיעו', value: n(s.students), tone: 'stat-free' },
    { label: `לא הגיעו (בלי הודעה)`, value: n(s.absent), tone: 'stat-none' },
    { label: 'ביטלו מראש', value: n(s.excused), tone: 'stat-pending' },
    { label: 'המורה ביטל/ה', value: n(s.cancelled), tone: 'stat-pending' },
    { label: 'מורים', value: n(s.teachers), tone: 'stat-undecided' },
    { label: 'שעות למורים (כולל תוספות)', value: hoursLabel(n(s.teacherMinutes)), tone: 'stat-undecided' },
    { label: 'חויב בסך הכול', value: `${n(s.charged).toLocaleString('he-IL')} ₪`, tone: 'stat-free' },
    { label: 'נוכחות', value: n(s.lessons) ? `${Math.round((n(s.present) / n(s.lessons)) * 100)}%` : '—', tone: 'stat-free' },
  ];
  const extras = [
    s.substitutes ? `${s.substitutes} במילוי מקום` : '',
    s.added ? `${s.added} נוספו ליום הזה` : '',
    s.moved ? `${s.moved} הועברו מיום אחר` : '',
    s.extraMinutes ? `${s.extraMinutes} דק' תוספות זמן למורים` : '',
    s.unbilled ? `${s.unbilled} שיעורים לא חויבו (מסלול תשלום לא ידוע)` : '',
  ].filter(Boolean);
  return (
    <section className="card day-summary">
      <h2>🔒 היום נסגר סופית {lock.auto ? '(אוטומטית)' : ''} · {when}</h2>
      <p className="muted">אי אפשר יותר לשנות את היום הזה: לא להוסיף מורים או תלמידים, לא להעביר ולא לבטל סגירה.</p>
      <div className="grid grid-4 dash-tiles">
        {tiles.map((t) => (
          <div key={t.label} className={`stat ${t.tone}`}>
            <div className="stat-num">{t.value}</div>
            <div className="stat-label">{t.label}</div>
          </div>
        ))}
      </div>
      {extras.length > 0 && <p className="muted">{extras.join(' · ')}</p>}
      <form action={unlockDay} className="form-foot no-print">
        <input type="hidden" name="date" value={lock.lesson_date} />
        <ConfirmButton
          className="btn btn-xs btn-danger"
          message={'לפתוח את היום הנעול לתיקון?\n\nזה רק לתיקון טעות. המורים נשארים סגורים (אפשר לבטל סגירה של מורה כדי לערוך), והיום לא ייסגר שוב אוטומטית: אחרי התיקון צריך ללחוץ שוב על "סגירת כל היום".'}
        >
          פתיחה לתיקון (חריג)
        </ConfirmButton>
      </form>
    </section>
  );
}
