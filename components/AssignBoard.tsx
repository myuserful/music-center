'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState, useTransition } from 'react';
import { quickAssign } from '@/lib/actions/assignments';
import { DAYS, STATUS_LABELS, type Status } from '@/lib/constants';
import { teacherGrid } from '@/lib/grid';
import { fmt } from '@/lib/time';

export type BoardTeacher = {
  id: number; name: string; room: string; branches: string[]; languages: string[];
  instruments: { id: number; name: string }[];
  hours: { weekday: number; start: number; end: number }[];
  lessons: { id: number; weekday: number; start: number; status: Status; student: string; instrument: string }[];
  choirs: { id: number; name: string; weekday: number; start: number; end: number }[];
};

export type BoardStudent = {
  id: number; name: string; age: string; status: string; undecided: boolean;
  instrumentId: number | null; instrument: string; branchId: number | null; branch: string; language: string;
  gender: 'boy' | 'girl' | null;
  preferred: string; notes: string; lessons: number; unassigned: boolean;
};

type Drop = { student: BoardStudent; teacher: BoardTeacher; weekday: number; start: number };
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
  const [choose, setChoose] = useState<Drop | null>(null); // בחירת כלי כשיש כמה אפשרויות
  const [busyCell, setBusyCell] = useState<string | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
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
      const res = await quickAssign({
        student_id: d.student.id, teacher_id: d.teacher.id, instrument_id: instrumentId,
        weekday: d.weekday, start_time: fmt(d.start),
      });
      setBusyCell(null);
      if (res.ok) {
        setPicked(null);
        setToast({ ok: true, text: `${d.student.name} שובץ/ה אצל ${d.teacher.name}, ${DAYS[d.weekday]} ${fmt(d.start)}` });
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
                e.dataTransfer.setData('text/plain', String(s.id));
                e.dataTransfer.effectAllowed = 'move';
                setDragging(s);
              }}
              onDragEnd={() => setDragging(null)}
              onClick={() => setPicked(picked?.id === s.id ? null : s)}
              title="גוררים למשבצת פנויה, או לוחצים ואז לוחצים על משבצת"
            >
              <div className="student-card-top">
                <strong>{s.name}</strong>
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
            return (
              <div key={t.id} className="card teacher-board">
                <div className="teacher-board-head">
                  <Link href={`/teachers/${t.id}`}><strong>{t.name}</strong></Link>
                  {t.branches.map((b) => <span key={b} className="chip chip-branch">⌂ {b}</span>)}
                  <span className="muted">{t.instruments.map((i) => i.name).join(', ')}{t.room && ` · ${t.room}`}</span>
                  {active && active.instrumentId && t.instruments.length > 0 && !t.instruments.some((i) => i.id === active.instrumentId) && (
                    <span className="badge badge-pending">לא מלמד/ת {active.instrument}</span>
                  )}
                  {active && active.language && t.languages.length > 0 && !t.languages.includes(active.language) && (
                    <span className="badge badge-pending">לא דובר/ת {active.language}</span>
                  )}
                </div>
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
                                    <Link href={`/lessons/${lesson.id}`} className={`slot slot-${lesson.status}`} title={STATUS_LABELS[lesson.status]}>
                                      {lesson.student}<small>{fmt(lesson.start)} · {lesson.instrument}</small>
                                    </Link>
                                  </td>
                                );
                              }
                              if (cell.kind === 'choir') {
                                return <td key={d} rowSpan={cell.span}><span className="slot slot-choir">{t.choirs[cell.index].name}</span></td>;
                              }
                              if (cell.kind === 'off') return <td key={d} className="off" />;
                              return (
                                <td
                                  key={d}
                                  rowSpan={cell.span}
                                  className={`drop${busyCell === key ? ' busy' : ''}${active ? ' ready' : ''}`}
                                  onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add('over'); }}
                                  onDragLeave={(e) => e.currentTarget.classList.remove('over')}
                                  onDrop={(e) => {
                                    e.preventDefault();
                                    e.currentTarget.classList.remove('over');
                                    const s = students.find((x) => x.id === Number(e.dataTransfer.getData('text/plain')));
                                    if (s) assign({ student: s, teacher: t, weekday: d, start: m });
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
