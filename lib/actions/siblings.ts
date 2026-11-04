'use server';

import { revalidatePath } from 'next/cache';
import { mergeFamily } from '../familySync';
import { createClient } from '../supabase/server';
import { dbMessage } from './util';

type Result = { ok: true } | { ok: false; error: string };

function refresh(ids: number[]) {
  revalidatePath('/siblings');
  revalidatePath('/calls');
  for (const id of ids) revalidatePath(`/students/${id}`);
}

/**
 * סימון תלמידים כאחים: כולם לאותה משפחה.
 * אם חלקם כבר במשפחות - המשפחות מתאחדות (לתוך הוותיקה מביניהן).
 */
export async function linkSiblings(studentIds: number[]): Promise<Result> {
  const ids = [...new Set(studentIds.filter(Number.isInteger))];
  if (ids.length < 2) return { ok: false, error: 'צריך לבחור לפחות שני תלמידים' };
  const db = await createClient();
  const { data: rows, error: e1 } = await db.from('students').select('id,family_id').in('id', ids);
  if (e1) return { ok: false, error: dbMessage(e1) };

  const families = [...new Set((rows ?? []).map((r) => r.family_id as number | null).filter((f): f is number => f != null))].sort((a, b) => a - b);
  let family = families[0];
  if (family == null) {
    const { data, error } = await db.from('families').insert({}).select('id').single();
    if (error || !data) return { ok: false, error: error ? dbMessage(error) : 'לא נוצרה משפחה' };
    family = data.id;
  }
  const others = families.slice(1);
  const updates = [db.from('students').update({ family_id: family }).in('id', ids)];
  if (others.length) updates.push(db.from('students').update({ family_id: family }).in('family_id', others));
  const error = (await Promise.all(updates)).find((r) => r.error)?.error;
  if (error) return { ok: false, error: dbMessage(error) };
  if (others.length) await db.from('families').delete().in('id', others);
  // מייל, חוזה, אשראי ואנשי קשר: כל אחד/ת משלים/ה מה שחסר מהאחרים. כל מקומות הקישור עוברים כאן
  try {
    refresh(await mergeFamily(db, family));
  } catch (e) {
    refresh(ids);
    return { ok: false, error: `האחים קושרו, אבל הפרטים לא הושלמו: ${(e as Error).message}` };
  }
  return { ok: true };
}

/** "לא אחים": כל הזוגות בקבוצה לא יוצעו שוב */
export async function rejectSiblings(studentIds: number[]): Promise<Result> {
  const ids = [...new Set(studentIds)].sort((a, b) => a - b);
  const pairs = ids.flatMap((a, i) => ids.slice(i + 1).map((b) => ({ student_a: a, student_b: b })));
  if (!pairs.length) return { ok: true };
  const db = await createClient();
  const { error } = await db.from('sibling_rejections').upsert(pairs, { onConflict: 'student_a,student_b', ignoreDuplicates: true });
  if (error) return { ok: false, error: dbMessage(error) };
  refresh(ids);
  return { ok: true };
}

/** הוצאת תלמיד/ה מהמשפחה. אם נשאר/ה רק אחד/ת - גם המשפחה נסגרת */
export async function unlinkSibling(studentId: number): Promise<Result> {
  const db = await createClient();
  const { data: s, error: e1 } = await db.from('students').select('family_id').eq('id', studentId).single();
  if (e1 || !s) return { ok: false, error: e1 ? dbMessage(e1) : 'התלמיד/ה לא נמצא/ה' };
  if (s.family_id == null) return { ok: true };
  const { error: e2 } = await db.from('students').update({ family_id: null }).eq('id', studentId);
  if (e2) return { ok: false, error: dbMessage(e2) };

  const { data: rest } = await db.from('students').select('id').eq('family_id', s.family_id);
  if ((rest ?? []).length <= 1) {
    await db.from('students').update({ family_id: null }).eq('family_id', s.family_id);
    await db.from('families').delete().eq('id', s.family_id);
  }
  // שלא יוצע שוב כאח/ות של מי שנשארו
  const others = (rest ?? []).map((r) => r.id as number);
  if (others.length) {
    await db.from('sibling_rejections').upsert(
      others.map((o) => ({ student_a: Math.min(o, studentId), student_b: Math.max(o, studentId) })),
      { onConflict: 'student_a,student_b', ignoreDuplicates: true },
    );
  }
  refresh([studentId, ...others]);
  return { ok: true };
}

/** קישור ידני מכרטיס התלמיד/ה (מוחק "לא אחים" אם סומן קודם בטעות) */
export async function linkFromForm(fd: FormData) {
  const a = Number(fd.get('student_id')), b = Number(fd.get('sibling_id'));
  if (!a || !b || a === b) return;
  const db = await createClient();
  await db.from('sibling_rejections').delete().eq('student_a', Math.min(a, b)).eq('student_b', Math.max(a, b));
  const res = await linkSiblings([a, b]);
  if (!res.ok) console.error('linkSiblings:', res.error);
}

export async function unlinkFromForm(fd: FormData) {
  const id = Number(fd.get('student_id'));
  if (id) await unlinkSibling(id);
}
