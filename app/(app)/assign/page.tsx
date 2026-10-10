import { AssignBoard, type BoardStudent, type BoardTeacher } from '@/components/AssignBoard';
import { one, PageHead, type SP } from '@/components/ui';
import { ageLabel } from '@/lib/age';
import { CHOIR_INSTRUMENT, STUDENT_STATUS_LABELS } from '@/lib/constants';
import { loadAll } from '@/lib/data';
import { createClient } from '@/lib/supabase/server';
import { toMin } from '@/lib/time';
import { fullName } from '@/lib/types';

export default async function AssignPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const db = await createClient();
  const all = await loadAll(db);
  const { maps } = all;
  const choirInstrumentId = all.instruments.find((i) => i.name === CHOIR_INSTRUMENT)?.id;

  const teachers: BoardTeacher[] = all.teachers.filter((t) => t.active).map((t) => ({
    id: t.id,
    name: fullName(t),
    room: all.roomLabel(t.room_id),
    branches: all.teacherBranchIds(t.id).map((b) => maps.branch.get(b)?.name ?? '').filter(Boolean),
    languages: t.languages,
    instruments: all.teacherInstrumentIds(t.id)
      .filter((i) => i !== choirInstrumentId)
      .map((i) => ({ id: i, name: maps.instrument.get(i)?.name ?? '' })),
    hours: all.hours.filter((h) => h.teacher_id === t.id)
      .map((h) => ({ weekday: h.weekday, start: toMin(h.start_time), end: toMin(h.end_time) })),
    lessons: all.lessons.filter((l) => l.teacher_id === t.id).map((l) => ({
      id: l.id, weekday: l.weekday, start: toMin(l.start_time), status: l.status,
      student: fullName(maps.student.get(l.student_id)),
      instrument: maps.instrument.get(l.instrument_id)?.name ?? '',
    })),
    choirs: all.choirs.filter((c) => c.teacher_id === t.id).map((c) => ({
      id: c.id, name: c.name, weekday: c.weekday, start: toMin(c.start_time), end: toMin(c.end_time),
    })),
  }));

  const lessonCount = new Map<number, number>();
  for (const l of all.lessons) lessonCount.set(l.student_id, (lessonCount.get(l.student_id) ?? 0) + 1);
  const unassigned = new Set(all.unassigned.map((s) => s.id));

  const students: BoardStudent[] = all.students.filter((s) => s.status !== 'inactive').map((s) => ({
    id: s.id,
    name: fullName(s),
    age: ageLabel(s.birth_date, s.birth_date_approx),
    status: STUDENT_STATUS_LABELS[s.status],
    undecided: s.status === 'undecided',
    instrumentId: s.requested_instrument_id,
    instrument: s.requested_instrument_id ? maps.instrument.get(s.requested_instrument_id)?.name ?? '' : '',
    branchId: s.branch_id,
    branch: s.branch_id ? maps.branch.get(s.branch_id)?.name ?? '' : '',
    gender: s.gender,
    language: s.language,
    preferred: s.preferred_times,
    notes: s.notes,
    lessons: lessonCount.get(s.id) ?? 0,
    unassigned: unassigned.has(s.id),
  }));

  const selected = one(sp.t).split(',').map(Number).filter((id) => teachers.some((t) => t.id === id));

  return (
    <>
      <PageHead title="שיבוץ בגרירה" sub="גוררים תלמיד/ה למשבצת פנויה אצל מורה. כל שיעור חצי שעה ונשמר כ&quot;ממתין לאישור הורים&quot;." />
      <AssignBoard teachers={teachers} students={students} initialSelected={selected} />
    </>
  );
}
