import { BackLink, Empty, one, PageHead, type SP } from '@/components/ui';
import { PrintButton } from '@/components/PrintButton';
import { ageLabel } from '@/lib/age';
import { DAYS, STATUS_LABELS } from '@/lib/constants';
import { loadAll } from '@/lib/data';
import { createClient } from '@/lib/supabase/server';
import { hhmm } from '@/lib/time';
import { fullName } from '@/lib/types';

/** מערכת שעות להדפסה: דף לכל מורה, עם התלמידים, השעות והטלפונים */
export default async function TeacherPrintPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const all = await loadAll(await createClient());
  const { maps } = all;

  const teacherId = Number(one(sp.teacher)) || null;
  const branchId = Number(one(sp.branch)) || null;
  const finalOnly = one(sp.final) === '1';

  const roomBranch = (roomId: number) => maps.room.get(roomId)?.branch_id;
  const lessonsOf = (tid: number) => all.lessons
    .filter((l) => l.teacher_id === tid && (!finalOnly || l.status === 'confirmed') && (!branchId || roomBranch(l.room_id) === branchId));
  const choirsOf = (tid: number) => all.choirs
    .filter((c) => c.teacher_id === tid && (!branchId || roomBranch(c.room_id) === branchId));

  const teachers = all.teachers
    .filter((t) => (teacherId ? t.id === teacherId : t.active && lessonsOf(t.id).length + choirsOf(t.id).length > 0))
    .sort((a, b) => fullName(a).localeCompare(fullName(b), 'he'));

  const phones = (studentId: number) => all.contacts
    .filter((c) => c.student_id === studentId && c.phone)
    .sort((a, b) => Number(b.is_primary) - Number(a.is_primary))
    .map((c) => ({ id: c.id, label: c.relation || c.name, phone: c.phone }));

  const today = new Date().toLocaleDateString('he-IL', { timeZone: 'Asia/Jerusalem' });

  return (
    <>
      <div className="no-print">
        <BackLink href="/teachers">כל המורים</BackLink>
        <PageHead title="מערכות שעות להדפסה" sub={`${teachers.length} מורים · כל מורה בדף נפרד`}>
          <PrintButton />
        </PageHead>

        <form className="filters card">
          <label>
            מורה
            <select name="teacher" defaultValue={teacherId ?? ''}>
              <option value="">כל המורים עם שיבוצים</option>
              {all.teachers.filter((t) => t.active).map((t) => <option key={t.id} value={t.id}>{fullName(t)}</option>)}
            </select>
          </label>
          <label>
            סניף
            <select name="branch" defaultValue={branchId ?? ''}>
              <option value="">כל הסניפים</option>
              {all.branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </label>
          <label className="check"><input type="checkbox" name="final" value="1" defaultChecked={finalOnly} /> רק שיבוצים סופיים</label>
          <button className="btn">הצגה</button>
        </form>
      </div>

      {teachers.length === 0 && <Empty>אין מורים עם שיבוצים</Empty>}

      {teachers.map((t) => {
        const lessons = lessonsOf(t.id);
        const choirs = choirsOf(t.id);
        const days = [...new Set([...lessons.map((l) => l.weekday), ...choirs.map((c) => c.weekday)])].sort();
        return (
          <section key={t.id} className="card print-sheet">
            <div className="print-head">
              <h2>מערכת שעות · {fullName(t)}</h2>
              <span className="muted">{lessons.length} תלמידים{choirs.length > 0 && ` · ${choirs.length} מקהלות`} · הודפס {today}</span>
            </div>

            {days.length === 0 && <Empty>אין שיבוצים</Empty>}
            {days.map((d) => {
              const dayLessons = lessons.filter((l) => l.weekday === d).sort((a, b) => a.start_time.localeCompare(b.start_time));
              const dayChoirs = choirs.filter((c) => c.weekday === d);
              return (
                <div key={d} className="print-day">
                  <h3>יום {DAYS[d]}</h3>
                  <table className="print-table">
                    <thead>
                      <tr><th>שעה</th><th>תלמיד/ה</th><th>גיל</th><th>כלי</th><th>חדר</th><th>טלפונים</th><th>סטטוס</th></tr>
                    </thead>
                    <tbody>
                      {dayLessons.map((l) => {
                        const s = maps.student.get(l.student_id);
                        return (
                          <tr key={l.id}>
                            <td className="nowrap">{hhmm(l.start_time)}</td>
                            <td><strong>{fullName(s)}</strong></td>
                            <td className="nowrap">{s ? ageLabel(s.birth_date, s.birth_date_approx) : ''}</td>
                            <td>{maps.instrument.get(l.instrument_id)?.name}</td>
                            <td>{all.roomLabel(l.room_id)}</td>
                            <td>
                              {phones(l.student_id).map((p) => (
                                <div key={p.id} className="nowrap">{p.label && `${p.label}: `}<span dir="ltr">{p.phone}</span></div>
                              ))}
                            </td>
                            <td>{l.status === 'confirmed' ? '' : STATUS_LABELS[l.status]}</td>
                          </tr>
                        );
                      })}
                      {dayChoirs.map((c) => {
                        const members = all.enrollments.filter((e) => e.choir_id === c.id);
                        return (
                          <tr key={`c${c.id}`}>
                            <td className="nowrap">{hhmm(c.start_time)}-{hhmm(c.end_time)}</td>
                            <td colSpan={3}>
                              <strong>מקהלה: {c.name}</strong>
                              {members.map((e) => <div key={e.id}>{fullName(maps.student.get(e.student_id))}</div>)}
                            </td>
                            <td>{all.roomLabel(c.room_id)}</td>
                            <td>
                              {members.map((e) => (
                                <div key={e.id} className="nowrap"><span dir="ltr">{phones(e.student_id)[0]?.phone ?? '-'}</span></div>
                              ))}
                            </td>
                            <td></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              );
            })}
          </section>
        );
      })}
    </>
  );
}
