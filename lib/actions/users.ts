'use server';

import type { Role } from '../roles';
import { createAdminClient } from '../supabase/admin';
import { createClient } from '../supabase/server';
import { adminOnly, dbMessage, done, fail, oneOf, str } from './util';

const HOME = '/users';
/** תפקידים שאפשר לתת כרגע (למורים ולהורים עוד אין מסכים) */
const ROLES: Role[] = ['admin', 'secretary'];
const NO_KEY = 'חסר SUPABASE_SECRET_KEY בהגדרות השרת';

/** המשתמש המחובר (כדי שמנהל לא יוריד את ההרשאה של עצמו בטעות) */
async function myId(): Promise<string | null> {
  const db = await createClient();
  const { data } = await db.auth.getClaims();
  return data?.claims.sub ?? null;
}

/** משתמש חדש: יוצרים חשבון (בלי לשלוח מייל) ונותנים תפקיד. הוא נכנס רגיל במסך הכניסה */
export async function addUser(fd: FormData) {
  await adminOnly(HOME);
  const email = str(fd, 'email').toLowerCase();
  const role = oneOf(str(fd, 'role'), ROLES);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) fail(HOME, 'כתובת המייל לא תקינה');
  if (!role) fail(HOME, 'יש לבחור תפקיד');

  const admin = createAdminClient();
  if (!admin) fail(HOME, NO_KEY);

  // אולי כבר יש חשבון למייל הזה (למשל משתמש שהגישה שלו הוסרה)
  const { data: list, error: le } = await admin!.auth.admin.listUsers({ perPage: 1000 });
  if (le) fail(HOME, le.message);
  let id = list!.users.find((u) => u.email?.toLowerCase() === email)?.id;
  if (!id) {
    const { data, error } = await admin!.auth.admin.createUser({ email, email_confirm: true });
    if (error) fail(HOME, `לא הצלחתי ליצור משתמש: ${error.message}`);
    id = data!.user!.id;
  }

  const { error } = await admin!.from('user_roles').upsert({ user_id: id, role, teacher_id: null, family_id: null });
  if (error) fail(HOME, dbMessage(error));
  done(HOME, `${email} נוסף/ה. אפשר להיכנס מעכשיו במסך הכניסה עם המייל הזה`);
}

export async function setUserRole(fd: FormData) {
  await adminOnly(HOME);
  const id = str(fd, 'user_id');
  const role = oneOf(str(fd, 'role'), ROLES);
  if (!id || !role) fail(HOME, 'חסרים פרטים');
  if (id === (await myId()) && role !== 'admin') fail(HOME, 'אי אפשר להוריד את ההרשאה של עצמך');

  const db = await createClient();
  const { error } = await db.from('user_roles').upsert({ user_id: id, role, teacher_id: null, family_id: null });
  if (error) fail(HOME, dbMessage(error));
  done(HOME, 'התפקיד עודכן');
}

/** הסרת גישה: החשבון נשאר, אבל בלי תפקיד הוא לא רואה כלום */
export async function removeUserAccess(fd: FormData) {
  await adminOnly(HOME);
  const id = str(fd, 'user_id');
  if (!id) fail(HOME, 'חסרים פרטים');
  if (id === (await myId())) fail(HOME, 'אי אפשר להסיר את הגישה של עצמך');

  const db = await createClient();
  const { error } = await db.from('user_roles').delete().eq('user_id', id);
  if (error) fail(HOME, dbMessage(error));
  done(HOME, 'הגישה הוסרה');
}
