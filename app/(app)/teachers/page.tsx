import Link from 'next/link';
import { Empty, Flash, PageHead, type SP } from '@/components/ui';
import { DAYS } from '@/lib/constants';
import { loadAll } from '@/lib/data';
import { createClient } from '@/lib/supabase/server';
import { toMin } from '@/lib/time';
import { fullName } from '@/lib/types';

export default async function TeachersPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const db = await createClient();
  const all = await loadAll(db);

  return (
    <>
      <PageHead title="מורים" sub={`${all.teachers.filter((t) => t.active).length} מורים פעילים`}>
        <Link className="btn btn-primary" href="/teachers/new">+ מורה חדש/ה</Link>
      </PageHead>
      <Flash sp={sp} />
      <section className="card table-wrap">
        {all.teachers.length === 0 ? <Empty>אין מורים עדיין</Empty> : (
          <table>
            <thead><tr><th>שם</th><th>כלים</th><th>חדר</th><th>ימי עבודה</th><th>שיעורים</th><th>פנויים</th><th>טלפון</th></tr></thead>
            <tbody>
              {all.teachers.map((t) => {
                const hours = all.hours.filter((h) => h.teacher_id === t.id);
                const weeklyHours = hours.reduce((n, h) => n + toMin(h.end_time) - toMin(h.start_time), 0) / 60;
                const days = [...new Set(hours.map((h) => h.weekday))].map((d) => DAYS[d]).join(', ');
                return (
                  <tr key={t.id} className={t.active ? '' : 'inactive'}>
                    <td><Link href={`/teachers/${t.id}`}><strong>{fullName(t)}</strong></Link></td>
                    <td>{all.teacherInstrumentIds(t.id).map((i) => <span key={i} className="chip">{all.maps.instrument.get(i)?.name}</span>)}</td>
                    <td>{all.roomLabel(t.room_id)}</td>
                    <td>{days}{weeklyHours > 0 && <span className="muted"> ({weeklyHours} ש&quot;ש)</span>}</td>
                    <td>{all.lessons.filter((l) => l.teacher_id === t.id).length}</td>
                    <td><Link href={`/schedule?teacher=${t.id}`}>{all.teacherFree(t.id).length}</Link></td>
                    <td dir="ltr" style={{ textAlign: 'end' }}>{t.phone}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>
    </>
  );
}
