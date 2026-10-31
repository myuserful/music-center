import type { Contact, Student } from './types';

/** טלפון להשוואה: רק ספרות, 972 בהתחלה הופך ל-0. מספר קצר מדי לא נחשב */
export function normalizePhone(phone: string): string {
  let d = (phone ?? '').replace(/\D/g, '');
  if (d.startsWith('972')) d = `0${d.slice(3)}`;
  return d.length >= 9 ? d : '';
}

/** מפתח לזוג תלמידים (הקטן קודם), כמו בטבלת sibling_rejections */
export const pairKey = (a: number, b: number) => (a < b ? `${a}-${b}` : `${b}-${a}`);

export type SiblingSuggestion = {
  studentIds: number[];
  phones: string[];
  /** כולם עם אותו שם משפחה: כמעט בטוח אחים */
  sure: boolean;
};

type S = Pick<Student, 'id' | 'last_name' | 'family_id'>;
type C = Pick<Contact, 'student_id' | 'phone'>;

/**
 * הצעות לאחים: תלמידים שחולקים טלפון של איש קשר.
 * לא מציעים זוג שכבר באותה משפחה, או שסימנו עליו "לא אחים".
 * קבוצה = רכיב קשיר של זוגות כאלה (ככה שלושה אחים יוצאים בהצעה אחת).
 */
export function suggestSiblings(students: S[], contacts: C[], rejected: Set<string>): SiblingSuggestion[] {
  const byId = new Map(students.map((s) => [s.id, s]));
  const byPhone = new Map<string, Set<number>>();
  for (const c of contacts) {
    const p = normalizePhone(c.phone);
    if (!p || !byId.has(c.student_id)) continue;
    if (!byPhone.has(p)) byPhone.set(p, new Set());
    byPhone.get(p)!.add(c.student_id);
  }

  const parent = new Map<number, number>();
  const find = (x: number): number => {
    while (parent.get(x) !== x) {
      parent.set(x, parent.get(parent.get(x)!)!);
      x = parent.get(x)!;
    }
    return x;
  };
  const sharedPhones = new Map<number, Set<string>>();
  for (const [phone, set] of byPhone) {
    const ids = [...set];
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const a = byId.get(ids[i])!, b = byId.get(ids[j])!;
        if (a.family_id != null && a.family_id === b.family_id) continue;
        if (rejected.has(pairKey(a.id, b.id))) continue;
        for (const id of [a.id, b.id]) {
          if (!parent.has(id)) parent.set(id, id);
          if (!sharedPhones.has(id)) sharedPhones.set(id, new Set());
          sharedPhones.get(id)!.add(phone);
        }
        parent.set(find(a.id), find(b.id));
      }
    }
  }

  const groups = new Map<number, number[]>();
  for (const id of parent.keys()) {
    const r = find(id);
    if (!groups.has(r)) groups.set(r, []);
    groups.get(r)!.push(id);
  }
  return [...groups.values()].map((ids) => {
    const sorted = ids.sort((a, b) => a - b);
    const names = new Set(sorted.map((id) => byId.get(id)!.last_name.trim()));
    return {
      studentIds: sorted,
      phones: [...new Set(sorted.flatMap((id) => [...sharedPhones.get(id)!]))],
      sure: names.size === 1 && !names.has(''),
    };
  });
}

/** האחים של תלמיד/ה (בלי התלמיד/ה עצמו/ה) */
export const siblingsOf = <T extends Pick<Student, 'id' | 'family_id'>>(s: T, students: T[]) =>
  s.family_id == null ? [] : students.filter((x) => x.family_id === s.family_id && x.id !== s.id);

/** מפתח קיבוץ לכרטיס משפחתי: המשפחה, או התלמיד/ה לבד */
export const familyKey = (s: Pick<Student, 'id' | 'family_id'>) => (s.family_id != null ? `f${s.family_id}` : `s${s.id}`);
