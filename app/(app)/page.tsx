import Link from 'next/link';
import { Empty, Flash, PageHead, type SP } from '@/components/ui';
import { DAYS } from '@/lib/constants';
import { loadAll } from '@/lib/data';
import { createClient } from '@/lib/supabase/server';
import { fmt, hhmm } from '@/lib/time';
import { fullName } from '@/lib/types';

export default async function Dashboard({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const db = await createClient();
  const all = await loadAll(db);
  const { maps } = all;

  const pending = [
    ...all.lessons.filter((l) => l.status === 'pending'),
    ...all.enrollments.filter((e) => e.status === 'pending'),
  ];
  const undecided = [
    ...all.lessons.filter((l) => l.status === 'undecided'),
    ...all.enrollments.filter((e) => e.status === 'undecided'),
  ];
  const teacherFree = all.teachers
    .filter((t) => t.active)
    .map((t) => ({ teacher: t, free: all.teacherFree(t.id) }))
    .filter((x) => x.free.length > 0)
    .sort((a, b) => b.free.length - a.free.length);
  const totalFree = teacherFree.reduce((n, x) => n + x.free.length, 0);

  const recentPending = all.lessons.filter((l) => l.status !== 'confirmed').slice(0, 8);

  return (
    <>
      <PageHead title="מסך ראשי" sub="מה דורש טיפול היום" />
      <Flash sp={sp} />

      <div className="grid grid-4" style={{ marginBottom: 18 }}>
        <Link href="/tracking?tab=none" className="stat stat-none">
          <div className="stat-num">{all.unassigned.length}</div>
          <div className="stat-label">תלמידים ללא שיבוץ</div>
        </Link>
        <Link href="/tracking?tab=pending" className="stat stat-pending">
          <div className="stat-num">{pending.length}</div>
          <div className="stat-label">ממתינים לאישור הורים</div>
        </Link>
        <Link href="/tracking?tab=undecided" className="stat stat-undecided">
          <div className="stat-num">{undecided.length}</div>
          <div className="stat-label">בהתלבטות</div>
        </Link>
        <Link href="/schedule" className="stat stat-free">
          <div className="stat-num">{totalFree}</div>
          <div className="stat-label">חצאי שעה פנויים אצל מורים</div>
        </Link>
      </div>

      <div className="grid grid-2">
        <section className="card">
          <h2>תלמידים ללא שיבוץ</h2>
          {all.unassigned.length === 0 ? <Empty>כל התלמידים משובצים 🎉</Empty> : (
            <ul className="list">
              {all.unassigned.slice(0, 10).map((s) => (
                <li key={s.id}>
                  <Link href={`/students/${s.id}`}>{fullName(s)}</Link>
                  <span className="muted">
                    {s.requested_instrument_id ? maps.instrument.get(s.requested_instrument_id)?.name : ''}
                    {s.branch_id ? ` · ${maps.branch.get(s.branch_id)?.name}` : ''}
                  </span>
                  <Link className="btn btn-xs" href={`/lessons/new?student=${s.id}`}>שיבוץ</Link>
                </li>
              ))}
            </ul>
          )}
          {all.unassigned.length > 10 && <Link href="/tracking?tab=none">לכל הרשימה ({all.unassigned.length})</Link>}
        </section>

        <section className="card">
          <h2>שיבוצים פתוחים</h2>
          {recentPending.length === 0 ? <Empty>אין שיעורים שממתינים לטיפול</Empty> : (
            <ul className="list">
              {recentPending.map((l) => (
                <li key={l.id}>
                  <Link href={`/students/${l.student_id}`}>{fullName(maps.student.get(l.student_id))}</Link>
                  <span className="muted">
                    {maps.instrument.get(l.instrument_id)?.name} · {DAYS[l.weekday]} {hhmm(l.start_time)}
                  </span>
                  <span className={`badge badge-${l.status}`}>{l.status === 'pending' ? 'ממתין' : 'בהתלבטות'}</span>
                </li>
              ))}
            </ul>
          )}
          <Link href="/tracking">למעקב שיבוץ</Link>
        </section>

        <section className="card" style={{ gridColumn: '1 / -1' }}>
          <h2>מקומות פנויים אצל מורים</h2>
          {teacherFree.length === 0 ? <Empty>אין מקומות פנויים (או שלא הוגדרו שעות עבודה)</Empty> : (
            <div className="table-wrap">
              <table>
                <thead><tr><th>מורה</th><th>כלים</th><th>פנויים</th><th>זמנים</th></tr></thead>
                <tbody>
                  {teacherFree.map(({ teacher: t, free }) => (
                    <tr key={t.id}>
                      <td><Link href={`/schedule?teacher=${t.id}`}>{fullName(t)}</Link></td>
                      <td>{all.teacherInstrumentIds(t.id).map((i) => maps.instrument.get(i)?.name).join(', ')}</td>
                      <td><strong>{free.length}</strong></td>
                      <td>
                        {free.slice(0, 8).map((s) => (
                          <Link key={`${s.weekday}-${s.start}`} className="chip"
                            href={`/lessons/new?teacher=${t.id}&day=${s.weekday}&time=${fmt(s.start)}`}>
                            {DAYS[s.weekday]} {fmt(s.start)}
                          </Link>
                        ))}
                        {free.length > 8 && <span className="muted"> +{free.length - 8}</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </>
  );
}
