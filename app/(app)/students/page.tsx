import Link from 'next/link';
import { Empty, Flash, one, PageHead, StatusBadge, type SP } from '@/components/ui';
import { DAYS } from '@/lib/constants';
import { loadAll } from '@/lib/data';
import { createClient } from '@/lib/supabase/server';
import { hhmm } from '@/lib/time';
import { fullName } from '@/lib/types';

export default async function StudentsPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const q = one(sp.q).trim();
  const branch = Number(one(sp.branch)) || null;
  const showInactive = one(sp.inactive) === '1';
  const db = await createClient();
  const all = await loadAll(db);
  const { maps } = all;

  const students = all.students.filter((s) =>
    (showInactive || s.active) &&
    (!branch || s.branch_id === branch) &&
    (!q || fullName(s).includes(q) || all.contacts.some((c) => c.student_id === s.id && (c.phone.includes(q) || c.name.includes(q)))),
  );

  return (
    <>
      <PageHead title="תלמידים" sub={`${students.length} תלמידים`}>
        <Link className="btn btn-primary" href="/students/new">+ תלמיד/ה חדש/ה</Link>
      </PageHead>
      <Flash sp={sp} />

      <form className="filters card">
        <label>חיפוש (שם, הורה או טלפון)<input name="q" defaultValue={q} /></label>
        <label>
          סניף
          <select name="branch" defaultValue={branch ?? ''}>
            <option value="">הכל</option>
            {all.branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </label>
        <label className="check"><input type="checkbox" name="inactive" value="1" defaultChecked={showInactive} /> כולל לא פעילים</label>
        <button className="btn">סינון</button>
      </form>

      <section className="card table-wrap">
        {students.length === 0 ? <Empty>לא נמצאו תלמידים</Empty> : (
          <table>
            <thead><tr><th>שם</th><th>כיתה</th><th>סניף</th><th>איש קשר</th><th>שיבוצים</th></tr></thead>
            <tbody>
              {students.map((s) => {
                const c = all.primaryContact(s.id);
                const lessons = all.lessons.filter((l) => l.student_id === s.id);
                const enr = all.enrollments.filter((e) => e.student_id === s.id);
                return (
                  <tr key={s.id} className={s.active ? '' : 'inactive'}>
                    <td><Link href={`/students/${s.id}`}><strong>{fullName(s)}</strong></Link></td>
                    <td>{s.grade}</td>
                    <td>{s.branch_id ? maps.branch.get(s.branch_id)?.name : ''}</td>
                    <td>{c ? <>{c.name} · <span dir="ltr">{c.phone}</span></> : ''}</td>
                    <td>
                      {lessons.length + enr.length === 0 && <span className="badge badge-muted">ללא שיבוץ</span>}
                      {lessons.map((l) => (
                        <div key={l.id}>
                          {maps.instrument.get(l.instrument_id)?.name} · {DAYS[l.weekday]} {hhmm(l.start_time)} <StatusBadge status={l.status} />
                        </div>
                      ))}
                      {enr.map((e) => (
                        <div key={`e${e.id}`}>{maps.choir.get(e.choir_id)?.name} <StatusBadge status={e.status} /></div>
                      ))}
                    </td>
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
