import Link from 'next/link';
import { Empty, Flash, one, PageHead, StatusActions, StatusBadge, type SP } from '@/components/ui';
import {
  deleteEnrollment, deleteLesson, setEnrollmentStatus, setLessonStatus,
} from '@/lib/actions/assignments';
import { DAYS, STATUS_LABELS, STATUSES, type Status } from '@/lib/constants';
import { loadAll } from '@/lib/data';
import { createClient } from '@/lib/supabase/server';
import { hhmm } from '@/lib/time';
import { fullName } from '@/lib/types';

type Tab = Status | 'none';

export default async function TrackingPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const tab = (one(sp.tab) || 'pending') as Tab;
  const back = `/tracking?tab=${tab}`;
  const db = await createClient();
  const all = await loadAll(db);
  const { maps } = all;

  const count = (s: Status) =>
    all.lessons.filter((l) => l.status === s).length + all.enrollments.filter((e) => e.status === s).length;

  const tabs: { key: Tab; label: string; n: number }[] = [
    { key: 'none', label: 'ללא שיבוץ', n: all.unassigned.length },
    ...STATUSES.map((s) => ({ key: s, label: STATUS_LABELS[s], n: count(s) })),
  ];

  const phone = (studentId: number) => {
    const c = all.primaryContact(studentId);
    return c ? (
      <span>{c.name}{c.relation ? ` (${c.relation})` : ''} · <a href={`tel:${c.phone}`} dir="ltr">{c.phone}</a></span>
    ) : <span className="muted">אין איש קשר</span>;
  };

  const lessons = tab === 'none' ? [] : all.lessons.filter((l) => l.status === tab);
  const enrollments = tab === 'none' ? [] : all.enrollments.filter((e) => e.status === tab);

  return (
    <>
      <PageHead title="מעקב שיבוץ" sub="תהליך אישור ההורים: ממתין ← סופי. סירוב הורים מוחק את השיבוץ." />
      <Flash sp={sp} />

      <nav className="tabs">
        {tabs.map((t) => (
          <Link key={t.key} href={`/tracking?tab=${t.key}`} className={tab === t.key ? 'active' : ''}>
            {t.label} ({t.n})
          </Link>
        ))}
      </nav>

      {tab === 'none' ? (
        <section className="card table-wrap">
          {all.unassigned.length === 0 ? <Empty>כל התלמידים הפעילים משובצים</Empty> : (
            <table>
              <thead><tr><th>תלמיד/ה</th><th>סניף</th><th>כלי מבוקש</th><th>איש קשר</th><th></th></tr></thead>
              <tbody>
                {all.unassigned.map((s) => (
                  <tr key={s.id}>
                    <td><Link href={`/students/${s.id}`}>{fullName(s)}</Link></td>
                    <td>{s.branch_id ? maps.branch.get(s.branch_id)?.name : ''}</td>
                    <td>{s.requested_instrument_id ? maps.instrument.get(s.requested_instrument_id)?.name : ''}</td>
                    <td>{phone(s.id)}</td>
                    <td><Link className="btn btn-xs" href={`/lessons/new?student=${s.id}&after=${encodeURIComponent(back)}`}>שיבוץ שיעור</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      ) : (
        <>
          <section className="card table-wrap">
            <h2>שיעורים פרטיים</h2>
            {lessons.length === 0 ? <Empty>אין שיעורים בסטטוס הזה</Empty> : (
              <table>
                <thead><tr><th>תלמיד/ה</th><th>שיעור</th><th>מורה</th><th>מתי</th><th>איש קשר</th><th>סטטוס</th><th></th></tr></thead>
                <tbody>
                  {lessons.map((l) => (
                    <tr key={l.id}>
                      <td><Link href={`/students/${l.student_id}`}>{fullName(maps.student.get(l.student_id))}</Link></td>
                      <td>{maps.instrument.get(l.instrument_id)?.name}</td>
                      <td>{fullName(maps.teacher.get(l.teacher_id))}</td>
                      <td><Link href={`/lessons/${l.id}`}>{DAYS[l.weekday]} {hhmm(l.start_time)}</Link><br /><span className="muted">{all.roomLabel(l.room_id)}</span></td>
                      <td>{phone(l.student_id)}</td>
                      <td><StatusBadge status={l.status} /></td>
                      <td><StatusActions id={l.id} status={l.status} back={back} setAction={setLessonStatus} deleteAction={deleteLesson} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          <section className="card table-wrap">
            <h2>רישום למקהלות</h2>
            {enrollments.length === 0 ? <Empty>אין רישומים בסטטוס הזה</Empty> : (
              <table>
                <thead><tr><th>תלמיד/ה</th><th>מקהלה</th><th>מתי</th><th>איש קשר</th><th>סטטוס</th><th></th></tr></thead>
                <tbody>
                  {enrollments.map((e) => {
                    const c = maps.choir.get(e.choir_id)!;
                    return (
                      <tr key={e.id}>
                        <td><Link href={`/students/${e.student_id}`}>{fullName(maps.student.get(e.student_id))}</Link></td>
                        <td><Link href={`/choirs/${c.id}`}>{c.name}</Link></td>
                        <td>{DAYS[c.weekday]} {hhmm(c.start_time)}-{hhmm(c.end_time)}</td>
                        <td>{phone(e.student_id)}</td>
                        <td><StatusBadge status={e.status} /></td>
                        <td><StatusActions id={e.id} status={e.status} back={back} setAction={setEnrollmentStatus} deleteAction={deleteEnrollment} /></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </section>
        </>
      )}
    </>
  );
}
