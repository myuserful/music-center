import Link from 'next/link';
import { Flash, one, PageHead, type SP } from '@/components/ui';
import { withinHours } from '@/lib/availability';
import { BOARD_DAYS, DAYS, LESSON_MINUTES } from '@/lib/constants';
import { loadAll } from '@/lib/data';
import { createClient } from '@/lib/supabase/server';
import { fmt, hhmm, overlaps, toMin } from '@/lib/time';
import { fullName } from '@/lib/types';

export default async function SchedulePage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const db = await createClient();
  const all = await loadAll(db);
  const { maps } = all;

  const teacherId = Number(one(sp.teacher)) || null;
  const teacher = teacherId ? maps.teacher.get(teacherId) : undefined;
  const branchId = Number(one(sp.branch)) || (teacher ? null : all.branches[0]?.id ?? null);
  const roomIds = new Set(all.rooms.filter((r) => !branchId || r.branch_id === branchId).map((r) => r.id));

  const lessons = all.lessons.filter((l) => (teacher ? l.teacher_id === teacher.id : roomIds.has(l.room_id)));
  const choirs = all.choirs.filter((c) => (teacher ? c.teacher_id === teacher.id : roomIds.has(c.room_id)));
  const hours = teacher ? all.hours.filter((h) => h.teacher_id === teacher.id) : [];

  // טווח השעות בלוח לפי הנתונים בפועל
  const times = [
    ...lessons.map((l) => toMin(l.start_time)),
    ...choirs.flatMap((c) => [toMin(c.start_time), toMin(c.end_time) - LESSON_MINUTES]),
    ...(teacher ? hours : all.hours).flatMap((h) => [toMin(h.start_time), toMin(h.end_time) - LESSON_MINUTES]),
  ];
  const from = Math.floor(Math.min(14 * 60, ...times) / 30) * 30;
  const to = Math.max(19 * 60 + 30, ...times);
  const rows: number[] = [];
  for (let m = from; m <= to; m += 30) rows.push(m);

  return (
    <>
      <PageHead title="לוח שיעורים" sub={teacher ? `המערכת השבועית של ${fullName(teacher)}` : 'מבט שבועי לפי סניף'}>
        <Link className="btn btn-primary" href="/lessons/new">+ שיבוץ שיעור</Link>
      </PageHead>
      <Flash sp={sp} />

      <form className="filters card">
        <label>
          סניף
          <select name="branch" defaultValue={branchId ?? ''}>
            <option value="">כל הסניפים</option>
            {all.branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </label>
        <label>
          מורה (מציג גם מקומות פנויים)
          <select name="teacher" defaultValue={teacherId ?? ''}>
            <option value="">כל המורים</option>
            {all.teachers.filter((t) => t.active).map((t) => <option key={t.id} value={t.id}>{fullName(t)}</option>)}
          </select>
        </label>
        <button className="btn">הצגה</button>
      </form>

      <div className="card table-wrap">
        <table className="board">
          <thead>
            <tr>
              <th></th>
              {BOARD_DAYS.map((d) => <th key={d}>{DAYS[d]}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map((m) => (
              <tr key={m}>
                <td className="time">{fmt(m)}</td>
                {BOARD_DAYS.map((d) => {
                  const here = lessons.filter((l) => l.weekday === d && toMin(l.start_time) === m);
                  const choirHere = choirs.filter(
                    (c) => c.weekday === d && overlaps(m, m + 30, toMin(c.start_time), toMin(c.end_time)),
                  );
                  const working = teacher && withinHours(hours, d, m);
                  const isFree = working && here.length === 0 && choirHere.length === 0;
                  const cls = teacher ? (isFree ? 'free' : working ? '' : 'off') : '';
                  return (
                    <td key={d} className={cls}>
                      {here.map((l) => (
                        <Link key={l.id} href={`/lessons/${l.id}`} className={`slot slot-${l.status}`}>
                          {fullName(maps.student.get(l.student_id))}
                          <small>
                            {maps.instrument.get(l.instrument_id)?.name}
                            {teacher ? ` · ${maps.room.get(l.room_id)?.name}` : ` · ${maps.teacher.get(l.teacher_id)?.first_name}`}
                          </small>
                        </Link>
                      ))}
                      {choirHere.map((c) => (
                        <Link key={`c${c.id}`} href={`/choirs/${c.id}`} className="slot slot-choir">
                          {c.name}
                          {toMin(c.start_time) >= m && (
                            <small>{hhmm(c.start_time)}-{hhmm(c.end_time)}</small>
                          )}
                        </Link>
                      ))}
                      {isFree && (
                        <Link href={`/lessons/new?teacher=${teacher!.id}&day=${d}&time=${fmt(m)}`}>+ פנוי</Link>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
        <div className="legend">
          <span className="l-confirmed">סופי</span>
          <span className="l-pending">ממתין לאישור הורים</span>
          <span className="l-undecided">בהתלבטות</span>
          <span className="l-choir">מקהלה</span>
          {teacher && <span className="l-free">פנוי בשעות העבודה</span>}
        </div>
      </div>
    </>
  );
}
