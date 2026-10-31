import Link from 'next/link';
import { Empty } from '@/components/ui';
import { ATTENDANCE_LABELS, ATTENDANCES, DAYS, LESSON_MINUTES } from '@/lib/constants';
import { dmy, hoursLabel, isClosed, taughtBy, teacherDays, weekdayOf } from '@/lib/day';
import type { All } from '@/lib/data';
import { hhmm } from '@/lib/time';
import { fullName, type DayClosure, type DayLesson } from '@/lib/types';

type History = { lessons: DayLesson[]; closures: DayClosure[] };

const dayLabel = (date: string) => `${DAYS[weekdayOf(date)]} ${dmy(date)}`;
const dayLink = (d: { lesson_date: string; teacher_id: number }) => `/daily?date=${d.lesson_date}#t${d.teacher_id}`;

/** בחירת חודש להיסטוריה. "all" = הכול */
export function MonthPicker({ month, anchor }: { month: string; anchor: string }) {
  return (
    <form className="inline" method="get" action={`#${anchor}`}>
      <input type="month" name="month" defaultValue={month === 'all' ? '' : month} aria-label="חודש" />
      <button className="btn btn-xs">הצגה</button>
      <Link className="btn btn-xs btn-ghost" href={`?month=all#${anchor}`}>הכול</Link>
    </form>
  );
}

/** בדף התלמיד/ה: באילו שיעורים השתתף/ה בפועל (מסגירות היום) */
export function StudentHistory({ all, history, month }: { all: All; history: History; month: string }) {
  const { maps } = all;
  const closed = history.lessons.filter((d) => isClosed(d, history.closures));
  const open = history.lessons.length - closed.length;
  return (
    <section id="history" className="card">
      <div className="day-head">
        <h2>היסטוריית שיעורים</h2>
        <MonthPicker month={month} anchor="history" />
      </div>
      {history.lessons.length === 0 ? <Empty>אין שיעורים מסגירות יום {month === 'all' ? '' : 'בחודש הזה'}</Empty> : (
        <>
          <p className="muted">
            {ATTENDANCES.map((a) => ({ a, n: closed.filter((d) => d.attendance === a).length })).filter((x) => x.n)
              .map((x) => `${ATTENDANCE_LABELS[x.a]}: ${x.n}`).join(' · ') || 'אין ימים סגורים'}
            {open > 0 && ` · ${open} בימים שעוד לא נסגרו (לא נספרו)`}
          </p>
          <div className="table-wrap">
            <table className="day-table">
              <thead><tr><th>יום</th><th>שעה</th><th>מורה</th><th>כלי</th><th>נוכחות</th><th>הערה</th></tr></thead>
              <tbody>
                {history.lessons.map((d) => (
                  <tr key={d.id} className={`att-${d.attendance}`}>
                    <td className="nowrap">
                      <Link href={dayLink(d)}>{dayLabel(d.lesson_date)}</Link>
                      {!isClosed(d, history.closures) && <div><span className="badge badge-muted">היום לא נסגר</span></div>}
                    </td>
                    <td className="nowrap">{d.start_time ? hhmm(d.start_time) : '—'}</td>
                    <td>
                      {fullName(maps.teacher.get(taughtBy(d)))}
                      {d.substitute_id && <div><span className="chip chip-sub">מילוי מקום של {fullName(maps.teacher.get(d.teacher_id))}</span></div>}
                    </td>
                    <td>{d.instrument_id ? maps.instrument.get(d.instrument_id)?.name : ''}</td>
                    <td>{ATTENDANCE_LABELS[d.attendance]}</td>
                    <td>{d.notes}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}

/** בדף המורה: באילו ימים לימד/ה בפועל וכמה שעות */
export function TeacherHistory({ all, history, teacherId, month }: {
  all: All; history: History; teacherId: number; month: string;
}) {
  const { maps } = all;
  const days = teacherDays(history.lessons, teacherId, history.closures, LESSON_MINUTES);
  const worked = days.filter((d) => d.lessons.length);
  const closedDays = worked.filter((d) => d.closed);
  const openDays = worked.length - closedDays.length;
  const minutes = closedDays.reduce((n, d) => n + d.minutes, 0);
  const held = closedDays.reduce((n, d) => n + d.held, 0);
  const name = (id: number) => fullName(maps.teacher.get(id));

  return (
    <section id="history" className="card">
      <div className="day-head">
        <h2>ימי עבודה בפועל</h2>
        <MonthPicker month={month} anchor="history" />
      </div>
      {days.length === 0 ? <Empty>אין ימים מסגירות יום {month === 'all' ? '' : 'בחודש הזה'}</Empty> : (
        <>
          <div className="grid grid-4" style={{ marginBottom: 12 }}>
            <div className="stat"><div className="stat-num">{closedDays.length}</div><div className="stat-label">ימי עבודה (סגורים)</div></div>
            <div className="stat stat-free"><div className="stat-num">{hoursLabel(minutes)}</div><div className="stat-label">שעות</div></div>
            <div className="stat"><div className="stat-num">{held}</div><div className="stat-label">שיעורים שהמורה היה/תה בהם</div></div>
            <div className="stat stat-pending"><div className="stat-num">{openDays}</div><div className="stat-label">ימים שעוד לא נסגרו (לא נספרו)</div></div>
          </div>
          <p className="muted">שעות = שיעורים שהתלמיד/ה הגיע/ה או לא הגיע/ה בלי הודעה, {LESSON_MINUTES} דק׳ לשיעור. ביטול מראש וביטול של המורה לא נספרים.</p>
          <div className="table-wrap">
            <table className="day-table">
              <thead><tr><th>יום</th><th>שעות</th><th>שיעורים</th><th>מילוי מקום</th><th>פירוט</th></tr></thead>
              <tbody>
                {days.map((d) => {
                  const counts = ATTENDANCES.map((a) => ({ a, n: d.lessons.filter((r) => r.attendance === a).length })).filter((x) => x.n);
                  const times = d.lessons.map((r) => r.start_time).filter((x): x is string => !!x).map(hhmm);
                  return (
                    <tr key={d.date}>
                      <td className="nowrap">
                        <Link href={`/daily?date=${d.date}`}>{dayLabel(d.date)}</Link>
                        {d.lessons.length > 0 && !d.closed && <div><span className="badge badge-muted">היום לא נסגר</span></div>}
                      </td>
                      <td className="nowrap">
                        <strong>{hoursLabel(d.minutes)}</strong>
                        {times.length > 0 && <div className="muted">{times[0]}-{times.at(-1)}</div>}
                      </td>
                      <td>{counts.map((x) => `${ATTENDANCE_LABELS[x.a]} ${x.n}`).join(' · ') || '—'}</td>
                      <td>
                        {d.substituteFor.map((id) => <div key={id}><span className="chip chip-sub">מילא/ה מקום של {name(id)}</span></div>)}
                        {d.replaced.length > 0 && (
                          <div className="muted">
                            {[...new Set(d.replaced.map((r) => r.substitute_id!))].map((id) => name(id)).join(', ')} לימד/ה במקומו/ה ({d.replaced.length})
                          </div>
                        )}
                      </td>
                      <td>
                        {d.lessons.length > 0 && (
                          <details>
                            <summary>{d.lessons.length} תלמידים</summary>
                            <ul className="history-list">
                              {d.lessons.map((r) => (
                                <li key={r.id}>
                                  {r.start_time ? hhmm(r.start_time) : '—'}{' '}
                                  <Link href={`/students/${r.student_id}`}>{fullName(maps.student.get(r.student_id))}</Link>
                                  {' · '}{ATTENDANCE_LABELS[r.attendance]}
                                </li>
                              ))}
                            </ul>
                          </details>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
