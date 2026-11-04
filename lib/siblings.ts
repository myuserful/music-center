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

/** הפרטים המשותפים לכל המשפחה בכרטיס התלמיד/ה (טלפונים נמצאים באנשי הקשר) */
export type SharedDetails = Pick<Student, 'email' | 'no_email' | 'contract_signed' | 'card_on_file'>;

/** מה השתנה בפרטים המשותפים בשמירת כרטיס. מייל ו"אין מייל" תמיד יחד. בלי שינוי - לא נוגעים באחים */
export function changedShared(before: SharedDetails, after: SharedDetails): Partial<SharedDetails> {
  const out: Partial<SharedDetails> = {};
  if ((before.email ?? '') !== (after.email ?? '') || !!before.no_email !== !!after.no_email) {
    out.email = after.email;
    out.no_email = after.no_email;
  }
  if (!!before.contract_signed !== !!after.contract_signed) out.contract_signed = after.contract_signed;
  if (!!before.card_on_file !== !!after.card_on_file) out.card_on_file = after.card_on_file;
  return out;
}

/**
 * כשמקשרים אחים: משלימים מה שחסר אצל כל אחד/ת ממה שיש אצל האחרים.
 * חוזה ואשראי: מספיק שאצל אחד/ת יש. מייל: רק למי שאין. שני מיילים שונים נשארים כמו שהם
 */
export function mergeShared(students: (SharedDetails & { id: number })[]): { id: number; update: Partial<SharedDetails> }[] {
  const sorted = [...students].sort((a, b) => a.id - b.id);
  const contract = sorted.some((s) => s.contract_signed);
  const card = sorted.some((s) => s.card_on_file);
  const email = sorted.map((s) => (s.email ?? '').trim()).find(Boolean) ?? '';
  const noEmail = sorted.some((s) => s.no_email);
  return sorted.flatMap((s) => {
    const update: Partial<SharedDetails> = {};
    if (contract && !s.contract_signed) update.contract_signed = true;
    if (card && !s.card_on_file) update.card_on_file = true;
    if (!(s.email ?? '').trim()) {
      if (email) {
        update.email = email;
        if (s.no_email) update.no_email = false;
      } else if (noEmail && !s.no_email) update.no_email = true;
    }
    return Object.keys(update).length ? [{ id: s.id, update }] : [];
  });
}

type ContactFields = Pick<Contact, 'name' | 'relation' | 'phone' | 'email' | 'is_primary'>;

/** איש קשר "זהה" אצל אח/ות: אותו טלפון, ואם אין טלפון - אותו מייל, ואם גם לא - אותו שם */
export const contactKey = (c: Pick<Contact, 'name' | 'phone' | 'email'>) =>
  normalizePhone(c.phone) || (c.email ?? '').trim().toLowerCase() || (c.name ?? '').trim();

/** אנשי הקשר שחסרים אצל כל אח/ות. מי שאין לו/ה ראשי מקבל/ת את הראשי של האחים */
export function missingContacts(studentIds: number[], contacts: (ContactFields & { student_id: number })[]) {
  const sources = [...contacts].sort((a, b) => Number(b.is_primary) - Number(a.is_primary));
  return studentIds.flatMap((id) => {
    const own = contacts.filter((c) => c.student_id === id);
    const have = new Set(own.map(contactKey));
    let hasPrimary = own.some((c) => c.is_primary);
    return sources.filter((c) => c.student_id !== id).flatMap((c) => {
      const key = contactKey(c);
      if (!key || have.has(key)) return [];
      have.add(key);
      const is_primary = !hasPrimary && c.is_primary;
      hasPrimary ||= is_primary;
      return [{ student_id: id, name: c.name, relation: c.relation, phone: c.phone, email: c.email, is_primary }];
    });
  });
}

/** מפתח קיבוץ לכרטיס משפחתי: המשפחה, או התלמיד/ה לבד */
export const familyKey = (s: Pick<Student, 'id' | 'family_id'>) => (s.family_id != null ? `f${s.family_id}` : `s${s.id}`);
