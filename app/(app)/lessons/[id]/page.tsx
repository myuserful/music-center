import { notFound } from 'next/navigation';
import { ConfirmButton } from '@/components/ConfirmButton';
import { BackLink, Flash, one, PageHead, RoomOptions, type SP } from '@/components/ui';
import { deleteLesson, saveLesson } from '@/lib/actions/assignments';
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
        status: 'pending',
        notes: '',
      }
    : all.lessons.find((x) => x.id === Number(id));
  if (!l) notFound();

  const teacher = l.teacher_id ? maps.teacher.get(l.teacher_id) : undefined;
  const here = isNew ? `/lessons/new?${new URLSearchParams(Object.entries(sp).filter(([k]) => !['error', 'ok'].includes(k)).map(([k, v]) => [k, one(v)])).toString()}` : `/lessons/${id}`;
  const after = one(sp.after);

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
            חדר
            <select name="room_id" defaultValue={l.room_id ?? ''}>
              <option value="">החדר הקבוע של המורה</option>
              <RoomOptions branches={all.branches} rooms={all.rooms} />
            </select>
          </label>
          <label>
            יום
            <select name="weekday" defaultValue={l.weekday ?? ''} required>
              <option value="">בחירה...</option>
              {BOARD_DAYS.map((d) => <option key={d} value={d}>{DAYS[d]}</option>)}
            </select>
          </label>
          <label>
            שעה
            <select name="start_time" defaultValue={l.start_time ? hhmm(l.start_time) : ''} required>
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
