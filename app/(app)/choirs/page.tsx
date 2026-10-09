import Link from 'next/link';
import { Empty, Flash, PageHead, type SP } from '@/components/ui';
import { CHOIR_CAPACITY, DAYS } from '@/lib/constants';
import { loadAll } from '@/lib/data';
import { createClient } from '@/lib/supabase/server';
import { hhmm } from '@/lib/time';
import { fullName } from '@/lib/types';

export default async function ChoirsPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const db = await createClient();
  const all = await loadAll(db);

  return (
    <>
      <PageHead title="מקהלות" sub={`מפגש קבוצתי שבועי, עד ${CHOIR_CAPACITY} ילדים ומורה אחד/ת`}>
        <Link className="btn btn-primary" href="/choirs/new">+ מקהלה חדשה</Link>
      </PageHead>
      <Flash sp={sp} />
      {all.choirs.length === 0 ? <section className="card"><Empty>אין מקהלות עדיין</Empty></section> : (
        <div className="grid grid-2">
          {all.choirs.map((c) => {
            const members = all.enrollments.filter((e) => e.choir_id === c.id);
            const confirmed = members.filter((e) => e.status === 'confirmed').length;
            const full = members.length >= CHOIR_CAPACITY;
            return (
              <Link key={c.id} href={`/choirs/${c.id}`} className="card" style={{ color: 'inherit', textDecoration: 'none' }}>
                <h2 style={{ marginBottom: 4 }}>{c.name}</h2>
                <div className="muted">{DAYS[c.weekday]} {hhmm(c.start_time)}-{hhmm(c.end_time)} · {all.roomLabel(c.room_id)}</div>
                <div className="muted">מורה: {fullName(all.maps.teacher.get(c.teacher_id))}</div>
                <div style={{ marginTop: 10 }}>
                  <strong>{members.length}/{CHOIR_CAPACITY}</strong> ילדים ({confirmed} סופיים){full && ' · מלאה'}
                </div>
                <div className={`capacity ${full ? 'full' : ''}`}><span style={{ width: `${(members.length / CHOIR_CAPACITY) * 100}%` }} /></div>
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}
