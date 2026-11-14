'use server';

import { headers } from 'next/headers';
import { sendMail } from '../mail';
import { ROLE_LABELS, type Role } from '../roles';
import { createAdminClient } from '../supabase/admin';
import { createClient } from '../supabase/server';
import { adminOnly, dbMessage, done, fail, oneOf, str } from './util';

const HOME = '/users';
/** תפקידים שאפשר לתת כרגע (למורים ולהורים עוד אין מסכים) */
const ROLES: Role[] = ['admin', 'secretary'];
const NO_KEY = 'חסר SUPABASE_SECRET_KEY בהגדרות השרת';

/** כתובת האתר: באתר החי הכתובת הקבועה של Vercel, אחרת הכתובת שממנה נשלחה הבקשה */
async function siteUrl(): Promise<string> {
  const prod = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (prod) return `https://${prod}`;
  const h = await headers();
  return h.get('origin') ?? `${h.get('x-forwarded-proto') ?? 'https'}://${h.get('host')}`;
}

/** מייל הזמנה עם קישור למסך הכניסה. מחזיר הודעת שגיאה, או null אם נשלח */
async function mailSiteLink(email: string, role: Role): Promise<string | null> {
  const url = `${await siteUrl()}/login`;
  try {
    await sendMail({
      to: email,
      subject: 'הזמנה למערכת של מקצב',
      text: [
        'שלום,',
        '',
        `נפתחה לך גישה למערכת של מקצב (תפקיד: ${ROLE_LABELS[role]}).`,
        '',
        `כדי להיכנס: ${url}`,
        '',
        'במסך הכניסה מזינים את כתובת המייל הזו ולוחצים "שליחת קישור כניסה".',
        'יגיע מייל נוסף עם קישור, ולוחצים עליו כדי להיכנס. לא צריך סיסמה.',
        '',
        'כדאי לשמור את הכתובת במועדפים.',
        '',
        'מקצב',
      ].join('\n'),
    });
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}

/** המשתמש המחובר (כדי שמנהל לא יוריד את ההרשאה של עצמו בטעות) */
async function myId(): Promise<string | null> {
  const db = await createClient();
  const { data } = await db.auth.getClaims();
  return data?.claims.sub ?? null;
}

/** משתמש חדש: יוצרים חשבון ונותנים תפקיד, ואם סימנו - שולחים לו מייל עם קישור לאתר */
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

  if (fd.get('send_link')) {
    const mailError = await mailSiteLink(email, role!);
    if (mailError) fail(HOME, `${email} נוסף/ה, אבל המייל לא נשלח: ${mailError}`);
    done(HOME, `${email} נוסף/ה ונשלח אליו/ה מייל עם קישור לאתר`);
  }
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

/** שליחה (או שליחה חוזרת) של מייל עם קישור לאתר למשתמש קיים */
export async function sendSiteLink(fd: FormData) {
  await adminOnly(HOME);
  const id = str(fd, 'user_id');
  if (!id) fail(HOME, 'חסרים פרטים');
  const admin = createAdminClient();
  if (!admin) fail(HOME, NO_KEY);

  const [{ data: u, error: ue }, { data: r }] = await Promise.all([
    admin!.auth.admin.getUserById(id),
    admin!.from('user_roles').select('role').eq('user_id', id).maybeSingle(),
  ]);
  const email = u?.user?.email;
  if (ue || !email) fail(HOME, 'המשתמש לא נמצא');
  if (!r?.role) fail(HOME, 'למשתמש הזה אין גישה. קודם נותנים לו תפקיד');

  const mailError = await mailSiteLink(email!, r!.role as Role);
  if (mailError) fail(HOME, mailError);
  done(HOME, `נשלח מייל עם קישור לאתר ל-${email}`);
}
