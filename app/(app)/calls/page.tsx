import { CallBoard, type CallCard } from '@/components/CallBoard';
import { PageHead } from '@/components/ui';
import { DAYS, type CallColumn } from '@/lib/constants';
import { loadAll } from '@/lib/data';
import { createClient } from '@/lib/supabase/server';
import { hhmm } from '@/lib/time';
import { fullName } from '@/lib/types';

export default async function CallsPage() {
  const db = await createClient();
  const all = await loadAll(db);
  const { maps } = all;
  const migrated = all.students.length === 0 || 'call_state' in all.students[0];

  const cards: CallCard[] = [];
  for (const s of all.students) {
    const lessons = all.lessons.filter((l) => l.student_id === s.id);
    const enrollments = all.enrollments.filter((e) => e.student_id === s.id);
    const statuses = [...lessons, ...enrollments].map((x) => x.status);
    if (statuses.length === 0) continue;

    // יש שיבוץ שממתין לאישור -> צריך להתקשר / לא ענו. אחרת לפי הסטטוס הנמוך ביותר
    const column: CallColumn =
      statuses.includes('pending') ? (s.call_state ?? 'to_call') :
      statuses.includes('undecided') ? 'undecided' : 'confirmed';

    cards.push({
      id: s.id,
      name: fullName(s),
      column,
      attempts: s.call_attempts,
      lastCall: s.last_call_at,
      items: [
        ...lessons.map((l) => ({
          key: `l${l.id}`, status: l.status,
          text: `${maps.instrument.get(l.instrument_id)?.name ?? ''} · ${fullName(maps.teacher.get(l.teacher_id))} · ${DAYS[l.weekday]} ${hhmm(l.start_time)}`,
        })),
        ...enrollments.map((e) => {
          const c = maps.choir.get(e.choir_id);
          return {
            key: `e${e.id}`, status: e.status,
            text: c ? `מקהלה: ${c.name} · ${DAYS[c.weekday]} ${hhmm(c.start_time)}` : 'מקהלה',
          };
        }),
      ],
      contacts: all.contacts.filter((c) => c.student_id === s.id && c.phone)
        .map((c) => ({ id: c.id, name: c.name, relation: c.relation, phone: c.phone })),
    });
  }

  return (
    <>
      <PageHead
        title="טלפונים להורים"
        sub="גוררים כרטיס לפי תוצאת השיחה. לא ענו = נספר ניסיון. אושר = כל השיבוצים של התלמיד/ה הופכים לסופיים."
      />
      {!migrated && (
        <div className="flash flash-error" role="alert">
          חסר שדה מצב שיחה במסד הנתונים. יש להריץ את הקובץ supabase/migrations/0023_parent_calls.sql
        </div>
      )}
      <CallBoard cards={cards} />
    </>
  );
}
