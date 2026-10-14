import Link from 'next/link';
import { Empty, Flash, PageHead, StatusBadge, type SP } from '@/components/ui';
import {
  DAYS, DEFAULT_LANGUAGE, GENDER_LABELS, HEALTH_FUND_LABELS, STUDENT_STATUS_LABELS, STUDENT_STATUSES, type Gender, type StudentStatus,
} from '@/lib/constants';
import { loadAll } from '@/lib/data';
import { createClient } from '@/lib/supabase/server';
import { ageLabel } from '@/lib/age';
import { hhmm } from '@/lib/time';
import { filterStudents, queryString, studentFilters } from '@/lib/filters';
import { fullName } from '@/lib/types';

export default async function StudentsPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const f = studentFilters(sp);
  const { q, branch, gender, status, review } = f;
  const db = await createClient();
  const all = await loadAll(db);
  const { maps } = all;

  const students = filterStudents(all, f);

  return (
    <>
      <PageHead title="תלמידים" sub={`${students.length} תלמידים`}>
        <a className="btn" href={`/students/export${queryString(sp)}`} download>הורדה לאקסל</a>
        <Link className="btn btn-primary" href="/students/new">+ תלמיד/ה חדש/ה</Link>
      </PageHead>
      <Flash sp={sp} />

      <form className="filters card">
        <label>חיפוש (שם, ת"ז, הורה או טלפון)<input name="q" defaultValue={q} /></label>
        <label>
          סניף
          <select name="branch" defaultValue={branch ?? ''}>
            <option value="">הכל</option>
            {all.branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </label>
        <label>
          מין
          <select name="gender" defaultValue={gender}>
            <option value="">הכל</option>
            {(Object.keys(GENDER_LABELS) as Gender[]).map((g) => <option key={g} value={g}>{GENDER_LABELS[g]}</option>)}
          </select>
        </label>
        <label>
          סטטוס
          <select name="status" defaultValue={status}>
            <option value="">פעילים ומתלבטים</option>
            {STUDENT_STATUSES.map((x) => <option key={x} value={x}>{STUDENT_STATUS_LABELS[x]}</option>)}
            <option value="all">הכל</option>
          </select>
        </label>
        <label className="check"><input type="checkbox" name="review" value="1" defaultChecked={review} /> רק לבדיקה</label>
        <button className="btn">סינון</button>
      </form>

      <section className="card table-wrap">
        {students.length === 0 ? <Empty>לא נמצאו תלמידים</Empty> : (
          <table>
            <thead><tr><th>שם</th><th>סטטוס</th><th>גיל</th><th>מקום לימודים</th><th>סניף</th><th>קופה</th><th>איש קשר</th><th>שיבוצים</th><th>בדיקה</th></tr></thead>
            <tbody>
              {students.map((s) => {
                const c = all.primaryContact(s.id);
                const lessons = all.lessons.filter((l) => l.student_id === s.id);
                const enr = all.enrollments.filter((e) => e.student_id === s.id);
                return (
                  <tr key={s.id} className={s.status === 'inactive' ? 'inactive' : ''}>
                    <td><Link href={`/students/${s.id}`}><strong>{fullName(s) || '(ללא שם)'}</strong></Link>
                      {s.language && s.language !== DEFAULT_LANGUAGE && <div className="muted">{s.language}</div>}
                    </td>
                    <td><span className={`badge badge-student-${s.status}`}>{STUDENT_STATUS_LABELS[s.status]}</span></td>
                    <td title={s.birth_date_approx ? 'גיל משוער' : undefined}>{ageLabel(s.birth_date, s.birth_date_approx)}</td>
                    <td>{s.school}</td>
                    <td>{s.branch_id ? maps.branch.get(s.branch_id)?.name : ''}</td>
                    <td>
                      {s.health_fund && HEALTH_FUND_LABELS[s.health_fund]}{s.health_plan && ` · ${s.health_plan}`}
                      {s.health_fund && s.health_fund !== 'private' && !s.has_referral && <span className="badge badge-muted">חסרה הפניה</span>}
                    </td>
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
                    <td>{s.needs_review ? <span className="badge badge-review">לבדיקה</span> : <span className="muted">מאומת</span>}</td>
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
