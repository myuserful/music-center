'use server';

import { monthLabel } from '../billing';
import { billClosedDays } from '../charging';
import { PAYMENT_METHODS, type CheckStatus } from '../constants';
import { validDate } from '../day';
import { issueInternalReceipt, issueSumitReceipts } from '../receipts';
import { sumitNextReceiptNumber } from '../sumit';
import { createClient } from '../supabase/server';
import { backTo, dbMessage, done, fail, num, oneOf, str } from './util';

const HOME = '/payments';
const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' });

// ---- מחירון ----

export async function saveBillingSettings(fd: FormData) {
  const db = await createClient();
  const row = {
    price_private: num(fd, 'price_private'),
    price_maccabi_full: num(fd, 'price_maccabi_full'),
    price_maccabi_upfront: num(fd, 'price_maccabi_upfront'),
    price_maccabi_later: num(fd, 'price_maccabi_later'),
    price_fund_deposit: num(fd, 'price_fund_deposit'),
    maccabi_later_months: num(fd, 'maccabi_later_months'),
    price_trial: num(fd, 'price_trial'),
  };
  if (Object.values(row).some((v) => v === null || v < 0)) fail(HOME, 'יש למלא את כל המחירים');
  const { error } = await db.from('billing_settings').update(row).eq('id', 1);
  if (error) fail(HOME, error.code === 'PGRST204' ? 'צריך להריץ את 0045_trial_lesson.sql ב-Supabase' : dbMessage(error));
  done(HOME, 'המחירון נשמר. שיעורים שכבר חויבו נשארים במחיר הקודם');
}

// ---- חיובים ----

/** חיוב מחדש של כל הימים הסגורים בחודש: למשל אחרי שקבעו מסלול לתלמיד/ה שלא חויב/ה */
export async function rebillMonth(fd: FormData) {
  const month = str(fd, 'month').slice(0, 7);
  const back = `${HOME}?month=${month}`;
  if (!/^\d{4}-\d{2}$/.test(month)) fail(HOME, 'חודש לא תקין');
  const [y, m] = month.split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  const db = await createClient();
  let r: Awaited<ReturnType<typeof billClosedDays>>;
  try {
    r = await billClosedDays(db, { from: `${month}-01`, to: last });
  } catch (e) {
    fail(back, (e as Error).message);
  }
  const msg = `${monthLabel(`${month}-01`)}: נוספו ${r!.inserted} חיובים, הוסרו ${r!.removed}`;
  done(back, r!.unbilled ? `${msg}. ${r!.unbilled} שיעורים לא חויבו: מסלול תשלום לא ידוע` : msg);
}

/** חיוב או הנחה ידניים (הנחה = מספר שלילי) */
export async function addCharge(fd: FormData) {
  const db = await createClient();
  const studentId = num(fd, 'student_id')!;
  const back = backTo(fd, `/students/${studentId}`);
  const amount = num(fd, 'amount');
  const description = str(fd, 'description');
  if (amount === null || amount === 0 || !description) fail(back, 'יש למלא תיאור וסכום');
  const date = validDate(str(fd, 'date')) ? str(fd, 'date') : today();
  const { error } = await db.from('lesson_charges').insert({
    student_id: studentId, lesson_date: date, due_date: date, kind: 'manual', description, amount,
  });
  if (error) fail(back, dbMessage(error));
  done(back, amount! < 0 ? 'ההנחה נוספה' : 'החיוב נוסף');
}

/** מחיקת חיוב ידני (חיובי שיעורים משתנים רק דרך סגירת יום) */
export async function deleteCharge(fd: FormData) {
  const db = await createClient();
  const back = backTo(fd, HOME);
  const { error } = await db.from('lesson_charges').delete().eq('id', num(fd, 'id')!).eq('kind', 'manual');
  if (error) fail(back, dbMessage(error));
  done(back, 'החיוב נמחק');
}

/** ההורים הביאו התחייבות: הפיקדונות שנבחרו חוזרים אליהם (נשארים כזכות עד שמחזירים) */
export async function markCommitment(fd: FormData) {
  const db = await createClient();
  const back = backTo(fd, HOME);
  const ids = fd.getAll('id').map(Number).filter(Boolean);
  if (!ids.length) fail(back, 'לא נבחרו שיעורים');
  const date = validDate(str(fd, 'commitment_on')) ? str(fd, 'commitment_on') : today();
  const { error } = await db.from('lesson_charges')
    .update({ commitment_on: date, commitment_ref: str(fd, 'commitment_ref') })
    .in('id', ids).eq('kind', 'deposit');
  if (error) fail(back, dbMessage(error));
  done(back, `התחייבות נרשמה ל-${ids.length} שיעורים. הפיקדון עבר לזכות ההורים`);
}

export async function undoCommitment(fd: FormData) {
  const db = await createClient();
  const back = backTo(fd, HOME);
  const { error } = await db.from('lesson_charges').update({ commitment_on: null, commitment_ref: '' })
    .eq('id', num(fd, 'id')!).eq('kind', 'deposit');
  if (error) fail(back, dbMessage(error));
  done(back, 'ההתחייבות בוטלה. הפיקדון חזר להיות חיוב');
}

// ---- תשלומים ----

/** תשלום מההורים, או החזר להורים (refund=1) */
export async function addPayment(fd: FormData) {
  const db = await createClient();
  const studentId = num(fd, 'student_id')!;
  const back = backTo(fd, `/students/${studentId}`);
  const method = oneOf(str(fd, 'method'), PAYMENT_METHODS);
  const amount = num(fd, 'amount');
  if (!method || !amount || amount <= 0) fail(back, 'יש למלא סכום ואמצעי תשלום');
  const isCheck = method === 'check';
  const refund = str(fd, 'refund') === '1';
  // כמה מהתשלום לזיכוי מכבי (השאר לשיעורים)
  const maccabi = refund ? 0 : num(fd, 'maccabi_amount') ?? 0;
  if (maccabi < 0 || maccabi > amount!) fail(back, 'הסכום לזיכוי מכבי צריך להיות בין 0 לסכום התשלום');
  const row = {
    student_id: studentId,
    paid_on: str(fd, 'paid_on') || today(),
    amount,
    method,
    reference: str(fd, 'reference'),
    check_number: isCheck ? str(fd, 'check_number') : '',
    check_bank: isCheck ? str(fd, 'check_bank') : '',
    check_date: isCheck ? str(fd, 'check_date') || null : null,
    check_status: isCheck && !refund ? 'pending' : null,
    notes: str(fd, 'notes'),
    refund,
    // רק כשיש חלק למכבי (כדי שתשלום רגיל יעבוד גם לפני שמריצים את 0043)
    ...(maccabi > 0 ? { maccabi_amount: maccabi } : {}),
  };
  const { data, error } = await db.from('payments').insert(row).select('id').single();
  if (error || !data) fail(back, error?.code === 'PGRST204' || error?.code === '23514'
    ? `צריך להריץ את ${maccabi > 0 ? '0043_payment_maccabi_part.sql' : '0041_lesson_billing.sql'} ב-Supabase` : dbMessage(error!));
  if (refund) done(back, 'ההחזר נרשם');

  // אישור פנימי (למשל על פיקדון)
  // done/fail עושים redirect (זורקים חריגה), אז הם מחוץ ל-try - אחרת ה-catch תופס אותם כשגיאה
  if (str(fd, 'receipt') === 'internal') {
    let msg: string;
    try {
      msg = `התשלום נרשם ואישור ${(await issueInternalReceipt(db, data!.id)).number} הופק`;
    } catch (e) {
      fail(back, `התשלום נרשם, אבל האישור לא הופק: ${(e as Error).message}`);
    }
    done(back, msg!);
  }
  // קבלה ב-SUMIT מיד (מזומן, העברה, צ'ק). באשראי הקבלה יוצאת ב-SUMIT עצמו
  if (str(fd, 'receipt') === 'sumit' && method !== 'credit') {
    let msg: string;
    try {
      msg = `התשלום נרשם. ${receiptsMsg(await issueSumitReceipts(db, data!.id, str(fd, 'email') === '1'))}`;
    } catch (e) {
      fail(back, `התשלום נרשם, אבל הקבלה לא הופקה: ${(e as Error).message}`);
    }
    done(back, msg!);
  }
  done(back, 'התשלום נרשם');
}

export async function deletePayment(fd: FormData) {
  const db = await createClient();
  const back = backTo(fd, HOME);
  // קבלות ב-SUMIT נמחקות מהמערכת יחד עם התשלום, אבל לא מתבטלות ב-SUMIT - מזכירים לבטל שם
  const { data: rs } = await db.from('receipts').select('number').eq('payment_id', num(fd, 'id')!).not('sumit_document_id', 'is', null);
  const { error } = await db.from('payments').delete().eq('id', num(fd, 'id')!);
  if (error) fail(back, dbMessage(error));
  done(back, rs?.length
    ? `התשלום נמחק. לא לשכוח לבטל ב-SUMIT את ${rs.length > 1 ? 'הקבלות' : 'הקבלה'} ${rs.map((r) => r.number).join(', ')}`
    : 'התשלום נמחק');
}

export async function setCheckStatus(fd: FormData) {
  const db = await createClient();
  const back = backTo(fd, HOME);
  const status = oneOf(str(fd, 'check_status'), ['pending', 'deposited', 'bounced'] as CheckStatus[]);
  if (!status) fail(back, 'סטטוס לא תקין');
  const { error } = await db.from('payments').update({ check_status: status }).eq('id', num(fd, 'id')!);
  if (error) fail(back, dbMessage(error));
  done(back, status === 'bounced' ? "הצ'ק סומן כחוזר. הסכום חזר ליתרת החוב" : 'עודכן');
}

// ---- קבלות ----

const receiptsMsg = (rs: { number: string }[]) =>
  rs.length > 1 ? `הופקו ב-SUMIT קבלות ${rs.map((r) => r.number).join(', ')}` : `קבלה ${rs[0]?.number ?? ''} הופקה ב-SUMIT`;

/** הפקת קבלות ב-SUMIT לתשלום שכבר נרשם */
export async function issueReceipt(fd: FormData) {
  const db = await createClient();
  const back = backTo(fd, HOME);
  let msg: string;
  try {
    msg = receiptsMsg(await issueSumitReceipts(db, num(fd, 'id')!, str(fd, 'email') === '1'));
  } catch (e) {
    fail(back, (e as Error).message);
  }
  done(back, msg!);
}

/** אישור קבלה פנימי (לא ב-SUMIT): למשל על פיקדון */
export async function issueInternal(fd: FormData) {
  const db = await createClient();
  const back = backTo(fd, HOME);
  let msg: string;
  try {
    msg = `אישור ${(await issueInternalReceipt(db, num(fd, 'id')!)).number} הופק`;
  } catch (e) {
    fail(back, (e as Error).message);
  }
  done(back, msg!);
}

/** מספר קבלה שהוקלד ביד (למשל קבלה על תשלום באשראי שהופקה ב-SUMIT עצמו) */
export async function addManualReceipt(fd: FormData) {
  const db = await createClient();
  const back = backTo(fd, HOME);
  const number = str(fd, 'number');
  if (!number) fail(back, 'חסר מספר קבלה');
  const { data: p } = await db.from('payments').select('id, student_id, amount, paid_on').eq('id', num(fd, 'id')!).single();
  if (!p) fail(back, 'התשלום לא נמצא');
  const { error } = await db.from('receipts').insert({
    payment_id: p!.id, student_id: p!.student_id, number, amount: p!.amount, issued_on: p!.paid_on,
    kind: str(fd, 'kind') === 'maccabi_later' ? 'maccabi_later' : 'lesson', source: 'manual',
  });
  if (error) fail(back, error.code === '42P01' || error.code === 'PGRST205' ? 'צריך להריץ את 0042_sumit_receipts.sql ב-Supabase' : dbMessage(error));
  done(back, 'מספר הקבלה נשמר');
}

/** מחיקת מספר קבלה שהוקלד ביד או אישור פנימי (קבלה מ-SUMIT מבטלים ב-SUMIT) */
export async function deleteReceipt(fd: FormData) {
  const db = await createClient();
  const back = backTo(fd, HOME);
  const { error } = await db.from('receipts').delete().eq('id', num(fd, 'id')!).is('sumit_document_id', null);
  if (error) fail(back, dbMessage(error));
  done(back, 'מספר הקבלה נמחק');
}

/** בדיקת החיבור ל-SUMIT בלי ליצור כלום */
export async function testSumit() {
  let next: number;
  try {
    next = await sumitNextReceiptNumber();
  } catch (e) {
    fail(HOME, (e as Error).message);
  }
  done(HOME, `החיבור ל-SUMIT עובד. מספר הקבלה הבא: ${next!}`);
}

// ---- שיעור ניסיון ----

/**
 * לא ממשיכים אחרי שיעור ניסיון (בהסכמה): התלמיד/ה עובר/ת למסלול "שיעור ניסיון", והשיעורים שכבר חויבו
 * מחויבים מחדש במחיר שיעור ניסיון בלבד (במקום מחיר רגיל / מכבי / פיקדון). הסטטוס: לא פעיל/ה.
 * release: גם להסיר את השיבוץ הקבוע (מפנה את המקום אצל המורה)
 */
export async function stopAfterTrial(fd: FormData) {
  const db = await createClient();
  const studentId = num(fd, 'student_id')!;
  const back = backTo(fd, `/students/${studentId}#account`);

  const { error } = await db.from('students').update({ payment_track: 'trial', status: 'inactive' }).eq('id', studentId);
  if (error) fail(back, error.code === '23514' ? 'צריך להריץ את 0045_trial_lesson.sql ב-Supabase' : dbMessage(error));

  // החיובים של השיעורים (חוץ מידניים ומפיקדון שכבר הביאו עליו התחייבות) נמחקים ונוצרים מחדש במחיר שיעור ניסיון
  const { data: old, error: ce } = await db.from('lesson_charges').select('id, lesson_date')
    .eq('student_id', studentId).neq('kind', 'manual').is('commitment_on', null);
  if (ce) fail(back, dbMessage(ce));
  const dates = (old ?? []).map((c) => c.lesson_date as string).sort();
  let rebilled = 0;
  if (dates.length) {
    const { error: de } = await db.from('lesson_charges').delete().in('id', old!.map((c) => c.id));
    if (de) fail(back, dbMessage(de));
    try {
      rebilled = (await billClosedDays(db, { from: dates[0], to: dates.at(-1)! })).inserted;
    } catch (e) {
      fail(back, `החיובים הישנים נמחקו אבל החדשים לא נוצרו: ${(e as Error).message}. לחצו "חיוב מחדש" בדף התשלומים`);
    }
  }

  let released = 0;
  if (str(fd, 'release') === '1') {
    const { data: gone, error: le } = await db.from('lessons').delete().eq('student_id', studentId).select('id');
    if (le) fail(back, dbMessage(le));
    released = gone?.length ?? 0;
  }
  done(back, [
    'עבר/ה למסלול שיעור ניסיון וסומן/ה כלא פעיל/ה',
    dates.length ? `${rebilled} שיעורים חויבו מחדש במחיר שיעור ניסיון` : 'עוד לא היו שיעורים מחויבים (השיעור יחויב במחיר ניסיון כשהיום ייסגר)',
    released ? `השיבוץ הקבוע הוסר (${released})` : '',
  ].filter(Boolean).join('. '));
}
