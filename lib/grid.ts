import { slotStarts } from './availability';
import { BOARD_DAYS, LESSON_MINUTES } from './constants';
import { overlaps, START_STEP } from './time';

type Span = { weekday: number; start: number; end: number };

export type GridCell =
  | { kind: 'lesson'; index: number; span: number }
  | { kind: 'choir'; index: number; span: number }
  | { kind: 'free'; span: number } // משבצת שיעור פנויה
  | { kind: 'covered' } // המשך של תא מהשורה הקודמת (rowSpan)
  | { kind: 'off' }; // מחוץ למשבצות השיעורים

/**
 * לוח שבועי של מורה. השורות הן רבעי שעה כדי שכל יום יוכל להתחיל ברצף משלו
 * (ראשון 16:15, 16:45... ורביעי 16:00, 16:30...). כל משבצת שיעור תופסת 2 שורות.
 */
export function teacherGrid(
  hours: Span[],
  lessons: { weekday: number; start: number }[],
  choirs: Span[],
) {
  const lessonSpans = lessons.map((l) => ({ ...l, end: l.start + LESSON_MINUTES }));
  const all = [...hours, ...lessonSpans, ...choirs];
  const days = BOARD_DAYS.filter((d) => all.some((x) => x.weekday === d));
  if (days.length === 0) return { days, rows: [] as number[], cells: [] as GridCell[][], slotRows: new Set<number>() };

  const from = Math.floor(Math.min(...all.map((x) => x.start)) / START_STEP) * START_STEP;
  const to = Math.max(...all.map((x) => x.end));
  const rows: number[] = [];
  for (let m = from; m < to; m += START_STEP) rows.push(m);
  const span = (start: number, end: number) => Math.max(1, Math.ceil((end - start) / START_STEP));

  const slotRows = new Set<number>(); // שורות שבהן מתחילה משבצת באחד הימים (לתווית השעה)
  const cells: GridCell[][] = rows.map(() => days.map((): GridCell => ({ kind: 'off' })));
  days.forEach((d, di) => {
    const slots = slotStarts(hours.filter((h) => h.weekday === d));
    slots.forEach((s) => slotRows.add(s));
    let coveredUntil = -1;
    rows.forEach((m, ri) => {
      if (m < coveredUntil) {
        cells[ri][di] = { kind: 'covered' };
        return;
      }
      const li = lessons.findIndex((l) => l.weekday === d && l.start >= m && l.start < m + START_STEP);
      if (li >= 0) {
        coveredUntil = lessons[li].start + LESSON_MINUTES;
        cells[ri][di] = { kind: 'lesson', index: li, span: span(m, coveredUntil) };
        return;
      }
      const ci = choirs.findIndex((c) => c.weekday === d && c.start >= m && c.start < m + START_STEP);
      if (ci >= 0) {
        coveredUntil = choirs[ci].end;
        cells[ri][di] = { kind: 'choir', index: ci, span: span(m, coveredUntil) };
        return;
      }
      if (slots.includes(m)) {
        const end = m + LESSON_MINUTES;
        const blocked = [...lessonSpans, ...choirs].some((b) => b.weekday === d && overlaps(m, end, b.start, b.end));
        if (!blocked) {
          coveredUntil = end;
          cells[ri][di] = { kind: 'free', span: span(m, end) };
        }
      }
    });
  });
  return { days, rows, cells, slotRows };
}
