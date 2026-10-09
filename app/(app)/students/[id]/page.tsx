import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ConfirmButton } from '@/components/ConfirmButton';
import { BackLink, Empty, Flash, PageHead, StatusActions, StatusBadge, type SP } from '@/components/ui';
import {
  addEnrollment, deleteEnrollment, deleteLesson, setEnrollmentStatus, setLessonStatus,
} from '@/lib/actions/assignments';
import { deleteContact, deleteStudent, saveContact, saveStudent } from '@/lib/actions/people';
import { CHOIR_CAPACITY, DAYS, STATUS_LABELS, STATUSES } from '@/lib/constants';
import { loadAll } from '@/lib/data';
import { createClient } from '@/lib/supabase/server';
import { hhmm } from '@/lib/time';
import { fullName, type Student } from '@/lib/types';

export default async function StudentPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SP }) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const db = await createClient();
  const all = await loadAll(db);
  const { maps } = all;
  const isNew = id === 'new';
  const s: Student | undefined = isNew
    ? { id: 0, first_name: '', last_name: '', grade: '', birth_date: null, branch_id: null, requested_instrument_id: null, notes: '', active: true }
    : maps.student.get(Number(id));
  if (!s) notFound();

  const here = `/students/${s.id}`;
  const contacts = all.contacts.filter((c) => c.student_id === s.id);
  const lessons = all.lessons.filter((l) => l.student_id === s.id);
  const enrollments = all.enrollments.filter((e) => e.student_id === s.id);
  const openChoirs = all.choirs.filter(
    (c) => !enrollments.some((e) => e.choir_id === c.id) &&
      all.enrollments.filter((e) => e.choir_id === c.id).length < CHOIR_CAPACITY,
  );

  return (
    <>
      <BackLink href="/students">כל התלמידים</BackLink>
      <PageHead title={isNew ? 'תלמיד/ה חדש/ה' : fullName(s)}>
        {!isNew && <Link className="btn btn-primary" href={`/lessons/new?student=${s.id}`}>+ שיבוץ שיעור</Link>}
      </PageHead>
      <Flash sp={sp} />

      <form action={saveStudent} className="card">
        {!isNew && <input type="hidden" name="id" value={s.id} />}
        <div className="form-grid">
          <label>שם פרטי<input name="first_name" defaultValue={s.first_name} required /></label>
          <label>שם משפחה<input name="last_name" defaultValue={s.last_name} required /></label>
          <label>כיתה<input name="grade" defaultValue={s.grade} placeholder="למשל ג'" /></label>
          <label>תאריך לידה<input name="birth_date" type="date" defaultValue={s.birth_date ?? ''} /></label>
          <label>
            סניף
            <select name="branch_id" defaultValue={s.branch_id ?? ''}>
              <option value="">לא נבחר</option>
              {all.branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </label>
          <label>
            כלי מבוקש
            <select name="requested_instrument_id" defaultValue={s.requested_instrument_id ?? ''}>
              <option value="">לא נבחר</option>
              {all.instruments.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
            </select>
          </label>
          <label className="check"><input type="checkbox" name="active" defaultChecked={s.active} /> פעיל/ה</label>
          {isNew && (
            <>
              <label className="wide" style={{ marginTop: 6 }}>איש קשר ראשי (אופציונלי)</label>
              <label>שם<input name="contact_name" /></label>
              <label>קרבה<input name="contact_relation" placeholder="אמא / אבא" /></label>
              <label>טלפון<input name="contact_phone" dir="ltr" /></label>
            </>
          )}
          <label className="wide">הערות<textarea name="notes" defaultValue={s.notes} /></label>
        </div>
        <div className="form-foot"><button className="btn btn-primary">שמירה</button></div>
      </form>

      {!isNew && (
        <>
          <div className="grid grid-2">
            <section className="card">
              <h2>שיעורים פרטיים</h2>
              {lessons.length === 0 ? <Empty>אין שיעורים</Empty> : (
                <ul className="list">
                  {lessons.map((l) => (
                    <li key={l.id}>
                      <div>
                        <Link href={`/lessons/${l.id}`}><strong>{maps.instrument.get(l.instrument_id)?.name}</strong> · {DAYS[l.weekday]} {hhmm(l.start_time)}</Link>
                        <div className="muted">{fullName(maps.teacher.get(l.teacher_id))} · {all.roomLabel(l.room_id)}</div>
                      </div>
                      <StatusBadge status={l.status} />
                      <StatusActions id={l.id} status={l.status} back={here} setAction={setLessonStatus} deleteAction={deleteLesson} />
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="card">
              <h2>מקהלות</h2>
              {enrollments.length === 0 ? <Empty>לא רשום/ה למקהלה</Empty> : (
                <ul className="list">
                  {enrollments.map((e) => {
                    const c = maps.choir.get(e.choir_id)!;
                    return (
                      <li key={e.id}>
                        <div>
                          <Link href={`/choirs/${c.id}`}><strong>{c.name}</strong></Link>
                          <div className="muted">{DAYS[c.weekday]} {hhmm(c.start_time)}-{hhmm(c.end_time)}</div>
                        </div>
                        <StatusBadge status={e.status} />
                        <StatusActions id={e.id} status={e.status} back={here} setAction={setEnrollmentStatus} deleteAction={deleteEnrollment} />
                      </li>
                    );
                  })}
                </ul>
              )}
              {openChoirs.length > 0 && (
                <form action={addEnrollment} className="row-form" style={{ marginTop: 12 }}>
                  <input type="hidden" name="student_id" value={s.id} />
                  <input type="hidden" name="back" value={here} />
                  <select name="choir_id" required aria-label="מקהלה">
                    {openChoirs.map((c) => (
                      <option key={c.id} value={c.id}>{c.name} ({DAYS[c.weekday]} {hhmm(c.start_time)})</option>
                    ))}
                  </select>
                  <select name="status" aria-label="סטטוס">
                    {STATUSES.map((x) => <option key={x} value={x}>{STATUS_LABELS[x]}</option>)}
                  </select>
                  <button className="btn btn-xs btn-primary">+ רישום</button>
                </form>
              )}
            </section>
          </div>

          <section className="card">
            <h2>אנשי קשר</h2>
            {contacts.length === 0 ? <Empty>אין אנשי קשר</Empty> : (
              <ul className="list">
                {contacts.map((c) => (
                  <li key={c.id}>
                    <span>
                      <strong>{c.name}</strong>{c.relation && ` (${c.relation})`}
                      {c.is_primary && <span className="chip">ראשי</span>}
                    </span>
                    <span>
                      {c.phone && <a href={`tel:${c.phone}`} dir="ltr">{c.phone}</a>}
                      {c.email && <> · <a href={`mailto:${c.email}`} dir="ltr">{c.email}</a></>}
                    </span>
                    <form action={deleteContact}>
                      <input type="hidden" name="id" value={c.id} />
                      <input type="hidden" name="student_id" value={s.id} />
                      <ConfirmButton className="btn btn-xs btn-danger" message={`למחוק את ${c.name}?`}>מחיקה</ConfirmButton>
                    </form>
                  </li>
                ))}
              </ul>
            )}
            <form action={saveContact} className="row-form" style={{ marginTop: 12 }}>
              <input type="hidden" name="student_id" value={s.id} />
              <label>שם<input name="name" required /></label>
              <label>קרבה<input name="relation" placeholder="אמא / אבא" /></label>
              <label>טלפון<input name="phone" dir="ltr" /></label>
              <label>אימייל<input name="email" type="email" dir="ltr" /></label>
              <label className="check"><input type="checkbox" name="is_primary" defaultChecked={contacts.length === 0} /> ראשי</label>
              <button className="btn btn-xs btn-primary">+ הוספה</button>
            </form>
          </section>

          <form action={deleteStudent}>
            <input type="hidden" name="id" value={s.id} />
            <ConfirmButton className="btn btn-danger" message={`למחוק את ${fullName(s)} וכל השיבוצים שלו/ה?`}>מחיקת תלמיד/ה</ConfirmButton>
          </form>
        </>
      )}
    </>
  );
}
