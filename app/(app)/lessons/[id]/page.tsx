import { notFound } from 'next/navigation';
import { ConfirmButton } from '@/components/ConfirmButton';
import { BackLink, Flash, one, PageHead, RoomOptions, type SP } from '@/components/ui';
import { addPairStudent, deleteLesson, saveLesson } from '@/lib/actions/assignments';
import { BOARD_DAYS, CHOIR_INSTRUMENT, DAYS, STATUS_LABELS, STATUSES } from '@/lib/constants';
import { loadAll } from '@/lib/data';
import { createClient } from '@/lib/supabase/server';
import { fmt, hhmm, TIME_OPTIONS } from '@/lib/time';
import { fullName, type Lesson } from '@/lib/types';

export default async function LessonPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SP }) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const db = await createClient();
  const all = await loadAll(db);
  const { maps } = all;
  const isNew = id === 'new';

  // מילוי מראש מקישורים: ?student=&teacher=&day=&time=
  const prefTeacher = Number(one(sp.teacher)) || null;
  const prefStudent = Number(one(sp.student)) || null;
  const student = prefStudent ? maps.student.get(prefStudent) : undefined;
  const l: Partial<Lesson> | undefined = isNew
    ? {
        student_id: prefStudent ?? undefined,
        teacher_id: prefTeacher ?? undefined,
        instrument_id: student?.requested_instrument_id ?? undefined,
        weekday: one(sp.day) ? Number(one(sp.day)) : undefined,
        start_time: one(sp.time) || undefined,
        at_home: one(sp.home) === '1',
        home_slot: Number(one(sp.slot)) || null,
        status: 'pending',
        notes: '',
      }
    : all.lessons.find((x) => x.id === Number(id));
  if (!l) notFound();

  const teacher = l.teacher_id ? maps.teacher.get(l.teacher_id) : undefined;
  const here = isNew ? `/lessons/new?${new URLSearchParams(Object.entries(sp).filter(([k]) => !['error', 'ok'].includes(k)).map(([k, v]) => [k, one(v)])).toString()}` : `/lessons/${id}`;
  const after = one(sp.after);

  // שיעור בזוג: מי עוד בשיעור (אותו מורה, יום ושעה)
  const partners = isNew || l.at_home ? [] : all.lessons.filter((x) => x.id !== l.id && !x.at_home && x.teacher_id === l.teacher_id
    && x.weekday === l.weekday && x.start_time === l.start_time);

  // עזרה לבחירה: מקומות פנויים של המורה שנבחר
  const free = teacher ? all.teacherFree(teacher.id) : [];

  return (
    <>
      <BackLink href={l.student_id ? `/students/${l.student_id}` : '/schedule'}>חזרה</BackLink>
      <PageHead title={isNew ? 'שיבוץ שיעור פרטי' : 'עריכת שיעור'} sub="שיעור של 30 דקות, כל שבוע. שיבוץ חדש נשמר כ&quot;ממתין לאישור הורים&quot;." />
      <Flash sp={sp} />

      <form action={saveLesson} className="card">
        {!isNew && <input type="hidden" name="id" value={id} />}
        <input type="hidden" name="back" value={here} />
        {after && <input type="hidden" name="after" value={after} />}
        <div className="form-grid">
          <label>
            תלמיד/ה
            <select name="student_id" defaultValue={l.student_id ?? ''} required>
              <option value="">בחירה...</option>
              {all.students.filter((s) => s.status !== 'inactive' || s.id === l.student_id).map((s) => (
                <option key={s.id} value={s.id}>{fullName(s)}</option>
              ))}
            </select>
          </label>
          <label>
            מורה
            <select name="teacher_id" defaultValue={l.teacher_id ?? ''} required>
              <option value="">בחירה...</option>
              {all.teachers.filter((t) => t.active || t.id === l.teacher_id).map((t) => (
                <option key={t.id} value={t.id}>
                  {fullName(t)} ({all.teacherInstrumentIds(t.id).map((i) => maps.instrument.get(i)?.name).join(', ')})
                </option>
              ))}
            </select>
          </label>
          <label>
            כלי
            <select name="instrument_id" defaultValue={l.instrument_id ?? ''} required>
              <option value="">בחירה...</option>
              {all.instruments.filter((i) => i.name !== CHOIR_INSTRUMENT).map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
            </select>
          </label>
          <label>
            מיקום
            <select name="at_home" defaultValue={l.at_home ? '1' : '0'}>
              <option value="0">במרכז (לפי יום ושעה)</option>
              <option value="1">בבית המורה (לא תופס שעה)</option>
            </select>
          </label>
          <label>
            מס׳ משבצת בבית
            <input type="number" name="home_slot" min={1} defaultValue={l.home_slot ?? ''} placeholder="רק ללימוד בבית" />
          </label>
          <label>
            חדר
            <select name="room_id" defaultValue={l.room_id ?? ''}>
              <option value="">החדר הקבוע של המורה</option>
              <RoomOptions branches={all.branches} rooms={all.rooms} />
            </select>
          </label>
          <label>
            יום
            <select name="weekday" defaultValue={l.weekday ?? ''}>
              <option value="">בחירה...</option>
              {BOARD_DAYS.map((d) => <option key={d} value={d}>{DAYS[d]}</option>)}
            </select>
          </label>
          <label>
            שעה
            <select name="start_time" defaultValue={l.start_time ? hhmm(l.start_time) : ''}>
              <option value="">בחירה...</option>
              {TIME_OPTIONS.map((x) => <option key={x}>{x}</option>)}
            </select>
          </label>
          <label>
            סטטוס
            <select name="status" defaultValue={l.status}>
              {STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
            </select>
          </label>
          <label className="wide">הערות<textarea name="notes" defaultValue={l.notes} /></label>
        </div>
        <div className="form-foot">
          <button className="btn btn-primary">שמירה</button>
        </div>
      </form>

      {!isNew && !l.at_home && (
        <section className="card" id="pair">
          <h3 style={{ marginBottom: 8 }}>👥 שיעור בזוג</h3>
          {partners.length > 0 ? (
            <p>
              בשיעור הזה לומדים יחד:{' '}
              {partners.map((p) => (
                <span key={p.id}>
                  <a href={`/students/${p.student_id}`}>{fullName(maps.student.get(p.student_id))}</a>
                  {' '}(<a href={`/lessons/${p.id}`}>השיעור שלו/ה</a>)
                </span>
              ))}
              . כל אחד/ת משלם/ת על 3 שיעורים מכל 4, והרביעי חינם. למורה זה נספר כשיעור אחד.
              <br /><span className="muted">כדי לפרק את הזוג: מוחקים או מזיזים את השיעור של אחד/ת מהם, והשני/ה חוזר/ת לשיעור רגיל.</span>
            </p>
          ) : (
            <form action={addPairStudent} className="row-form">
              <input type="hidden" name="id" value={id} />
              <input type="hidden" name="back" value={here} />
              <label>
                צירוף תלמיד/ה לשיעור הזה
                <select name="student_id" required defaultValue="">
                  <option value="">בחירה...</option>
                  {all.students.filter((s) => s.status !== 'inactive' && s.id !== l.student_id).map((s) => (
                    <option key={s.id} value={s.id}>{fullName(s)}</option>
                  ))}
                </select>
              </label>
              <button className="btn btn-primary">צירוף לשיעור בזוג</button>
              <span className="muted">שניהם לומדים יחד באותה שעה. כל אחד/ת משלם/ת על 3 שיעורים מכל 4, והרביעי חינם.</span>
            </form>
          )}
        </section>
      )}

      {teacher && free.length > 0 && (
        <section className="card">
          <h3 style={{ marginBottom: 8 }}>מקומות פנויים אצל {fullName(teacher)}</h3>
          {free.map((s) => (
            <a key={`${s.weekday}-${s.start}`} className="chip"
              href={`/lessons/new?teacher=${teacher.id}&day=${s.weekday}&time=${fmt(s.start)}${l.student_id ? `&student=${l.student_id}` : ''}`}>
              {DAYS[s.weekday]} {fmt(s.start)}
            </a>
          ))}
        </section>
      )}

      {!isNew && (
        <form action={deleteLesson}>
          <input type="hidden" name="id" value={id} />
          <input type="hidden" name="back" value={`/students/${l.student_id}`} />
          <ConfirmButton className="btn btn-danger" message="למחוק את השיעור?">מחיקת שיעור</ConfirmButton>
        </form>
      )}
    </>
  );
}
