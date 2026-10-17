/**
 * לוח מועדי הפעילות של השנה (לפי "מועדי הפעילות - תשפ"ז"): ימים א', ב', ג', ד', בלי חגים וחופשות.
 * בכל שנה חדשה מעדכנים כאן את התאריכים לפי הלוח החדש
 */
export const ACTIVITY_YEAR = {
  label: 'תשפ"ז',
  start: '2026-10-18',
  end: '2027-07-28',
  weekdays: [0, 1, 2, 3],
  /** ימים שאין בהם פעילות (כולל קצוות) */
  off: [
    { from: '2026-12-06', to: '2026-12-09', name: 'חנוכה' },
    { from: '2026-12-20', to: '2026-12-20', name: "י' בטבת" },
    { from: '2027-03-21', to: '2027-03-24', name: 'פורים' },
    { from: '2027-04-18', to: '2027-05-01', name: 'חופשת פסח' },
    { from: '2027-05-12', to: '2027-05-12', name: 'יום העצמאות' },
    { from: '2027-05-24', to: '2027-05-25', name: 'ל"ג בעומר' },
    { from: '2027-07-21', to: '2027-07-21', name: 'י"ז בתמוז' },
  ],
};

const DAY_MS = 86_400_000;
const toTime = (iso: string) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10));
const toIso = (t: number) => new Date(t).toISOString().slice(0, 10);

const isOff = (iso: string) => ACTIVITY_YEAR.off.some((o) => iso >= o.from && iso <= o.to);

/** כל ימי הפעילות בשנה שנופלים על הימים שנבחרו (0 = ראשון), לפי הסדר */
export function activityDays(weekdays: number[]): string[] {
  const out: string[] = [];
  for (let t = toTime(ACTIVITY_YEAR.start); t <= toTime(ACTIVITY_YEAR.end); t += DAY_MS) {
    const iso = toIso(t);
    if (weekdays.includes(new Date(t).getUTCDay()) && ACTIVITY_YEAR.weekdays.includes(new Date(t).getUTCDay()) && !isOff(iso)) {
      out.push(iso);
    }
  }
  return out;
}

/** count ימי הפעילות הראשונים החל מ-from (כולל). אם לא נשארו מספיק בשנה מחזיר פחות */
export function activityDates(weekdays: number[], from: string, count: number): string[] {
  return activityDays(weekdays).filter((d) => d >= from).slice(0, Math.max(0, count));
}

/** "2026-04-27" → "27.4.26", כמו בקבלות */
export function shortDate(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${Number(d)}.${Number(m)}.${y.slice(2)}`;
}
