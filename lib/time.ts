import { LESSON_MINUTES } from './constants';

/** "16:30" או "16:30:00" -> דקות מחצות */
export function toMin(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

/** דקות מחצות -> "16:30" */
export function fmt(min: number): string {
  return `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
}

export const hhmm = (t: string) => t.slice(0, 5);

export function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd;
}

/** כל תחילות חצאי השעה בטווח [start, end) כך שהשיעור כולו נכנס */
export function slotsInRange(start: number, end: number, step = LESSON_MINUTES): number[] {
  const out: number[] = [];
  const first = Math.ceil(start / step) * step;
  for (let m = first; m + LESSON_MINUTES <= end; m += step) out.push(m);
  return out;
}

/** אפשרויות שעה לטפסים */
export const TIME_OPTIONS = slotsInRange(7 * 60, 22 * 60 + 30).map(fmt);
