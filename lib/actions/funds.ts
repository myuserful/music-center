'use server';

import { createClient } from '../supabase/server';
import { backTo, dbMessage, done, fail, num, str } from './util';

const FLAGS = ['has_referral', 'hmo_reported'] as const;
type Flag = (typeof FLAGS)[number];

/** הפעלה/כיבוי של "יש הפניה" או "נשלח לקופה" לתלמיד/ה אחד/ת מתוך לוח הקופות */
export async function setFundFlag(fd: FormData) {
  const back = backTo(fd, '/funds');
  const id = num(fd, 'id');
  const flag = str(fd, 'flag') as Flag;
  if (!id || !FLAGS.includes(flag)) fail(back, 'בקשה לא תקינה');
  const db = await createClient();
  const { error } = await db.from('students').update({ [flag]: str(fd, 'value') === '1' }).eq('id', id!);
  if (error) fail(back, dbMessage(error));
  done(back, 'עודכן');
}

/** סימון כל התלמידים שברשימה (אחרי סינון) כנשלחו / לא נשלחו לקופה */
export async function setSentMany(fd: FormData) {
  const back = backTo(fd, '/funds');
  const ids = str(fd, 'ids').split(',').map(Number).filter((n) => Number.isInteger(n) && n > 0);
  if (ids.length === 0) fail(back, 'אין תלמידים ברשימה');
  const value = str(fd, 'value') === '1';
  const db = await createClient();
  const { error } = await db.from('students').update({ hmo_reported: value }).in('id', ids);
  if (error) fail(back, dbMessage(error));
  done(back, `${ids.length} תלמידים סומנו כ${value ? 'נשלחו' : 'לא נשלחו'} לקופה`);
}
