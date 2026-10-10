import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ConfirmButton } from '@/components/ConfirmButton';
import { BackLink, Empty, Flash, PageHead, RoomOptions, StatusActions, StatusBadge, type SP } from '@/components/ui';
import {
  addEnrollment, deleteChoir, deleteEnrollment, saveChoir, setEnrollmentStatus,
} from '@/lib/actions/assignments';
import { BOARD_DAYS, CHOIR_CAPACITY, CHOIR_INSTRUMENT, DAYS, STATUS_LABELS, STATUSES } from '@/lib/constants';
import { loadAll } from '@/lib/data';
import { createClient } from '@/lib/supabase/server';
import { hhmm, TIME_OPTIONS } from '@/lib/time';
import { fullName, type Choir } from '@/lib/types';

export default async function ChoirPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SP }) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const db = await createClient();
  const all = await loadAll(db);
  const { maps } = all;
  const isNew = id === 'new';
  const c: Partial<Choir> | undefined = isNew ? { name: '', notes: '' } : maps.choir.get(Number(id));
  if (!c) notFound();

  const choirInstrument = all.instruments.find((i) => i.name === CHOIR_INSTRUMENT);
  const choirTeachers = all.teachers.filter(
    (t) => (t.active || t.id === c.teacher_id) && choirInstrument && all.teacherInstrumentIds(t.id).includes(choirInstrument.id),
  );
  const here = `/choirs/${id}`;
  const members = all.enrollments.filter((e) => e.choir_id === c.id);
  const memberIds = new Set(members.map((e) => e.student_id));
  const candidates = all.students.filter((s) => s.status !== 'inactive' && !memberIds.has(s.id));
  const full = members.length >= CHOIR_CAPACITY;

  return (
    <>
      <BackLink href="/choirs">כל המקהלות</BackLink>
      <PageHead title={isNew ? 'מקהלה חדשה' : c.name!} />
      <Flash sp={sp} />

      <form action={saveChoir} className="card">
        {!isNew && <input type="hidden" name="id" value={id} />}
        <div className="form-grid">
          <label>שם המקהלה<input name="name" defaultValue={c.name} required /></label>
          <label>
            מורה
            <select name="teacher_id" defaultValue={c.teacher_id ?? ''} required>
              <option value="">בחירה...</option>
              {choirTeachers.map((t) => <option key={t.id} value={t.id}>{fullName(t)}</option>)}
            </select>
          </label>
          <label>
            חדר
            <select name="room_id" defaultValue={c.room_id ?? ''} required>
              <option value="">בחירה...</option>
              <RoomOptions branches={all.branches} rooms={all.rooms} />
            </select>
          </label>
          <label>
            יום
            <select name="weekday" defaultValue={c.weekday ?? ''} required>
              <option value="">בחירה...</option>
              {BOARD_DAYS.map((d) => <option key={d} value={d}>{DAYS[d]}</option>)}
            </select>
          </label>
          <label>
            משעה
            <select name="start_time" defaultValue={c.start_time ? hhmm(c.start_time) : '16:00'}>
              {TIME_OPTIONS.map((x) => <option key={x}>{x}</option>)}
            </select>
          </label>
          <label>
            עד שעה
            <select name="end_time" defaultValue={c.end_time ? hhmm(c.end_time) : '17:00'}>
              {TIME_OPTIONS.map((x) => <option key={x}>{x}</option>)}
            </select>
          </label>
          <label>מחיר פרטי לחודש<input name="price_private" type="number" min="0" defaultValue={c.price_private ?? ''} /></label>
          <label>מכבי: חלק 1<input name="price_maccabi_1" type="number" min="0" defaultValue={c.price_maccabi_1 ?? ''} /></label>
          <label>מכבי: חלק 2 (אחרי החזר)<input name="price_maccabi_2" type="number" min="0" defaultValue={c.price_maccabi_2 ?? ''} /></label>
          <label>התחייבויות בחודש<input name="commitments" type="number" min="0" defaultValue={c.commitments ?? ''} /></label>
          <label className="wide">הערות<textarea name="notes" defaultValue={c.notes} /></label>
        </div>
        {choirTeachers.length === 0 && (
          <p className="muted">אין מורים עם הכלי &quot;{CHOIR_INSTRUMENT}&quot;. יש לסמן אותו בכרטיס המורה.</p>
        )}
        <div className="form-foot"><button className="btn btn-primary">שמירה</button></div>
      </form>

      {!isNew && (
        <>
          <section className="card">
            <h2>ילדים במקהלה ({members.length}/{CHOIR_CAPACITY})</h2>
            <div className={`capacity ${full ? 'full' : ''}`} style={{ marginBottom: 12 }}>
              <span style={{ width: `${(members.length / CHOIR_CAPACITY) * 100}%` }} />
            </div>
            {members.length === 0 ? <Empty>אין ילדים רשומים</Empty> : (
              <ul className="list">
                {members.map((e) => {
                  const contact = all.primaryContact(e.student_id);
                  return (
                    <li key={e.id}>
                      <span>
                        <Link href={`/students/${e.student_id}`}>{fullName(maps.student.get(e.student_id))}</Link>
                        {contact && <span className="muted"> · {contact.name} <span dir="ltr">{contact.phone}</span></span>}
                      </span>
                      <StatusBadge status={e.status} />
                      <StatusActions id={e.id} status={e.status} back={here} setAction={setEnrollmentStatus} deleteAction={deleteEnrollment} />
                    </li>
                  );
                })}
              </ul>
            )}
            {full ? <p className="muted">המקהלה מלאה.</p> : (
              <form action={addEnrollment} className="row-form" style={{ marginTop: 12 }}>
                <input type="hidden" name="choir_id" value={id} />
                <input type="hidden" name="back" value={here} />
                <select name="student_id" required aria-label="תלמיד/ה">
                  <option value="">בחירת תלמיד/ה...</option>
                  {candidates.map((s) => <option key={s.id} value={s.id}>{fullName(s)}</option>)}
                </select>
                <select name="status" aria-label="סטטוס">
                  {STATUSES.map((x) => <option key={x} value={x}>{STATUS_LABELS[x]}</option>)}
                </select>
                <button className="btn btn-xs btn-primary">+ רישום</button>
              </form>
            )}
          </section>

          <form action={deleteChoir}>
            <input type="hidden" name="id" value={id} />
            <ConfirmButton className="btn btn-danger" message="למחוק את המקהלה וכל הרישומים אליה?">מחיקת מקהלה</ConfirmButton>
          </form>
        </>
      )}
    </>
  );
}
