import type { NextRequest } from 'next/server';
import { DAYS } from '@/lib/constants';
import { dayRows, dayTeacherIds, dmy, mobilePhone, parseRows, shortName, validDate, weekdayOf, type DayRow } from '@/lib/day';
import { loadAll, loadDay } from '@/lib/data';
import { pdfSectionsResponse, type PdfSection } from '@/lib/pdf';
import { createClient } from '@/lib/supabase/server';
import { fullName } from '@/lib/types';

/**
 * רשימת השיעורים ביום אחד ל-PDF: שעה, שם פרטי + אות משם המשפחה, פלאפון.
 * עם teacher: מורה אחד/ת. בלי: כל המורים של היום, כל מורה בדף נפרד
 */
export async function GET(req: NextRequest) {
  const date = req.nextUrl.searchParams.get('date') ?? '';
  const teacherId = Number(req.nextUrl.searchParams.get('teacher')) || null;
  return render(date, teacherId);
}

/** הדפסה מהלוח: השורות כמו שהן במסך, גם אם הוסיפו/הורידו/שינו תלמידים ועוד לא שמרו */
export async function POST(req: NextRequest) {
  const fd = await req.formData();
  const date = String(fd.get('date') ?? '');
  const teacherId = Number(fd.get('teacher')) || null;
  if (!teacherId) return new Response('מורה לא תקין', { status: 400 });
  const rows = parseRows(String(fd.get('rows') ?? ''), teacherId);
  if (!rows) return new Response('השורות לא תקינות', { status: 400 });
  return render(date, teacherId, { rows, draft: fd.get('draft') === '1' });
}

async function render(date: string, teacherId: number | null, edited?: { rows: DayRow[]; draft: boolean }) {
  if (!validDate(date)) return new Response('תאריך לא תקין', { status: 400 });

  const db = await createClient();
  const [all, day] = await Promise.all([loadAll(db), loadDay(db, date)]);
  const { maps } = all;
  const when = `יום ${DAYS[weekdayOf(date)]} ${dmy(date)}`;
  const contacts = (studentId: number) => all.contacts.filter((c) => c.student_id === studentId);

  const section = (id: number): PdfSection<DayRow> => {
    const teacher = maps.teacher.get(id)!;
    const closed = day.closures.some((c) => c.teacher_id === id);
    const rows = edited && id === teacherId
      ? [...edited.rows].sort((a, b) => (a.start_time ?? '99:99').localeCompare(b.start_time ?? '99:99'))
      : dayRows(day.lessons, all.lessons, id, date, closed).rows;
    // מילוי מקום: לכל היום - בכותרת. רק בחלק מהשיעורים - עמודה של מי מלמד/ת
    const subs = [...new Set(rows.map((r) => r.substitute_id))];
    const daySub = subs.length === 1 && subs[0] ? maps.teacher.get(subs[0]) : undefined;
    const mixed = subs.length > 1;
    const who = daySub ? `${fullName(daySub)}, מילוי מקום של ${fullName(teacher)}` : fullName(teacher);
    return {
      title: `${who} · ${when}`,
      subtitle: `${rows.length} תלמידים${edited?.draft ? ' · כולל שינויים שעוד לא נשמרו' : ''}`,
      rows,
      columns: [
        { header: 'שעה', width: 60, value: (r) => r.start_time ?? '' },
        { header: 'שם', width: 150, value: (r) => shortName(maps.student.get(r.student_id)) },
        { header: 'פלאפון', width: 120, value: (r) => mobilePhone(contacts(r.student_id)) },
        ...(mixed ? [{ header: 'מורה', width: 130, value: (r: DayRow) => fullName(maps.teacher.get(r.substitute_id ?? id)) }] : []),
      ],
    };
  };

  if (teacherId) {
    const teacher = maps.teacher.get(teacherId);
    if (!teacher) return new Response('מורה לא נמצא', { status: 404 });
    const s = section(teacherId);
    return pdfSectionsResponse(s.title, [s], { inline: true });
  }

  const sections = [...dayTeacherIds(all.lessons, day.lessons, day.closures, date)]
    .map((id) => maps.teacher.get(id)).filter((t) => t !== undefined)
    .sort((a, b) => fullName(a).localeCompare(fullName(b), 'he'))
    .map((t) => section(t.id))
    .filter((s) => s.rows.length > 0);
  if (!sections.length) return new Response('אין שיעורים ביום הזה', { status: 404 });
  return pdfSectionsResponse(`שיעורים ${when}`, sections, { inline: true });
}
