import 'server-only';
import { changedShared, contactKey, mergeShared, missingContacts, type SharedDetails } from './siblings';
import type { DB } from './supabase/server';
import type { Contact } from './types';

/** האחים של תלמיד/ה (בלי התלמיד/ה עצמו/ה) */
async function siblingIds(db: DB, studentId: number): Promise<number[]> {
  const { data: s } = await db.from('students').select('family_id').eq('id', studentId).maybeSingle();
  if (s?.family_id == null) return [];
  const { data, error } = await db.from('students').select('id').eq('family_id', s.family_id).neq('id', studentId);
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => r.id as number);
}

/** התלמידים שנבחרו וכל האחים שלהם */
export async function withFamilies(db: DB, studentIds: number[]): Promise<number[]> {
  const { data } = await db.from('students').select('family_id').in('id', studentIds);
  const families = [...new Set((data ?? []).map((r) => r.family_id as number | null).filter((f): f is number => f != null))];
  if (!families.length) return studentIds;
  const { data: rows, error } = await db.from('students').select('id').in('family_id', families);
  if (error) throw new Error(error.message);
  return [...new Set([...studentIds, ...(rows ?? []).map((r) => r.id as number)])];
}

/** אחרי קישור: כל אחד/ת במשפחה משלים/ה מייל, חוזה, אשראי ואנשי קשר מהאחרים. מחזיר את כל בני המשפחה */
export async function mergeFamily(db: DB, familyId: number): Promise<number[]> {
  const { data: students, error } = await db.from('students')
    .select('id, email, no_email, contract_signed, card_on_file').eq('family_id', familyId);
  if (error) throw new Error(error.message);
  const ids = (students ?? []).map((s) => s.id as number);
  const { data: contacts, error: ce } = await db.from('contacts').select('*').in('student_id', ids);
  if (ce) throw new Error(ce.message);

  for (const { id, update } of mergeShared((students ?? []) as (SharedDetails & { id: number })[])) {
    const { error: e } = await db.from('students').update(update).eq('id', id);
    if (e) throw new Error(e.message);
  }
  const inserts = missingContacts(ids, (contacts ?? []) as Contact[]);
  if (inserts.length) {
    const { error: e } = await db.from('contacts').insert(inserts);
    if (e) throw new Error(e.message);
  }
  return ids;
}

/** אחרי שמירת כרטיס: מה ששונה במייל, בחוזה ובאשראי מתעדכן אצל האחים. מחזיר אם משהו עודכן */
export async function syncSharedDetails(db: DB, studentId: number, familyId: number | null, before: SharedDetails, after: SharedDetails) {
  if (familyId == null) return false;
  const changes = changedShared(before, after);
  if (!Object.keys(changes).length) return false;
  const q = db.from('students').update(changes).eq('family_id', familyId).neq('id', studentId);
  // "אין מייל" לא מוחק מייל שרשום אצל אח/ות
  const { error } = await (changes.no_email ? q.eq('email', '') : q);
  if (error) throw new Error(error.message);
  return true;
}

/** איש קשר חדש נוסף גם אצל האחים. אם כבר יש שם אותו אחד - רק מסמנים ראשי, אם צריך */
export async function addContactToSiblings(db: DB, studentId: number, row: Omit<Contact, 'id' | 'student_id'>) {
  const ids = await siblingIds(db, studentId);
  if (!ids.length) return;
  const { data, error } = await db.from('contacts').select('*').in('student_id', ids);
  if (error) throw new Error(error.message);
  const key = contactKey(row);
  for (const id of ids) {
    const match = ((data ?? []) as Contact[]).find((c) => c.student_id === id && contactKey(c) === key);
    if (row.is_primary) {
      const { error: e } = await db.from('contacts').update({ is_primary: false }).eq('student_id', id);
      if (e) throw new Error(e.message);
    }
    const { error: e } = match
      ? (row.is_primary ? await db.from('contacts').update({ is_primary: true }).eq('id', match.id) : { error: null })
      : await db.from('contacts').insert({ ...row, student_id: id });
    if (e) throw new Error(e.message);
  }
}

/** איש קשר שנמחק נמחק גם אצל האחים, אלא אם נשאר אצל התלמיד/ה עוד איש קשר עם אותו טלפון */
export async function removeContactFromSiblings(db: DB, removed: Contact) {
  const ids = await siblingIds(db, removed.student_id);
  if (!ids.length) return;
  const key = contactKey(removed);
  const { data: own } = await db.from('contacts').select('*').eq('student_id', removed.student_id);
  if (((own ?? []) as Contact[]).some((c) => contactKey(c) === key)) return;
  const { data, error } = await db.from('contacts').select('*').in('student_id', ids);
  if (error) throw new Error(error.message);
  const gone = ((data ?? []) as Contact[]).filter((c) => contactKey(c) === key).map((c) => c.id);
  if (gone.length) {
    const { error: e } = await db.from('contacts').delete().in('id', gone);
    if (e) throw new Error(e.message);
  }
}
