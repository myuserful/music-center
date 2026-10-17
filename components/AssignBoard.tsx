'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState, useTransition } from 'react';
import { changeLessonStatus, moveLesson, quickAssign, quickEnroll, removeLesson } from '@/lib/actions/assignments';
import { addHoursQuick, removeHoursQuick } from '@/lib/actions/people';
import { BOARD_DAYS, CHOIR_CAPACITY, DAYS, STATUS_LABELS, STATUSES, type Status } from '@/lib/constants';
import { teacherGrid } from '@/lib/grid';
import { fmt, QUARTER_TIME_OPTIONS } from '@/lib/time';

export type BoardTeacher = {
  id: number; name: string; room: string; branches: string[]; languages: string[];
  instruments: { id: number; name: string }[];
  hours: { id: number; weekday: number; start: number; end: number }[];
  lessons: {
    id: number; weekday: number; start: number; status: Status;
    studentId: number; student: string; instrumentId: number; instrument: string;
    age: string; studentNotes: string; preferred: string; lessonNotes: string;
    contacts: { name: string; relation: string; phone: string }[];
  }[];
  choirs: {
    id: number; name: string; weekday: number; start: number; end: number;
    members: { id: number; name: string }[];
  }[];
};

export type BoardStudent = {
  id: number; name: string; age: string; status: string; undecided: boolean;
  instrumentId: number | null; instrument: string; branchId: number | null; branch: string; language: string;
  gender: 'boy' | 'girl' | null;
  preferred: string; notes: string; lessons: number; unassigned: boolean;
};

type Drop = {
  student: Pick<BoardStudent, 'id' | 'name' | 'instrumentId'>; teacher: BoardTeacher; weekday: number; start: number;
  lessonId?: number; // הזזת שיעור קיים (במקום שיבוץ חדש)
};
type MovingLesson = BoardTeacher['lessons'][number] & { teacherId: number };
type Toast = { ok: boolean; text: string };

export function AssignBoard({
  teachers, students, initialSelected,
}: { teachers: BoardTeacher[]; students: BoardStudent[]; initialSelected: number[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState<number[]>(initialSelected);
  const [query, setQuery] = useState('');
  const [onlyUnassigned, setOnlyUnassigned] = useState(true);
  const [fBranch, setFBranch] = useState('');
  const [fGender, setFGender] = useState('');
  const [fInstrument, setFInstrument] = useState('');
  const [fLanguage, setFLanguage] = useState('');
  const [picked, setPicked] = useState<BoardStudent | null>(null); // בחירה בלחיצה (במקום גרירה)
  const [dragging, setDragging] = useState<BoardStudent | null>(null);
  const [moving, setMoving] = useState<MovingLesson | null>(null); // שיעור שנגרר
  const [choose, setChoose] = useState<Drop | null>(null); // בחירת כלי כשיש כמה אפשרויות
  const [busyCell, setBusyCell] = useState<string | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const [info, setInfo] = useState<{ lesson: BoardTeacher['lessons'][number]; teacher: string } | null>(null); // פרטי שיעור
  const [deleting, setDeleting] = useState(false);
  const [statusBusy, setStatusBusy] = useState<number | null>(null); // שיעור שהסטטוס שלו מתעדכן
  const [hoursOpen, setHoursOpen] = useState<number | null>(null); // מורה שפאנל שעות העבודה שלו פתוח
  const [hoursBusy, setHoursBusy] = useState(false);

  /** הוספה / מחיקה של שעות עבודה, ואז רענון הלוח */
  function changeHours(run: () => Promise<{ ok: true } | { ok: false; error: string }>, okText: string) {
    setHoursBusy(true);
    startTransition(async () => {
      const res = await run();
      setHoursBusy(false);
      setToast(res.ok ? { ok: true, text: okText } : { ok: false, text: res.error });
      if (res.ok) router.refresh();
    });
  }
  const [, startTransition] = useTransition();

  const byId = useMemo(() => new Map(teachers.map((t) => [t.id, t])), [teachers]);
  const shown = selected.map((id) => byId.get(id)).filter((t): t is BoardTeacher => !!t);

  // אפשרויות לסינון מתוך התלמידים עצמם
  const options = useMemo(() => {
    const uniq = <T,>(pairs: [T, string][]) => [...new Map(pairs).entries()].sort((a, b) => a[1].localeCompare(b[1], 'he'));
    return {
      branches: uniq(students.filter((s) => s.branchId).map((s) => [s.branchId!, s.branch])),
      instruments: uniq(students.filter((s) => s.instrumentId).map((s) => [s.instrumentId!, s.instrument])),
      languages: [...new Set(students.map((s) => s.language).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'he')),
    };
  }, [students]);
  const filtersOn = !!(fBranch || fGender || fInstrument || fLanguage || query);

  const visibleStudents = students.filter((s) =>
    (!onlyUnassigned || s.unassigned) &&
    (!fBranch || String(s.branchId) === fBranch) &&
    (!fGender || s.gender === fGender) &&
    (!fInstrument || String(s.instrumentId) === fInstrument) &&
    (!fLanguage || s.language === fLanguage) &&
    (!query || [s.name, s.instrument, s.branch, s.notes, s.preferred].some((v) => v.includes(query))),
  );

  function updateSelected(next: number[]) {
    setSelected(next);
    const url = new URL(window.location.href);
    if (next.length) url.searchParams.set('t', next.join(','));
    else url.searchParams.delete('t');
    window.history.replaceState(null, '', url);
  }

  function save(d: Drop, instrumentId: number) {
    const key = `${d.teacher.id}-${d.weekday}-${d.start}`;
    setBusyCell(key);
    setChoose(null);
    startTransition(async () => {
      const slot = { teacher_id: d.teacher.id, instrument_id: instrumentId, weekday: d.weekday, start_time: fmt(d.start) };
      const res = d.lessonId
        ? await moveLesson(d.lessonId, slot)
        : await quickAssign({ ...slot, student_id: d.student.id });
      setBusyCell(null);
      if (res.ok) {
        setPicked(null);
        const verb = d.lessonId ? 'הועבר/ה' : 'שובץ/ה';
        setToast({ ok: true, text: `${d.student.name} ${verb} אצל ${d.teacher.name}, ${DAYS[d.weekday]} ${fmt(d.start)}` });
        router.refresh();
      } else {
        setToast({ ok: false, text: res.error });
      }
    });
  }

  /** רישום תלמיד/ה למקהלה (גרירה לבלוק המקהלה) */
  function enroll(choir: BoardTeacher['choirs'][number], student: Pick<BoardStudent, 'id' | 'name'>) {
    if (choir.members.some((m) => m.id === student.id)) {
      setToast({ ok: false, text: `${student.name} כבר רשום/ה ל${choir.name}` });
      return;
    }
    const key = `choir-${choir.id}`;
    setBusyCell(key);
    startTransition(async () => {
      const res = await quickEnroll(choir.id, student.id);
      setBusyCell(null);
      if (res.ok) {
        setPicked(null);
        setToast({ ok: true, text: `${student.name} נרשם/ה למקהלה ${choir.name}` });
        router.refresh();
      } else {
        setToast({ ok: false, text: res.error });
      }
    });
  }

  /** שינוי סטטוס שיעור (למשל אישור השיבוץ) ישירות מהלוח */
  function setStatus(lesson: BoardTeacher['lessons'][number], next: Status) {
    setStatusBusy(lesson.id);
    startTransition(async () => {
      const res = await changeLessonStatus(lesson.id, next);
      setStatusBusy(null);
      if (res.ok) {
        setInfo((cur) => (cur?.lesson.id === lesson.id ? { ...cur, lesson: { ...cur.lesson, status: next } } : cur));
        setToast({ ok: true, text: `${lesson.student}: ${STATUS_LABELS[next]}` });
        router.refresh();
      } else {
        setToast({ ok: false, text: res.error });
      }
    });
  }

  /** בחירת הכלי: הכלי המבוקש אם המורה מלמד/ת אותו, או הכלי היחיד שלו/ה; אחרת שואלים */
  function assign(d: Drop) {
    const opts = d.teacher.instruments;
    if (opts.length === 0) {
      setToast({ ok: false, text: `ל${d.teacher.name} לא הוגדרו כלי נגינה.` });
      return;
    }
    const requested = opts.find((i) => i.id === d.student.instrumentId);
    if (requested) return save(d, requested.id);
    if (opts.length === 1) return save(d, opts[0].id);
    setChoose(d);
  }

  return (
    <div className="assign">
      {/* צד תלמידים */}
      <aside className="assign-students card">
        <div className="assign-students-head">
          <input placeholder="חיפוש תלמיד/ה, כלי, הערה..." value={query} onChange={(e) => setQuery(e.target.value)} />
          <label className="check">
            <input type="checkbox" checked={onlyUnassigned} onChange={(e) => setOnlyUnassigned(e.target.checked)} />
            רק ללא שיבוץ
          </label>
          <div className="assign-filters">
            <select value={fBranch} onChange={(e) => setFBranch(e.target.value)} aria-label="סניף">
              <option value="">כל הסניפים</option>
              {options.branches.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
            </select>
            <select value={fGender} onChange={(e) => setFGender(e.target.value)} aria-label="מין">
              <option value="">בנים ובנות</option>
              <option value="boy">בנים</option>
              <option value="girl">בנות</option>
            </select>
            <select value={fInstrument} onChange={(e) => setFInstrument(e.target.value)} aria-label="כלי">
              <option value="">כל הכלים</option>
              {options.instruments.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
            </select>
            <select value={fLanguage} onChange={(e) => setFLanguage(e.target.value)} aria-label="שפה">
              <option value="">כל השפות</option>
              {options.languages.map((l) => <option key={l} value={l}>{l}</option>)}
            </select>
          </div>
          <div className="assign-count">
            <span className="muted">{visibleStudents.length} תלמידים</span>
            {filtersOn && (
              <button type="button" className="btn btn-xs" onClick={() => {
                setFBranch(''); setFGender(''); setFInstrument(''); setFLanguage(''); setQuery('');
              }}>ניקוי סינון</button>
            )}
          </div>
        </div>
        <div className="student-cards">
          {visibleStudents.length === 0 && <p className="empty">אין תלמידים להצגה</p>}
          {visibleStudents.map((s) => (
            <div
              key={s.id}
              className={`student-card${picked?.id === s.id ? ' picked' : ''}${s.undecided ? ' undecided' : ''}`}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData('text/plain', `s:${s.id}`);
                e.dataTransfer.effectAllowed = 'move';
                setDragging(s);
              }}
              onDragEnd={() => setDragging(null)}
              onClick={() => setPicked(picked?.id === s.id ? null : s)}
              title="גוררים למשבצת פנויה, או לוחצים ואז לוחצים על משבצת"
            >
              <div className="student-card-top">
                <Link href={`/students/${s.id}`} className="student-card-name" draggable={false}
                  onClick={(e) => e.stopPropagation()} title="פתיחת כרטיס התלמיד/ה">
                  {s.name}
                </Link>
                {s.age && <span className="muted">{s.age}</span>}
              </div>
              <div className="student-card-tags">
                {s.instrument && <span className="chip">{s.instrument}</span>}
                {s.branch && <span className="chip chip-plain">{s.branch}</span>}
                {s.language && s.language !== 'עברית' && <span className="chip chip-plain">{s.language}</span>}
                {s.undecided && <span className="badge badge-student-undecided">{s.status}</span>}
                {s.lessons > 0 && <span className="badge badge-muted">{s.lessons} שיעורים</span>}
              </div>
              {s.preferred && <div className="student-card-note">⏰ {s.preferred}</div>}
              {s.notes && <div className="student-card-note">{s.notes}</div>}
            </div>
          ))}
        </div>
      </aside>

      {/* צד מורים */}
      <section className="assign-teachers">
        <div className="card assign-picker">
          <label>
            הוספת מורה ללוח
            <select
              value=""
              onChange={(e) => {
                const id = Number(e.target.value);
                if (id && !selected.includes(id)) updateSelected([...selected, id]);
              }}
            >
              <option value="">בחירה...</option>
              {teachers.filter((t) => !selected.includes(t.id)).map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}{t.instruments.length ? ` (${t.instruments.map((i) => i.name).join(', ')})` : ''}{t.branches.length ? ` · ${t.branches.join(', ')}` : ''}
                </option>
              ))}
            </select>
          </label>
          {shown.map((t) => (
            <span key={t.id} className="chip teacher-chip">
              {t.name}
              <button type="button" aria-label={`הסרת ${t.name}`} onClick={() => updateSelected(selected.filter((x) => x !== t.id))}>×</button>
            </span>
          ))}
          {picked && <span className="picked-hint">נבחר/ה: <strong>{picked.name}</strong>. לחצי על משבצת פנויה.</span>}
        </div>

        {toast && (
          <div className={`flash ${toast.ok ? 'flash-ok' : 'flash-error'}`} role="status" onClick={() => setToast(null)}>
            {toast.text}
          </div>
        )}

        {shown.length === 0 && <div className="card"><p className="empty">בחרי מורה אחד או כמה כדי לראות את הלוח שלהם.</p></div>}

        <div className="teacher-boards">
          {shown.map((t) => {
            const { days, rows, cells, slotRows } = teacherGrid(t.hours, t.lessons, t.choirs);
            const active = dragging ?? picked;
            const ready = !!active || !!moving;
            return (
              <div key={t.id} className="card teacher-board">
                <div className="teacher-board-head">
                  <Link href={`/teachers/${t.id}`}><strong>{t.name}</strong></Link>
                  {t.branches.map((b) => <span key={b} className="chip chip-branch">⌂ {b}</span>)}
                  <span className="muted">{t.instruments.map((i) => i.name).join(', ')}{t.room && ` · ${t.room}`}</span>
                  <button
                    type="button" className={`btn btn-xs ${hoursOpen === t.id ? 'btn-primary' : 'btn-ghost'}`}
                    onClick={() => setHoursOpen(hoursOpen === t.id ? null : t.id)} aria-expanded={hoursOpen === t.id}
                  >
                    🕒 שעות עבודה
                  </button>
                  {active && active.instrumentId && t.instruments.length > 0 && !t.instruments.some((i) => i.id === active.instrumentId) && (
                    <span className="badge badge-pending">לא מלמד/ת {active.instrument}</span>
                  )}
                  {active && active.language && t.languages.length > 0 && !t.languages.includes(active.language) && (
                    <span className="badge badge-pending">לא דובר/ת {active.language}</span>
                  )}
                </div>
                {(hoursOpen === t.id || t.hours.length === 0) && (
                  <HoursPanel
                    teacher={t} busy={hoursBusy}
                    onAdd={(weekday, start, end) => changeHours(
                      () => addHoursQuick(t.id, weekday, start, end), `נוספו שעות ל${t.name}: ${DAYS[weekday]} ${start}-${end}`)}
                    onRemove={(h) => {
                      const inside = t.lessons.filter((l) => l.weekday === h.weekday && l.start >= h.start && l.start < h.end).length;
                      const msg = `למחוק את השעות ${DAYS[h.weekday]} ${fmt(h.start)}-${fmt(h.end)}?` +
                        (inside ? `\nיש בשעות האלה ${inside} שיעורים. השיעורים לא יימחקו, אבל יישארו מחוץ לשעות העבודה.` : '');
                      if (confirm(msg)) changeHours(() => removeHoursQuick(h.id), 'שעות העבודה נמחקו');
                    }}
                  />
                )}
                {days.length === 0 ? <p className="empty">לא הוגדרו שעות עבודה</p> : (
                  <div className="table-wrap">
                    <table className="board mini-board">
                      <thead><tr><th></th>{days.map((d) => <th key={d}>{DAYS[d]}</th>)}</tr></thead>
                      <tbody>
                        {rows.map((m, ri) => (
                          <tr key={m} className={m % 60 === 0 ? 'hour-row' : ''}>
                            <td className="time">{slotRows.has(m) ? fmt(m) : ''}</td>
                            {days.map((d, di) => {
                              const cell = cells[ri][di];
                              const key = `${t.id}-${d}-${m}`;
                              if (cell.kind === 'covered') return null;
                              if (cell.kind === 'lesson') {
                                const lesson = t.lessons[cell.index];
                                return (
                                  <td key={d} rowSpan={cell.span}>
                                    <div
                                      className={`slot slot-${lesson.status} slot-movable${moving?.id === lesson.id ? ' moving' : ''}`}
                                      title={`${STATUS_LABELS[lesson.status]} · גוררים כדי להעביר לשעה או למורה אחר/ת`}
                                      draggable
                                      onDragStart={(e) => {
                                        e.dataTransfer.setData('text/plain', `l:${lesson.id}`);
                                        e.dataTransfer.effectAllowed = 'move';
                                        setMoving({ ...lesson, teacherId: t.id });
                                      }}
                                      onDragEnd={() => setMoving(null)}
                                      onClick={() => setInfo({ lesson, teacher: t.name })}
                                      role="button"
                                      tabIndex={0}
                                      onKeyDown={(e) => { if (e.key === 'Enter') setInfo({ lesson, teacher: t.name }); }}
                                    >
                                      <span className="slot-name">
                                        {lesson.student}
                                        {lesson.age && <span className="slot-age"> · {lesson.age}</span>}
                                        {(lesson.studentNotes || lesson.lessonNotes) && <span className="slot-note" aria-label="יש הערות"> ✎</span>}
                                      </span>
                                      <small>{fmt(lesson.start)} · {lesson.instrument}</small>
                                      {lesson.status !== 'confirmed' && (
                                        <button
                                          type="button" className="slot-confirm" draggable={false}
                                          disabled={statusBusy === lesson.id}
                                          onClick={(e) => { e.stopPropagation(); setStatus(lesson, 'confirmed'); }}
                                          onKeyDown={(e) => e.stopPropagation()}
                                          title="אישור השיבוץ (סופי)" aria-label={`אישור השיבוץ של ${lesson.student}`}
                                        >
                                          {statusBusy === lesson.id ? '…' : '✓'}
                                        </button>
                                      )}
                                    </div>
                                  </td>
                                );
                              }
                              if (cell.kind === 'choir') {
                                const choir = t.choirs[cell.index];
                                const full = choir.members.length >= CHOIR_CAPACITY;
                                return (
                                  <td
                                    key={d}
                                    rowSpan={cell.span}
                                    className={`choir-drop${full ? ' full' : ''}${picked ? ' ready' : ''}`}
                                    onDragOver={(e) => { if (!full) { e.preventDefault(); e.currentTarget.classList.add('over'); } }}
                                    onDragLeave={(e) => e.currentTarget.classList.remove('over')}
                                    onDrop={(e) => {
                                      e.preventDefault();
                                      e.currentTarget.classList.remove('over');
                                      const [kind, id] = e.dataTransfer.getData('text/plain').split(':');
                                      const s = students.find((x) => x.id === Number(id));
                                      if (kind === 's' && s) enroll(choir, s);
                                    }}
                                    onClick={() => (picked ? enroll(choir, picked) : router.push(`/choirs/${choir.id}`))}
                                    title={full ? 'המקהלה מלאה' : 'גוררים לכאן תלמיד/ה כדי לרשום למקהלה'}
                                  >
                                    <div className="slot slot-choir">
                                      <span className="slot-name">♫ {choir.name}</span>
                                      <small>
                                        {busyCell === `choir-${choir.id}` ? 'רושם...' : `${choir.members.length}/${CHOIR_CAPACITY}${full ? ' · מלאה' : ''}`}
                                        {' · '}{fmt(choir.start)}-{fmt(choir.end)}
                                      </small>
                                      {choir.members.length > 0 && (
                                        <small className="choir-members">{choir.members.map((x) => x.name).join(', ')}</small>
                                      )}
                                    </div>
                                  </td>
                                );
                              }
                              if (cell.kind === 'off') return <td key={d} className="off" />;
                              return (
                                <td
                                  key={d}
                                  rowSpan={cell.span}
                                  className={`drop${busyCell === key ? ' busy' : ''}${ready ? ' ready' : ''}`}
                                  onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add('over'); }}
                                  onDragLeave={(e) => e.currentTarget.classList.remove('over')}
                                  onDrop={(e) => {
                                    e.preventDefault();
                                    e.currentTarget.classList.remove('over');
                                    const [kind, id] = e.dataTransfer.getData('text/plain').split(':');
                                    if (kind === 'l' && moving?.id === Number(id)) {
                                      setMoving(null);
                                      assign({
                                        student: { id: moving.studentId, name: moving.student, instrumentId: moving.instrumentId },
                                        teacher: t, weekday: d, start: m, lessonId: moving.id,
                                      });
                                      return;
                                    }
                                    const s = students.find((x) => x.id === Number(id));
                                    if (kind === 's' && s) assign({ student: s, teacher: t, weekday: d, start: m });
                                  }}
                                  onClick={() => picked && assign({ student: picked, teacher: t, weekday: d, start: m })}
                                  title={`שיבוץ ב-${fmt(m)}`}
                                >
                                  {busyCell === key ? 'שומר...' : fmt(m)}
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* בחירת כלי כשהמורה מלמד/ת כמה כלים */}
      {info && (
        <div className="modal-backdrop" onClick={() => setInfo(null)}>
          <div className="card modal lesson-info" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="פרטי השיעור">
            <h3>
              {info.lesson.student}
              {info.lesson.age && <span className="muted"> · גיל {info.lesson.age}</span>}
            </h3>
            <p className="muted">
              {info.lesson.instrument} אצל {info.teacher}, {DAYS[info.lesson.weekday]} {fmt(info.lesson.start)}
              {' · '}<span className={`badge badge-${info.lesson.status}`}>{STATUS_LABELS[info.lesson.status]}</span>
            </p>
            <div className="lesson-info-status">
              <span className="muted">סטטוס:</span>
              {STATUSES.map((st) => (
                <button
                  key={st} type="button" disabled={statusBusy === info.lesson.id || info.lesson.status === st}
                  className={`btn btn-xs ${info.lesson.status === st ? `badge-${st}` : st === 'confirmed' ? 'btn-primary' : ''}`}
                  onClick={() => setStatus(info.lesson, st)}
                >
                  {st === 'confirmed' && info.lesson.status !== 'confirmed' ? '✓ אישור השיבוץ' : STATUS_LABELS[st]}
                </button>
              ))}
            </div>
            {info.lesson.contacts.length > 0 ? (
              <div className="lesson-info-phones">
                {info.lesson.contacts.map((c) => (
                  <div key={c.phone}>
                    <span>{c.name}{c.relation && c.relation !== c.name && ` (${c.relation})`}</span>
                    <a href={`tel:${c.phone}`} dir="ltr">📞 {c.phone}</a>
                  </div>
                ))}
              </div>
            ) : <p className="muted">אין מספר טלפון</p>}
            {info.lesson.studentNotes && <p className="lesson-info-note"><strong>הערות:</strong> {info.lesson.studentNotes}</p>}
            {info.lesson.preferred && <p className="lesson-info-note"><strong>זמנים מועדפים:</strong> {info.lesson.preferred}</p>}
            {info.lesson.lessonNotes && <p className="lesson-info-note"><strong>הערות לשיעור:</strong> {info.lesson.lessonNotes}</p>}
            {!info.lesson.studentNotes && !info.lesson.lessonNotes && !info.lesson.preferred && <p className="muted">אין הערות</p>}
            <div className="modal-options">
              <Link className="btn btn-xs" href={`/students/${info.lesson.studentId}`}>כרטיס תלמיד/ה</Link>
              <Link className="btn btn-xs" href={`/lessons/${info.lesson.id}`}>עריכת השיעור</Link>
              <button
                type="button" className="btn btn-xs btn-danger" disabled={deleting}
                onClick={() => {
                  const l = info.lesson;
                  if (!confirm(`למחוק את השיעור של ${l.student} (${DAYS[l.weekday]} ${fmt(l.start)})?`)) return;
                  setDeleting(true);
                  startTransition(async () => {
                    const res = await removeLesson(l.id);
                    setDeleting(false);
                    if (res.ok) {
                      setInfo(null);
                      setToast({ ok: true, text: `השיעור של ${l.student} נמחק` });
                      router.refresh();
                    } else {
                      setToast({ ok: false, text: res.error });
                    }
                  });
                }}
              >
                {deleting ? 'מוחק...' : 'מחיקת השיעור'}
              </button>
            </div>
            <button type="button" className="btn btn-xs" onClick={() => setInfo(null)}>סגירה</button>
          </div>
        </div>
      )}

      {choose && (
        <div className="modal-backdrop" onClick={() => setChoose(null)}>
          <div className="card modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="בחירת כלי">
            <h3>איזה כלי?</h3>
            <p className="muted">
              {choose.student.name} אצל {choose.teacher.name}, {DAYS[choose.weekday]} {fmt(choose.start)}
            </p>
            <div className="modal-options">
              {choose.teacher.instruments.map((i) => (
                <button key={i.id} type="button" className="btn" onClick={() => save(choose, i.id)}>{i.name}</button>
              ))}
            </div>
            <button type="button" className="btn btn-xs" onClick={() => setChoose(null)}>ביטול</button>
          </div>
        </div>
      )}
    </div>
  );
}

/** פאנל שעות עבודה של מורה בלוח הגרירה: רשימה עם מחיקה, ושורת הוספה */
function HoursPanel({
  teacher, busy, onAdd, onRemove,
}: {
  teacher: BoardTeacher; busy: boolean;
  onAdd: (weekday: number, start: string, end: string) => void;
  onRemove: (h: BoardTeacher['hours'][number]) => void;
}) {
  const [weekday, setWeekday] = useState(BOARD_DAYS[0]);
  const [start, setStart] = useState('14:00');
  const [end, setEnd] = useState('19:00');
  const hours = [...teacher.hours].sort((a, b) => a.weekday - b.weekday || a.start - b.start);
  return (
    <div className="hours-panel">
      {hours.length > 0 && (
        <div className="hours-chips">
          {hours.map((h) => (
            <span key={h.id} className="chip hours-chip">
              {DAYS[h.weekday]} {fmt(h.start)}-{fmt(h.end)}
              <button type="button" className="hours-x" disabled={busy} onClick={() => onRemove(h)}
                aria-label={`מחיקת ${DAYS[h.weekday]} ${fmt(h.start)}-${fmt(h.end)}`} title="מחיקה">×</button>
            </span>
          ))}
        </div>
      )}
      <div className="row-form">
        <label>יום
          <select value={weekday} onChange={(e) => setWeekday(Number(e.target.value))}>
            {BOARD_DAYS.map((d) => <option key={d} value={d}>{DAYS[d]}</option>)}
          </select>
        </label>
        <label>משעה
          <select value={start} onChange={(e) => setStart(e.target.value)}>{QUARTER_TIME_OPTIONS.map((x) => <option key={x}>{x}</option>)}</select>
        </label>
        <label>עד שעה
          <select value={end} onChange={(e) => setEnd(e.target.value)}>{QUARTER_TIME_OPTIONS.map((x) => <option key={x}>{x}</option>)}</select>
        </label>
        <button type="button" className="btn btn-primary btn-xs" disabled={busy} onClick={() => onAdd(weekday, start, end)}>
          {busy ? 'שומר...' : '+ הוספת שעות'}
        </button>
      </div>
    </div>
  );
}
