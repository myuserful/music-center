import { LESSON_MINUTES } from './constants';
import { overlaps, slotsInRange, toMin } from './time';

export type Hours = { weekday: number; start_time: string; end_time: string };
export type Busy = { weekday: number; start: number; end: number };
export type Slot = { weekday: number; start: number };

/** חצאי שעה פנויים בתוך שעות העבודה, אחרי הורדת שיעורים ומקהלות */
export function freeSlots(hours: Hours[], busy: Busy[]): Slot[] {
  const out: Slot[] = [];
  const seen = new Set<string>();
  for (const h of hours) {
    for (const s of slotsInRange(toMin(h.start_time), toMin(h.end_time))) {
      const key = `${h.weekday}-${s}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const taken = busy.some(
        (b) => b.weekday === h.weekday && overlaps(s, s + LESSON_MINUTES, b.start, b.end),
      );
      if (!taken) out.push({ weekday: h.weekday, start: s });
    }
  }
  return out.sort((a, b) => a.weekday - b.weekday || a.start - b.start);
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
