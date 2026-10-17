import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ConfirmButton } from '@/components/ConfirmButton';
import { BackLink, Empty, Flash, PageHead, RoomOptions, StatusBadge, type SP } from '@/components/ui';
import { addTeacherHours, deleteTeacher, deleteTeacherHours, saveTeacher, updateTeacherHours } from '@/lib/actions/people';
import {
  BOARD_DAYS, DAYS, INTEREST_LABELS, LANGUAGES, TEACHER_GENDER_LABELS, type Interest, type TeacherGender,
} from '@/lib/constants';
import { loadAll } from '@/lib/data';
import { createClient } from '@/lib/supabase/server';
import { hhmm, QUARTER_TIME_OPTIONS } from '@/lib/time';
import { fullName, type Teacher } from '@/lib/types';

export default async function TeacherPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SP }) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const db = await createClient();
  const all = await loadAll(db);
  const isNew = id === 'new';
  const t: Teacher | undefined = isNew
    ? {
      id: 0, first_name: '', last_name: '', phone: '', email: '', room_id: null, notes: '', active: true,
      gender: null, teaches_young_boys: false, hourly_rate: null, interest: null, days_per_week: null, languages: [],
    }
    : all.maps.teacher.get(Number(id));
  if (!t) notFound();

  const myInstruments = new Set(all.teacherInstrumentIds(t.id));
  const otherLanguages = t.languages.filter((l) => !LANGUAGES.includes(l));
  const myBranches = new Set(all.teacherBranchIds(t.id));
  const hours = all.hours.filter((h) => h.teacher_id === t.id);
  const lessons = all.lessons.filter((l) => l.teacher_id === t.id);
  const choirs = all.choirs.filter((c) => c.teacher_id === t.id);

  return (
    <>
      <BackLink href="/teachers">כל המורים</BackLink>
      <PageHead title={isNew ? 'מורה חדש/ה' : fullName(t)}>
        {!isNew && <Link className="btn" href={`/schedule?teacher=${t.id}`}>מערכת שבועית</Link>}
        {!isNew && <Link className="btn" href={`/teachers/print?teacher=${t.id}`}>הדפסת מערכת</Link>}
      </PageHead>
      <Flash sp={sp} />

      <form action={saveTeacher} className="card">
        {!isNew && <input type="hidden" name="id" value={t.id} />}
        <div className="form-grid">
          <label>שם פרטי<input name="first_name" defaultValue={t.first_name} required /></label>
          <label>שם משפחה<input name="last_name" defaultValue={t.last_name} /></label>
          <label>
            מין
            <select name="gender" defaultValue={t.gender ?? ''}>
              <option value="">לא נבחר</option>
              {(Object.keys(TEACHER_GENDER_LABELS) as TeacherGender[]).map((g) => (
                <option key={g} value={g}>{TEACHER_GENDER_LABELS[g]}</option>
              ))}
            </select>
          </label>
          <label>
            מעוניין/ת
            <select name="interest" defaultValue={t.interest ?? ''}>
              <option value="">לא ידוע</option>
              {(Object.keys(INTEREST_LABELS) as Interest[]).map((x) => <option key={x} value={x}>{INTEREST_LABELS[x]}</option>)}
            </select>
          </label>
          <label>טלפון<input name="phone" defaultValue={t.phone} dir="ltr" /></label>
          <label>אימייל<input name="email" type="email" defaultValue={t.email} dir="ltr" /></label>
          <label>מחיר לשעה (₪)<input name="hourly_rate" type="number" min={0} step="any" defaultValue={t.hourly_rate ?? ''} dir="ltr" /></label>
          <label>
            ימים בשבוע
            <select name="days_per_week" defaultValue={t.days_per_week ?? ''}>
              <option value="">לא ידוע</option>
              {[1, 2, 3, 4, 5, 6].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
          <label className="check" style={{ alignSelf: 'end' }}>
            <input type="checkbox" name="teaches_young_boys" defaultChecked={t.teaches_young_boys} /> מלמדת גם בנים עד גיל 9
          </label>
          <label className="check" style={{ alignSelf: 'end' }}>
            <input type="checkbox" name="active" defaultChecked={t.active} /> פעיל/ה
          </label>
          <fieldset className="wide" style={{ border: 0, padding: 0, margin: 0 }}>
            <legend style={{ fontWeight: 600, fontSize: '0.88rem', marginBottom: 6 }}>סניפים</legend>
            <div className="checks">
              {all.branches.map((b) => (
                <label key={b.id} className="check">
                  <input type="checkbox" name="branch_ids" value={b.id} defaultChecked={myBranches.has(b.id)} />
                  {b.name}
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset className="wide" style={{ border: 0, padding: 0, margin: 0 }}>
            <legend style={{ fontWeight: 600, fontSize: '0.88rem', marginBottom: 6 }}>שפות</legend>
            <div className="checks">
              {LANGUAGES.map((l) => (
                <label key={l} className="check">
                  <input type="checkbox" name="languages" value={l} defaultChecked={t.languages.includes(l)} />
                  {l}
                </label>
              ))}
              <input name="languages_other" defaultValue={otherLanguages.join(', ')} placeholder="שפה נוספת (אפשר כמה, עם פסיק)" aria-label="שפה נוספת" />
            </div>
          </fieldset>
          <fieldset className="wide" style={{ border: 0, padding: 0, margin: 0 }}>
            <legend style={{ fontWeight: 600, fontSize: '0.88rem', marginBottom: 6 }}>כלים שמלמד/ת</legend>
            <div className="checks">
              {all.instruments.map((i) => (
                <label key={i.id} className="check">
                  <input type="checkbox" name="instrument_ids" value={i.id} defaultChecked={myInstruments.has(i.id)} />
                  {i.name}
                </label>
              ))}
            </div>
          </fieldset>
          <label className="wide">הערות<textarea name="notes" defaultValue={t.notes} /></label>
        </div>
        <div className="form-foot">
          <button className="btn btn-primary">שמירה</button>
        </div>
      </form>

      {!isNew && (
        <>
          <section className="card">
            <h2>שעות עבודה וחדרים</h2>
            <p className="muted">החדר שייך ליום ולשעות: כל יום אפשר ללמד בחדר (ובסניף) אחר. שיעור חדש מקבל אוטומטית את החדר של השעות.
              בלחיצה על &quot;עדכון&quot; כל השיעורים של המורה בשעות האלה עוברים לחדר שנבחר (אם הוא פנוי בזמן השיעור).</p>
            {hours.length === 0 ? <Empty>לא הוגדרו שעות עבודה. בלי שעות אי אפשר לשבץ שיעורים.</Empty> : (
              <ul className="list">
                {hours.map((h) => (
                  <li key={h.id}>
                    <form action={updateTeacherHours} className="row-form">
                      <input type="hidden" name="id" value={h.id} />
                      <input type="hidden" name="teacher_id" value={t.id} />
                      <select name="weekday" defaultValue={h.weekday} aria-label="יום">
                        {BOARD_DAYS.map((d) => <option key={d} value={d}>{DAYS[d]}</option>)}
                      </select>
                      <select name="start_time" defaultValue={hhmm(h.start_time)} aria-label="משעה">
                        {QUARTER_TIME_OPTIONS.map((x) => <option key={x}>{x}</option>)}
                      </select>
                      <select name="end_time" defaultValue={hhmm(h.end_time)} aria-label="עד שעה">
                        {QUARTER_TIME_OPTIONS.map((x) => <option key={x}>{x}</option>)}
                      </select>
                      <select name="room_id" defaultValue={h.room_id ?? ''} aria-label="חדר">
                        <option value="">בלי חדר</option>
                        <RoomOptions branches={all.branches} rooms={all.rooms} />
                      </select>
                      <button className="btn btn-xs btn-primary">עדכון</button>
                    </form>
                    <form action={deleteTeacherHours}>
                      <input type="hidden" name="id" value={h.id} />
                      <input type="hidden" name="teacher_id" value={t.id} />
                      <ConfirmButton className="btn btn-xs btn-danger" message="למחוק את שעות העבודה האלה?">מחיקה</ConfirmButton>
                    </form>
                  </li>
                ))}
              </ul>
            )}
            <form action={addTeacherHours} className="row-form" style={{ marginTop: 12 }}>
              <input type="hidden" name="teacher_id" value={t.id} />
              <label>יום
                <select name="weekday" required>
                  {BOARD_DAYS.map((d) => <option key={d} value={d}>{DAYS[d]}</option>)}
                </select>
              </label>
              <label>משעה
                <select name="start_time" defaultValue="14:00">{QUARTER_TIME_OPTIONS.map((x) => <option key={x}>{x}</option>)}</select>
              </label>
              <label>עד שעה
                <select name="end_time" defaultValue="19:00">{QUARTER_TIME_OPTIONS.map((x) => <option key={x}>{x}</option>)}</select>
              </label>
              <label>חדר
                <select name="room_id" defaultValue="">
                  <option value="">ללא</option>
                  <RoomOptions branches={all.branches} rooms={all.rooms} />
                </select>
              </label>
              <button className="btn btn-primary btn-xs">+ הוספה</button>
            </form>
          </section>

          <section className="card table-wrap">
            <h2>שיעורים ({lessons.length})</h2>
            {lessons.length === 0 ? <Empty>אין שיעורים</Empty> : (
              <table>
                <thead><tr><th>מתי</th><th>תלמיד/ה</th><th>כלי</th><th>חדר</th><th>סטטוס</th></tr></thead>
                <tbody>
                  {lessons.map((l) => (
                    <tr key={l.id}>
                      <td><Link href={`/lessons/${l.id}`}>{DAYS[l.weekday]} {hhmm(l.start_time)}</Link></td>
                      <td><Link href={`/students/${l.student_id}`}>{fullName(all.maps.student.get(l.student_id))}</Link></td>
                      <td>{all.maps.instrument.get(l.instrument_id)?.name}</td>
                      <td>{all.roomLabel(l.room_id)}</td>
                      <td><StatusBadge status={l.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {choirs.length > 0 && (
              <p>מקהלות: {choirs.map((c) => <Link key={c.id} className="chip" href={`/choirs/${c.id}`}>{c.name}</Link>)}</p>
            )}
          </section>

          <form action={deleteTeacher}>
            <input type="hidden" name="id" value={t.id} />
            <ConfirmButton className="btn btn-danger" message={`למחוק את ${fullName(t)}?`}>מחיקת מורה</ConfirmButton>
          </form>
        </>
      )}
    </>
  );
}
