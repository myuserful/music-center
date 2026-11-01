'use client';

import { useEffect, useMemo, useState } from 'react';
import { addDayExtra, deleteDayExtra, moveStudent, reopenDay, saveDay, setDayTracks } from '@/lib/actions/day';
import { ConfirmButton } from './ConfirmButton';
import {
  ATTENDANCE_LABELS, ATTENDANCES, PAYMENT_TRACK_LABELS, PAYMENT_TRACKS, STATUS_LABELS, type PaymentTrack, type Status,
} from '@/lib/constants';
import { dayLabel, teacherPaidByRule, unknownTrackStudents, type DayRow } from '@/lib/day';
import { fmt, TIME_OPTIONS, toMin } from '@/lib/time';

export type DayTeacher = {
  id: number; name: string; rows: DayRow[]; saved: boolean; closedAt: string | null; scheduledCount: number;
  instrumentIds: number[]; roomId: number | null; firstTime: string | null;
  /** תוספות זמן למורה ביום הזה (לשכר) */
  extras: { id: number; minutes: number; reason: string }[];
  /** תלמידים שהועברו מהיום הזה ליום אחר (חד-פעמי) */
  movedOut: { studentId: number; date: string; label: string; teacherId: number; time: string | null; teacher: string | null }[];
};
export type DayStudent = {
  id: number; name: string; active: boolean; phone: string; requested: number | null; track: PaymentTrack;
  lessons: { id: number; teacher_id: number; instrument_id: number; status: Status }[];
};
type Named = { id: number; name: string };
type Props = {
  date: string; teachers: DayTeacher[]; students: DayStudent[]; instruments: Named[];
  /** כל המורים הפעילים, לבחירת ממלא/ת מקום */
  allTeachers: Named[];
  /** היום נסגר סופית: רק צפייה */
  locked: boolean;
  /** אפשר להעביר תלמיד/ה ליום אחר (0052 הורצה) */
  canMove: boolean;
};

export function DayBoard({ date, teachers, students, instruments, allTeachers, locked, canMove }: Props) {
  const studentMap = useMemo(() => new Map(students.map((s) => [s.id, s])), [students]);
  const instrumentName = useMemo(() => new Map(instruments.map((i) => [i.id, i.name])), [instruments]);
  const teacherName = useMemo(() => new Map(allTeachers.map((t) => [t.id, t.name])), [allTeachers]);
  return (
    <div className="day-cards">
      {teachers.map((t) => (
        // המפתח משתנה אחרי שמירה, כך שהעריכה מתחילה מחדש מהנתונים שנשמרו
        <TeacherDay
          key={`${t.id}:${t.closedAt}:${JSON.stringify(t.rows)}`}
          date={date} teacher={t} students={students} studentMap={studentMap}
          instruments={instruments} instrumentName={instrumentName}
          allTeachers={allTeachers} teacherName={teacherName} locked={locked} canMove={canMove}
        />
      ))}
    </div>
  );
}

type Row = DayRow & { key: number };
let nextKey = 1;
const strip = (rows: Row[]): DayRow[] => rows.map(({ key: _, ...r }) => r);
const fmtClosed = (iso: string) =>
  new Date(iso).toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem', day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' });

function TeacherDay({
  date, teacher: t, students, studentMap, instruments, instrumentName, allTeachers, teacherName, locked, canMove,
}: {
  date: string; teacher: DayTeacher; students: DayStudent[]; studentMap: Map<number, DayStudent>;
  instruments: Named[]; instrumentName: Map<number, string>; allTeachers: Named[]; teacherName: Map<number, string>;
  locked: boolean; canMove: boolean;
}) {
  const [rows, setRows] = useState<Row[]>(() => t.rows.map((r) => ({ ...r, key: nextKey++ })));
  const [query, setQuery] = useState('');
  // השורה שפתוחה בה העברה חד-פעמית ליום אחר
  const [moving, setMoving] = useState<number | null>(null);
  const dirty = JSON.stringify(strip(rows)) !== JSON.stringify(t.rows);
  const closed = t.closedAt !== null || locked;

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const update = (key: number, patch: Partial<DayRow>) =>
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  // משולם למורה: לפי הכלל (הגיע/ה, לא הגיע/ה, ביטול מראש באמצע היום), אלא אם סומן ביד
  const payRow = (r: DayRow) => ({ attendance: r.attendance, start_time: r.start_time, who: r.substitute_id ?? t.id });
  const ruleFor = (r: DayRow) => teacherPaidByRule(payRow(r), rows.map(payRow));
  const isPaid = (r: DayRow) => r.teacher_paid ?? ruleFor(r);
  // סימון ידני שזהה לכלל לא נשמר כסימון (כך שאם הנוכחות משתנה, הכלל ממשיך לקבוע)
  const setPaid = (r: Row, v: boolean) => update(r.key, { teacher_paid: v === ruleFor(r) ? null : v });

  const inDay = new Set(rows.map((r) => r.student_id));
  const q = query.trim();
  const matches = q.length < 2 ? [] : students
    .filter((s) => !inDay.has(s.id) && s.name.includes(q))
    .sort((a, b) => Number(b.active) - Number(a.active))
    .slice(0, 8);

  const add = (s: DayStudent) => {
    // שיעור קיים של התלמיד/ה אצל המורה הזה (למשל שיעור השלמה) - כדי שהחיוב יקושר אליו
    const lesson = s.lessons.find((l) => l.teacher_id === t.id);
    const known = [...s.lessons.map((l) => l.instrument_id), ...(s.requested ? [s.requested] : [])];
    const instrument = lesson?.instrument_id ?? known.find((i) => t.instrumentIds.includes(i)) ?? t.instrumentIds[0] ?? known[0] ?? null;
    const times = rows.map((r) => r.start_time).filter(Boolean).map((x) => toMin(x!));
    const start = times.length ? fmt(Math.max(...times) + 30) : t.firstTime;
    setRows((rs) => [...rs, {
      key: nextKey++, lesson_id: lesson?.id ?? null, student_id: s.id, instrument_id: instrument,
      start_time: start, room_id: t.roomId, attendance: 'present', notes: '',
      // מי שמתווסף/ת ביום של מילוי מקום מלא - אצל אותו/ה ממלא/ת מקום
      substitute_id: daySub,
      teacher_paid: null,
      // שיעור שנוסף ליום (השלמה וכו') לא נספר בסבב של שיעור בזוג
      pair: false,
      moved_from: null, moved_from_teacher: null,
    }]);
    setQuery('');
  };

  // מילוי מקום לכל היום: כשכל השיעורים אצל אותו/ה ממלא/ת מקום
  const subs = [...new Set(rows.map((r) => r.substitute_id))];
  const daySub = rows.length > 0 && subs.length === 1 ? subs[0] : null;
  const mixedSubs = subs.length > 1;
  const substitutes = allTeachers.filter((x) => x.id !== t.id);
  const subName = (id: number | null) => (id ? teacherName.get(id) ?? '' : '');

  // תלמידים בלי מסלול תשלום: אי אפשר לסגור את היום עד שמעדכנים
  const noTrack = closed ? [] : unknownTrackStudents(rows, (id) => studentMap.get(id)?.track);

  const counts = ATTENDANCES.map((a) => ({ a, n: rows.filter((r) => r.attendance === a).length })).filter((x) => x.n);
  const printHref = `/daily/print?date=${date}&teacher=${t.id}`;

  const studentCell = (r: DayRow) => {
    const s = studentMap.get(r.student_id);
    const lesson = s?.lessons.find((l) => l.id === r.lesson_id);
    return (
      <>
        {/* בלשונית חדשה, כדי ששינויים שלא נשמרו ביום לא ילכו לאיבוד */}
        <a href={`/students/${r.student_id}`} target="_blank" rel="noreferrer" className="day-student"><strong>{s?.name}</strong></a>
        {s?.phone && <div className="muted nowrap" dir="ltr">{s.phone}</div>}
        {r.moved_from ? (
          <span className="chip chip-sub" title="העברה חד-פעמית, מערכת השעות הקבועה לא השתנתה">
            הועבר/ה מ{dayLabel(r.moved_from)}
            {r.moved_from_teacher && r.moved_from_teacher !== t.id && ` (${teacherName.get(r.moved_from_teacher) ?? ''})`}
          </span>
        ) : !r.lesson_id && <span className="chip chip-plain">נוסף ליום הזה</span>}
        {r.pair && <span className="chip chip-plain" title="שיעור בזוג: מכל 4 שיעורים, הרביעי חינם">👥 בזוג</span>}
        {lesson && lesson.status !== 'confirmed' && <span className={`badge badge-${lesson.status}`}>{STATUS_LABELS[lesson.status]}</span>}
      </>
    );
  };

  return (
    <section id={`t${t.id}`} className={`card day-card${closed ? ' day-closed' : ''}`}>
      <div className="day-head">
        <div>
          <h2>{t.name}</h2>
          <span className="muted">
            {rows.length} תלמידים{counts.length > 0 && ' · '}
            {counts.map((x) => `${ATTENDANCE_LABELS[x.a]} ${x.n}`).join(' · ')}
            {rows.length !== t.scheduledCount && ` · במערכת הקבועה: ${t.scheduledCount}`}
          </span>
          {daySub && <div><span className="chip chip-sub">מילוי מקום: {subName(daySub)}</span></div>}
          {mixedSubs && <div><span className="chip chip-sub">מילוי מקום בחלק מהשיעורים</span></div>}
        </div>
        <div className="actions">
          {locked ? <span className="badge badge-confirmed">נסגר סופית 🔒</span>
            : closed ? <span className="badge badge-confirmed">נסגר ✓ {fmtClosed(t.closedAt!)}</span>
            : t.saved ? <span className="badge badge-undecided">נשמר, עדיין פתוח</span>
            : <span className="badge badge-muted">לא נשמר</span>}
          {closed ? (
            <a className="btn btn-xs" href={printHref} target="_blank" rel="noreferrer">הדפסה (PDF)</a>
          ) : (
            // מדפיס את מה שבמסך, גם אחרי שהוסיפו/הורידו/שינו תלמידים ועוד לא שמרו
            <form method="post" action="/daily/print" target="_blank">
              <input type="hidden" name="date" value={date} />
              <input type="hidden" name="teacher" value={t.id} />
              <input type="hidden" name="rows" value={JSON.stringify(strip(rows))} />
              <input type="hidden" name="draft" value={dirty ? '1' : '0'} />
              <button className="btn btn-xs" title={dirty ? 'כולל שינויים שעוד לא נשמרו' : undefined}>הדפסה (PDF)</button>
            </form>
          )}
        </div>
      </div>

      {closed ? (
        <>
          <div className="table-wrap">
            <table className="day-table">
              <thead><tr><th>שעה</th><th>תלמיד/ה</th><th>כלי</th><th>לימד/ה</th><th>נוכחות</th><th>הערה</th></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.key} className={`att-${r.attendance}`}>
                    <td className="nowrap">{r.start_time ?? '—'}</td>
                    <td>{studentCell(r)}</td>
                    <td>{r.instrument_id ? instrumentName.get(r.instrument_id) : ''}</td>
                    <td>{r.substitute_id ? <span className="chip chip-sub">{subName(r.substitute_id)}</span> : <span className="muted">קבוע/ה</span>}</td>
                    <td>
                      {ATTENDANCE_LABELS[r.attendance]}
                      <div className={`pay-mark${isPaid(r) ? ' on' : ''}`}>{isPaid(r) ? 'משולם למורה' : 'לא משולם למורה'}</div>
                    </td>
                    <td>{r.notes}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!locked && (
            <form action={reopenDay} className="form-foot">
              <input type="hidden" name="date" value={date} />
              <input type="hidden" name="teacher_id" value={t.id} />
              <ConfirmButton className="btn btn-xs btn-danger" message={`לבטל את סגירת היום של ${t.name}? השיעורים שנשמרו נשארים, והיום חוזר להיות פתוח לעריכה`}>
                ביטול סגירת יום
              </ConfirmButton>
            </form>
          )}
        </>
      ) : (
        <form action={saveDay}>
          <input type="hidden" name="date" value={date} />
          <input type="hidden" name="teacher_id" value={t.id} />
          <input type="hidden" name="rows" value={JSON.stringify(strip(rows))} />
          <label className="day-sub">
            מילוי מקום לכל היום
            <select
              value={mixedSubs ? 'mixed' : daySub ?? ''} disabled={rows.length === 0}
              onChange={(e) => {
                if (e.target.value === 'mixed') return;
                const sub = Number(e.target.value) || null;
                setRows((rs) => rs.map((r) => ({ ...r, substitute_id: sub })));
              }}
            >
              <option value="">אין, {t.name} מלמד/ת</option>
              {mixedSubs && <option value="mixed" disabled>שונה לפי שיעור</option>}
              {substitutes.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
            </select>
          </label>
          <div className="table-wrap">
            <table className="day-table">
              <thead><tr><th>שעה</th><th>תלמיד/ה</th><th>כלי</th><th>לימד/ה</th><th>נוכחות</th><th>הערה</th><th /></tr></thead>
              <tbody>
                {rows.length === 0 && <tr><td colSpan={7} className="muted">אין שיעורים. אפשר להוסיף תלמיד/ה למטה</td></tr>}
                {rows.map((r) => [
                  <tr key={r.key} className={`att-${r.attendance}`}>
                    <td>
                      <select
                        aria-label="שעה" value={r.start_time ?? ''}
                        onChange={(e) => update(r.key, { start_time: e.target.value || null })}
                      >
                        <option value="">—</option>
                        {(r.start_time && !TIME_OPTIONS.includes(r.start_time) ? [r.start_time, ...TIME_OPTIONS] : TIME_OPTIONS)
                          .map((x) => <option key={x} value={x}>{x}</option>)}
                      </select>
                    </td>
                    <td>{studentCell(r)}</td>
                    <td>
                      <select
                        aria-label="כלי" value={r.instrument_id ?? ''}
                        onChange={(e) => update(r.key, { instrument_id: Number(e.target.value) || null })}
                      >
                        <option value="">—</option>
                        {instruments.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
                      </select>
                    </td>
                    <td>
                      <select
                        aria-label="מי לימד/ה" value={r.substitute_id ?? ''}
                        className={r.substitute_id ? 'sub-on' : ''}
                        onChange={(e) => update(r.key, { substitute_id: Number(e.target.value) || null })}
                      >
                        <option value="">קבוע/ה</option>
                        {substitutes.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                      </select>
                    </td>
                    <td>
                      <div className="att-seg" role="group" aria-label="נוכחות">
                        {ATTENDANCES.map((a) => (
                          <button
                            key={a} type="button" className={r.attendance === a ? `on att-btn-${a}` : ''}
                            aria-pressed={r.attendance === a} onClick={() => update(r.key, { attendance: a })}
                          >
                            {ATTENDANCE_LABELS[a]}
                          </button>
                        ))}
                      </div>
                      <label className={`pay-check${r.teacher_paid !== null ? ' manual' : ''}`} title="האם המורה מקבל/ת שכר על השיעור הזה. נקבע לפי הכלל, ואפשר לשנות">
                        <input type="checkbox" checked={isPaid(r)} onChange={(e) => setPaid(r, e.target.checked)} />
                        משולם למורה{r.teacher_paid !== null && ' (ידני)'}
                      </label>
                    </td>
                    <td>
                      <input
                        aria-label="הערה" value={r.notes} placeholder="הערה"
                        onChange={(e) => update(r.key, { notes: e.target.value })}
                      />
                    </td>
                    <td className="nowrap">
                      {canMove && (
                        <button
                          type="button" className={`btn btn-xs btn-ghost${moving === r.key ? ' on' : ''}`}
                          title="העברה חד-פעמית ליום אחר, לשעה אחרת או למורה אחר/ת" aria-expanded={moving === r.key}
                          onClick={() => setMoving(moving === r.key ? null : r.key)}
                        >
                          ⇄
                        </button>
                      )}
                      <button
                        type="button" className="btn btn-xs btn-ghost" title="הסרה מהיום הזה בלבד"
                        onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}
                      >
                        ✕
                      </button>
                    </td>
                  </tr>,
                  moving === r.key && (
                    <tr key={`move-${r.key}`} className="day-move">
                      <td colSpan={7}>
                        <strong>העברה חד-פעמית של {studentMap.get(r.student_id)?.name}</strong>
                        <span className="muted"> (מערכת השעות הקבועה לא משתנה)</span>
                        <div className="day-move-fields">
                          <input type="hidden" name="move_student" value={r.student_id} />
                          <label>ליום
                            <input type="date" name="to_date" defaultValue={date} />
                          </label>
                          <label>בשעה
                            <select name="to_time" defaultValue={r.start_time ?? ''}>
                              <option value="">—</option>
                              {(r.start_time && !TIME_OPTIONS.includes(r.start_time) ? [r.start_time, ...TIME_OPTIONS] : TIME_OPTIONS)
                                .map((x) => <option key={x} value={x}>{x}</option>)}
                            </select>
                          </label>
                          <label>אצל
                            <select name="to_teacher" defaultValue={t.id}>
                              {allTeachers.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                            </select>
                          </label>
                          <button className="btn btn-xs btn-primary" formAction={moveStudent}>העברה</button>
                          <button type="button" className="btn btn-xs btn-ghost" onClick={() => setMoving(null)}>ביטול</button>
                        </div>
                        {dirty && <p className="muted">השינויים שעשית בכרטיס הזה יישמרו יחד עם ההעברה</p>}
                      </td>
                    </tr>
                  ),
                ])}
              </tbody>
            </table>
          </div>

          <div className="day-add">
            <input
              type="search" value={query} onChange={(e) => setQuery(e.target.value)}
              placeholder="הוספת תלמיד/ה ליום הזה: חיפוש לפי שם" aria-label="חיפוש תלמיד/ה"
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); if (matches[0]) add(matches[0]); } }}
            />
            {matches.length > 0 && (
              <ul className="day-matches">
                {matches.map((s) => (
                  <li key={s.id}>
                    <button type="button" onClick={() => add(s)}>
                      {s.name}{!s.active && <span className="muted"> · לא פעיל/ה</span>}
                      {s.phone && <span className="muted" dir="ltr"> {s.phone}</span>}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {q.length >= 2 && matches.length === 0 && <p className="muted">לא נמצאו תלמידים</p>}
          </div>

          {noTrack.length > 0 && <TrackFix ids={noTrack} studentMap={studentMap} />}

          <div className="form-foot">
            {dirty && <span className="muted">יש שינויים שלא נשמרו</span>}
            <button className="btn" name="close" value="0">שמירה</button>
            <button
              className="btn btn-primary" name="close" value="1" disabled={noTrack.length > 0}
              title={noTrack.length ? 'קודם צריך לעדכן מסלול תשלום לתלמידים שמסומנים למעלה' : undefined}
            >
              סגירת יום ✓
            </button>
          </div>
        </form>
      )}

      {t.movedOut.length > 0 && (
        <div className="day-moved-out">
          <strong>הועברו מהיום הזה (חד-פעמי):</strong>
          <ul>
            {t.movedOut.map((m) => (
              <li key={`${m.studentId}:${m.date}`}>
                {studentMap.get(m.studentId)?.name} ←{' '}
                <a href={`/daily?date=${m.date}#t${m.teacherId}`}>{m.label}{m.time && ` ${m.time}`}{m.teacher && ` אצל ${m.teacher}`}</a>
              </li>
            ))}
          </ul>
        </div>
      )}

      <DayExtras date={date} teacher={t} locked={locked} />
    </section>
  );
}

/** בחירת מסלול תשלום (ברירת המחדל: פרטי) לתלמידים שאין להם, מתוך הכרטיס. בתוך הטופס של היום */
function TrackFix({ ids, studentMap }: { ids: number[]; studentMap: Map<number, DayStudent> }) {
  return (
    <div className="day-tracks" role="alert">
      <strong>אין מסלול תשלום, ולכן אי אפשר לסגור את היום:</strong>
      <ul>
        {ids.map((id) => (
          <li key={id}>
            <a href={`/students/${id}`} target="_blank" rel="noreferrer">{studentMap.get(id)?.name}</a>
            <select name={`track_${id}`} defaultValue="private" aria-label="מסלול תשלום">
              {PAYMENT_TRACKS.filter((x) => x !== 'unknown').map((x) => <option key={x} value={x}>{PAYMENT_TRACK_LABELS[x]}</option>)}
            </select>
          </li>
        ))}
      </ul>
      <button className="btn btn-xs btn-primary" formAction={setDayTracks}>עדכון מסלול תשלום</button>
      <span className="muted"> השינויים בשורות לא הולכים לאיבוד</span>
    </div>
  );
}

const QUICK_MINUTES = [10, 15, 30, 45, 60];

/** תוספת זמן למורה כבר בסגירת היום (נכנסת לשכר של החודש) */
function DayExtras({ date, teacher: t, locked }: { date: string; teacher: DayTeacher; locked: boolean }) {
  if (locked && !t.extras.length) return null;
  const total = t.extras.reduce((n, e) => n + e.minutes, 0);
  return (
    <div className="day-extras">
      <div className="day-extras-head">
        <strong>תוספת זמן למורה</strong>
        {total > 0 && <span className="chip chip-sub">סה&quot;כ +{total} דק&apos;</span>}
        {!locked && <span className="muted">נכנס לשכר. לשיעור שהתלמיד/ה לא הגיע/ה אליו אפשר גם לסמן &quot;משולם למורה&quot; בשורה</span>}
      </div>
      {t.extras.length > 0 && (
        <ul className="day-extras-list">
          {t.extras.map((e) => (
            <li key={e.id}>
              <form action={deleteDayExtra} className="inline">
                <input type="hidden" name="date" value={date} />
                <input type="hidden" name="teacher_id" value={t.id} />
                <input type="hidden" name="id" value={e.id} />
                +{e.minutes} דק&apos;{e.reason && <span className="muted"> · {e.reason}</span>}
                {!locked && <button className="btn btn-xs btn-ghost" title="מחיקת התוספת">✕</button>}
              </form>
            </li>
          ))}
        </ul>
      )}
      {!locked && (
        <form action={addDayExtra} className="day-extras-add">
          <input type="hidden" name="date" value={date} />
          <input type="hidden" name="teacher_id" value={t.id} />
          <input name="reason" placeholder="סיבה (לא חובה)" aria-label="סיבה" maxLength={200} />
          <input type="number" name="custom" min={1} max={600} placeholder="דקות" aria-label="כמה דקות" />
          <button className="btn btn-xs">הוספה</button>
          <span className="muted">או:</span>
          {QUICK_MINUTES.map((m) => (
            <button key={m} className="btn btn-xs" name="minutes" value={m}>+{m === 60 ? 'שעה' : `${m} דק'`}</button>
          ))}
        </form>
      )}
    </div>
  );
}
