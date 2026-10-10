import { LESSON_MINUTES } from './constants';
import { overlaps, toMin } from './time';

export type Hours = { weekday: number; start_time: string; end_time: string };
export type Busy = { weekday: number; start: number; end: number };
export type Slot = { weekday: number; start: number };

/**
 * משבצות השיעורים של מורה ביום מסוים.
 * השיעורים צמודים זה לזה מתחילת שעות העבודה: מורה שמתחילה ב-16:15
 * מלמדת ב-16:15, 16:45, 17:15... (כל שיעור חצי שעה).
 * כשיש כמה בלוקים של שעות באותו יום, כל בלוק מתחיל רצף משלו.
 */
export function daySlots(hours: Hours[], weekday: number): number[] {
  return slotStarts(
    hours.filter((h) => h.weekday === weekday).map((h) => ({ start: toMin(h.start_time), end: toMin(h.end_time) })),
  );
}

/** כמו daySlots, לבלוקים בדקות */
export function slotStarts(blocks: { start: number; end: number }[]): number[] {
  const slots: number[] = [];
  for (const b of [...blocks].sort((a, c) => a.start - c.start)) {
    for (let m = b.start; m + LESSON_MINUTES <= b.end; m += LESSON_MINUTES) {
      // בלוקים חופפים: לא מוסיפים משבצת שחופפת למשבצת קיימת
      if (!slots.some((x) => overlaps(m, m + LESSON_MINUTES, x, x + LESSON_MINUTES))) slots.push(m);
    }
  }
  return slots.sort((a, c) => a - c);
}

/** מקומות פנויים: משבצות השיעורים שלא תפוסות בשיעור או במקהלה */
export function freeSlots(hours: Hours[], busy: Busy[]): Slot[] {
  const days = [...new Set(hours.map((h) => h.weekday))].sort((a, b) => a - b);
  return days.flatMap((weekday) =>
    daySlots(hours, weekday)
      .filter((m) => !busy.some((b) => b.weekday === weekday && overlaps(m, m + LESSON_MINUTES, b.start, b.end)))
      .map((start) => ({ weekday, start })),
  );
}

/** האם השיעור [start, start+30) נכנס כולו בשעות העבודה של היום */
export function withinHours(hours: Hours[], weekday: number, start: number): boolean {
  return hours.some(
    (h) =>
      h.weekday === weekday &&
      toMin(h.start_time) <= start &&
      start + LESSON_MINUTES <= toMin(h.end_time),
  );
}
