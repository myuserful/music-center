import Link from 'next/link';
import { Empty, Flash, PageHead, type SP } from '@/components/ui';
import {
  DAYS, INTEREST_LABELS, LANGUAGES, TEACHER_GENDER_LABELS, type Interest, type TeacherGender,
} from '@/lib/constants';
import { loadAll } from '@/lib/data';
import { createClient } from '@/lib/supabase/server';
import { toMin } from '@/lib/time';
import { filterTeachers, queryString, teacherFilters } from '@/lib/filters';
import { fullName } from '@/lib/types';

export default async function TeachersPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const db = await createClient();
  const all = await loadAll(db);

  const f = teacherFilters(sp);
  const { q, instrument, branch, gender, interest, language, youngBoys, showInactive } = f;

  // שפות לסינון: הרשימה הקבועה + שפות נוספות שהוזנו למורים
  const allLanguages = [...new Set([...LANGUAGES, ...all.teachers.flatMap((t) => t.languages)])];

  const teachers = filterTeachers(all, f);

  return (
    <>
      <PageHead title="מורים" sub={`${teachers.length} מתוך ${all.teachers.length} מורים`}>
        <Link className="btn" href="/teachers/print">הדפסת מערכות שעות</Link>
        <a className="btn" href={`/teachers/export${queryString(sp)}`} download>הורדה לאקסל</a>
        <Link className="btn btn-primary" href="/teachers/new">+ מורה חדש/ה</Link>
      </PageHead>
      <Flash sp={sp} />

      <form className="filters card">
        <label>חיפוש (שם, טלפון או הערות)<input name="q" defaultValue={q} /></label>
        <label>
          כלי
          <select name="instrument" defaultValue={instrument ?? ''}>
            <option value="">הכל</option>
            {all.instruments.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
          </select>
        </label>
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
            {(Object.keys(TEACHER_GENDER_LABELS) as TeacherGender[]).map((g) => (
              <option key={g} value={g}>{TEACHER_GENDER_LABELS[g]}</option>
            ))}
          </select>
        </label>
        <label>
          מעוניין/ת
          <select name="interest" defaultValue={interest}>
            <option value="all">הכל</option>
            {(Object.keys(INTEREST_LABELS) as Interest[]).map((x) => <option key={x} value={x}>{INTEREST_LABELS[x]}</option>)}
            <option value="unknown">לא ידוע</option>
          </select>
        </label>
        <label>
          שפה
          <select name="language" defaultValue={language}>
            <option value="">הכל</option>
            {allLanguages.map((l) => <option key={l} value={l}>{l}</option>)}
          </select>
        </label>
        <label className="check"><input type="checkbox" name="young_boys" value="1" defaultChecked={youngBoys} /> מלמדת בנים עד 9</label>
        <label className="check"><input type="checkbox" name="inactive" value="1" defaultChecked={showInactive} /> כולל לא פעילים</label>
        <button className="btn">סינון</button>
        <Link className="btn" href="/teachers">ניקוי</Link>
      </form>
      <section className="card table-wrap">
        {teachers.length === 0 ? <Empty>{all.teachers.length === 0 ? 'אין מורים עדיין' : 'לא נמצאו מורים'}</Empty> : (
          <table>
            <thead><tr><th>שם</th><th>כלים</th><th>סניפים</th><th>מעוניין/ת</th><th>מחיר</th><th>חדרים לפי ימים</th><th>ימי עבודה</th><th>שיעורים</th><th>פנויים</th><th>טלפון</th></tr></thead>
            <tbody>
              {teachers.map((t) => {
                const hours = all.hours.filter((h) => h.teacher_id === t.id);
                const weeklyHours = hours.reduce((n, h) => n + toMin(h.end_time) - toMin(h.start_time), 0) / 60;
                const days = [...new Set(hours.map((h) => h.weekday))].map((d) => DAYS[d]).join(', ');
                return (
                  <tr key={t.id} className={t.active ? '' : 'inactive'}>
                    <td><Link href={`/teachers/${t.id}`}><strong>{fullName(t)}</strong></Link>
                      {t.teaches_young_boys && <div className="muted">גם בנים עד 9</div>}
                      {t.languages.length > 0 && <div className="muted">{t.languages.join(', ')}</div>}
                    </td>
                    <td>{all.teacherInstrumentIds(t.id).map((i) => <span key={i} className="chip">{all.maps.instrument.get(i)?.name}</span>)}</td>
                    <td>{all.teacherBranchIds(t.id).map((b) => all.maps.branch.get(b)?.name).join(', ')}</td>
                    <td>{t.interest && INTEREST_LABELS[t.interest]}</td>
                    <td>{t.hourly_rate !== null && `₪${t.hourly_rate}`}</td>
                    <td>{all.teacherRooms(t.id).map((r) => <div key={r}>{r}</div>)}</td>
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
