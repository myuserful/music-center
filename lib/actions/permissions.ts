'use server';

import { ALL_PERMS, EDITABLE_ROLES } from '../permissions';
import { createClient } from '../supabase/server';
import { adminOnly, dbMessage, done, fail, oneOf, str } from './util';

const HOME = '/permissions';

/** שמירת כל ההרשאות של תפקיד אחד (מה שסומן בטופס) */
export async function saveRolePermissions(fd: FormData) {
  await adminOnly(HOME);
  const role = oneOf(str(fd, 'role'), [...EDITABLE_ROLES]);
  if (!role) fail(HOME, 'תפקיד לא תקין');
  const chosen = ALL_PERMS.filter((p) => fd.get(`perm_${p}`));

  const db = await createClient();
  // קודם מוסיפים את מה שסומן, ורק אז מוחקים את השאר (כך שגיאה באמצע לא מוחקת הכול)
  if (chosen.length) {
    const { error } = await db.from('role_permissions')
      .upsert(chosen.map((perm) => ({ role, perm })), { ignoreDuplicates: true });
    if (error) fail(HOME, error.code === '42P01' || error.code === 'PGRST205' ? 'צריך להריץ את 0064_role_permissions.sql ב-Supabase' : dbMessage(error));
  }
  let del = db.from('role_permissions').delete().eq('role', role!);
  if (chosen.length) del = del.not('perm', 'in', `(${chosen.join(',')})`);
  const { error: de } = await del;
  if (de) fail(HOME, dbMessage(de));
  done(HOME, 'ההרשאות נשמרו. הן חלות מהכניסה הבאה למסך');
}
