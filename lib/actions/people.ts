'use server';

import {
  COMMITMENT_FUNDS, DEFAULT_LANGUAGE, GENDER_LABELS, LESSON_MINUTES, HEALTH_FUND_LABELS, INTEREST_LABELS, PAYMENT_TRACKS, STUDENT_STATUSES,
  TEACHER_GENDER_LABELS,
  type CommitmentFund, type Gender, type HealthFund, type Interest, type TeacherGender,
} from '../constants';
import { SIBLING_DEFAULT_AMOUNT } from '../billing';
import { rebillStudent, syncSiblingDiscounts } from '../charging';
import { validDate } from '../day';
import { addContactToSiblings, removeContactFromSiblings, syncSharedDetails } from '../familySync';
import { createClient } from '../supabase/server';
import { overlaps, toMin } from '../time';
import type { Contact } from '../types';
import { dbMessage, done, fail, num, oneOf, str } from './util';

// ---- מורים ----

/** שפות שסומנו + שפות נוספות שהוקלדו (מופרדות בפסיק), בלי כפילויות */
function languageList(fd: FormData): string[] {
  const picked = fd.getAll('languages').map((v) => String(v).trim());
  const extra = str(fd, 'languages_other').split(/[,،/]/).map((v) => v.trim());
  return [...new Set([...picked, ...extra].filter(Boolean))];
}

export async function saveTeacher(fd: FormData) {
  const db = await createClient();
  const id = num(fd, 'id');
  const here = id ? `/teachers/${id}` : '/teachers/new';
  const row = {
    first_name: str(fd, 'first_name'),
    last_name: str(fd, 'last_name'),
    phone: str(fd, 'phone'),
    email: str(fd, 'email'),
    notes: str(fd, 'notes'),
    active: fd.get('active') === 'on',
    gender: oneOf(str(fd, 'gender'), Object.keys(TEACHER_GENDER_LABELS) as TeacherGender[]),
    teaches_young_boys: fd.get('teaches_young_boys') === 'on',
    hourly_rate: num(fd, 'hourly_rate'),
    interest: oneOf(str(fd, 'interest'), Object.keys(INTEREST_LABELS) as Interest[]),
    days_per_week: num(fd, 'days_per_week'),
    languages: languageList(fd),
    min_weekly_hours: num(fd, 'min_weekly_hours'),
    bank_name: str(fd, 'bank_name'),
    bank_branch: str(fd, 'bank_branch'),
    bank_account: str(fd, 'bank_account'),
    bank_holder: str(fd, 'bank_holder'),
  };
  // באקסל לחלק מהמורים יש רק שם פרטי
  if (!row.first_name) fail(here, 'חסר שם פרטי');
  if (row.gender !== 'female') row.teaches_young_boys = false;

  // עד שמריצים את 0054 / 0046 אין עמודות בנק / מינימום: שומרים בלעדיהן
  const { bank_name, bank_branch, bank_account, bank_holder, ...noBank } = row;
  const { min_weekly_hours: minWeekly, ...base } = noBank;
  const attempts: Record<string, unknown>[] = [row, noBank, base];
  const write = async (payload: Record<string, unknown>) => {
    if (id) return { id, error: (await db.from('teachers').update(payload).eq('id', id)).error };
    const { data, error } = await db.from('teachers').insert(payload).select('id').single();
    return { id: data?.id as number | undefined, error };
  };
  let level = 0;
  let saved = await write(attempts[0]);
  while (saved.error?.code === 'PGRST204' && level < attempts.length - 1) saved = await write(attempts[++level]);
  if (saved.error || !saved.id) fail(here, dbMessage(saved.error!));
  const teacherId = saved.id;
  const skipped = [
    level >= 1 && (bank_name || bank_branch || bank_account || bank_holder) && 'פרטי הבנק (0054_teacher_bank.sql)',
    level >= 2 && minWeekly != null && 'מינימום השעות בשבוע (0046_teacher_pay.sql)',
  ].filter(Boolean);

  // כלי נגינה וסניפים: מחליפים את כל הרשימה (שתי הטבלאות במקביל)
  const instrumentIds = fd.getAll('instrument_ids').map(Number);
  const branchIds = fd.getAll('branch_ids').map(Number);
  const [e1, e2] = await Promise.all([
    (async () => {
      await db.from('teacher_instruments').delete().eq('teacher_id', teacherId!);
      if (!instrumentIds.length) return null;
      return (await db.from('teacher_instruments')
        .insert(instrumentIds.map((instrument_id) => ({ teacher_id: teacherId, instrument_id })))).error;
    })(),
    (async () => {
      await db.from('teacher_branches').delete().eq('teacher_id', teacherId!);
      if (!branchIds.length) return null;
      return (await db.from('teacher_branches')
        .insert(branchIds.map((branch_id) => ({ teacher_id: teacherId, branch_id })))).error;
    })(),
  ]);
  const linkError = e1 ?? e2;
  if (linkError) fail(`/teachers/${teacherId}`, dbMessage(linkError));
  if (skipped.length) fail(`/teachers/${teacherId}`, `נשמר, חוץ מ: ${skipped.join(', ')}. צריך להריץ את הקובץ ב-Supabase`);
  done(`/teachers/${teacherId}`);
}

export async function deleteTeacher(fd: FormData) {
  const db = await createClient();
  const id = num(fd, 'id')!;
  const { error } = await db.from('teachers').delete().eq('id', id);
  if (error) fail(`/teachers/${id}`, 'לא ניתן למחוק מורה עם שיעורים או מקהלות. אפשר לסמן "לא פעיל/ה".');
  done('/teachers', 'נמחק');
}

export async function addTeacherHours(fd: FormData) {
  const db = await createClient();
  const teacherId = num(fd, 'teacher_id')!;
  const here = `/teachers/${teacherId}`;
  const row = {
    teacher_id: teacherId,
    weekday: num(fd, 'weekday'),
    start_time: str(fd, 'start_time'),
    end_time: str(fd, 'end_time'),
    room_id: num(fd, 'room_id'),
  };
  if (row.weekday === null || !row.start_time || !row.end_time) fail(here, 'חסרים פרטים');
  if (toMin(row.end_time) <= toMin(row.start_time)) fail(here, 'שעת הסיום חייבת להיות אחרי ההתחלה');
  const clash = await roomClash(db, row.room_id, row.weekday!, row.start_time, row.end_time, teacherId);
  if (clash) fail(here, clash);
  const { error } = await db.from('teacher_hours').insert(row);
  if (error) fail(here, dbMessage(error));
  done(here);
}

/** חדר שכבר שייך למורה אחר/ת באותו יום בשעות חופפות. מחזיר הודעת שגיאה או null */
async function roomClash(
  db: Awaited<ReturnType<typeof createClient>>, roomId: number | null, weekday: number, start: string, end: string,
  teacherId: number,
) {
  if (!roomId) return null;
  const { data } = await db.from('teacher_hours').select('start_time,end_time,teachers(first_name,last_name)')
    .eq('room_id', roomId).eq('weekday', weekday).neq('teacher_id', teacherId);
  const other = (data ?? []).find((h) => toMin(start) < toMin(h.end_time) && toMin(h.start_time) < toMin(end));
  if (!other) return null;
  const t = other.teachers as unknown as { first_name: string; last_name: string } | null;
  return `החדר כבר משויך באותו יום ל${t ? `${t.first_name} ${t.last_name}`.trim() : 'מורה אחר/ת'} (${other.start_time.slice(0, 5)}-${other.end_time.slice(0, 5)})`;
}

/**
 * עדכון שעות עבודה קיימות (יום, שעות, חדר). כל השיעורים של המורה בשעות האלה עוברים לחדר שנבחר,
 * גם אם החדר תפוס באותו זמן (שיעור של מורה אחר/ת או מקהלה) - החדר החדש גובר והשיעורים יופיעו כחופפים.
 */
export async function updateTeacherHours(fd: FormData) {
  const db = await createClient();
  const teacherId = num(fd, 'teacher_id')!;
  const here = `/teachers/${teacherId}`;
  const id = num(fd, 'id')!;
  const row = {
    weekday: num(fd, 'weekday'),
    start_time: str(fd, 'start_time'),
    end_time: str(fd, 'end_time'),
    room_id: num(fd, 'room_id'),
  };
  if (row.weekday === null || !row.start_time || !row.end_time) fail(here, 'חסרים פרטים');
  const weekday = row.weekday!;
  const start = toMin(row.start_time);
  const end = toMin(row.end_time);
  if (end <= start) fail(here, 'שעת הסיום חייבת להיות אחרי ההתחלה');

  const { data: same } = await db.from('teacher_hours').select('start_time,end_time')
    .eq('teacher_id', teacherId).eq('weekday', weekday).neq('id', id);
  if ((same ?? []).some((h) => overlaps(start, end, toMin(h.start_time), toMin(h.end_time)))) {
    fail(here, 'השעות חופפות לשעות עבודה אחרות של המורה ביום הזה');
  }
  // בכוונה בלי בדיקת חדר תפוס: החדר החדש גובר, גם אם יש בו שעות/שיעורים של מורה אחר/ת
  const { error } = await db.from('teacher_hours').update(row).eq('id', id);
  if (error) fail(here, dbMessage(error));

  const [{ data: dayLessons }, { data: dayChoirs }] = await Promise.all([
    db.from('lessons').select('id,teacher_id,room_id,start_time').eq('weekday', weekday),
    db.from('choirs').select('room_id,start_time,end_time').eq('weekday', weekday),
  ]);
  const lessons = (dayLessons ?? []).filter((l) => l.teacher_id === teacherId && toMin(l.start_time) >= start && toMin(l.start_time) < end);
  // שיעורים של המורה ביום הזה שלא נופלים באף אחת משעות העבודה (למשל אחרי שקיצרו את השעות)
  const blocks = [...(same ?? []).map((h) => [toMin(h.start_time), toMin(h.end_time)]), [start, end]];
  const outside = (dayLessons ?? []).filter((l) => l.teacher_id === teacherId &&
    !blocks.some(([a, b]) => toMin(l.start_time) >= a && toMin(l.start_time) < b)).length;

  // העברת כל השיעורים של המורה בשעות האלה לחדר החדש, גם כשהחדר תפוס (אז הם יופיעו כחופפים)
  const toMove = row.room_id ? lessons.filter((l) => l.room_id !== row.room_id) : [];
  if (toMove.length) {
    const { error: e } = await db.from('lessons').update({ room_id: row.room_id }).in('id', toMove.map((l) => l.id));
    if (e) fail(here, `שעות העבודה עודכנו, אבל העברת השיעורים לחדר נכשלה: ${dbMessage(e)}`);
  }
  const clashing = toMove.filter((l) => {
    const s = toMin(l.start_time);
    return (dayLessons ?? []).some((o) => o.teacher_id !== teacherId && o.room_id === row.room_id &&
      overlaps(s, s + LESSON_MINUTES, toMin(o.start_time), toMin(o.start_time) + LESSON_MINUTES)) ||
      (dayChoirs ?? []).some((c) => c.room_id === row.room_id && overlaps(s, s + LESSON_MINUTES, toMin(c.start_time), toMin(c.end_time)));
  }).length;

  const parts = ['שעות העבודה עודכנו'];
  if (toMove.length) parts.push(`${toMove.length} שיעורים הועברו לחדר`);
  if (clashing) parts.push(`שימו לב: ${clashing} מהם חופפים לשיעורים אחרים בחדר`);
  if (outside) parts.push(`שימו לב: ${outside} שיעורים של המורה ביום הזה מחוץ לשעות העבודה`);
  done(here, parts.join('. '));
}

export async function deleteTeacherHours(fd: FormData) {
  const db = await createClient();
  const here = `/teachers/${num(fd, 'teacher_id')}`;
  const { error } = await db.from('teacher_hours').delete().eq('id', num(fd, 'id')!);
  if (error) fail(here, dbMessage(error));
  done(here, 'נמחק');
}

type QuickResult = { ok: true } | { ok: false; error: string };

/** הוספת שעות עבודה מלוח הגרירה (בלי מעבר עמוד). לא מאפשר חפיפה עם שעות קיימות באותו יום */
export async function addHoursQuick(teacherId: number, weekday: number, start: string, end: string): Promise<QuickResult> {
  if (toMin(end) <= toMin(start)) return { ok: false, error: 'שעת הסיום חייבת להיות אחרי ההתחלה' };
  const db = await createClient();
  const { data: same } = await db.from('teacher_hours').select('start_time,end_time')
    .eq('teacher_id', teacherId).eq('weekday', weekday);
  if ((same ?? []).some((h) => toMin(start) < toMin(h.end_time) && toMin(h.start_time) < toMin(end))) {
    return { ok: false, error: 'השעות חופפות לשעות עבודה שכבר קיימות ביום הזה' };
  }
  const { error } = await db.from('teacher_hours')
    .insert({ teacher_id: teacherId, weekday, start_time: start, end_time: end });
  return error ? { ok: false, error: dbMessage(error) } : { ok: true };
}

export async function removeHoursQuick(id: number): Promise<QuickResult> {
  const db = await createClient();
  const { error } = await db.from('teacher_hours').delete().eq('id', id);
  return error ? { ok: false, error: dbMessage(error) } : { ok: true };
}

// ---- תלמידים ----

export async function saveStudent(fd: FormData) {
  const db = await createClient();
  const id = num(fd, 'id');
  const here = id ? `/students/${id}` : '/students/new';
  const row = {
    first_name: str(fd, 'first_name'),
    last_name: str(fd, 'last_name'),
    school: str(fd, 'school'),
    birth_date: str(fd, 'birth_date') || null,
    birth_date_approx: !!str(fd, 'birth_date') && fd.get('birth_date_approx') === 'on',
    branch_id: num(fd, 'branch_id'),
    requested_instrument_id: num(fd, 'requested_instrument_id'),
    second_instrument_id: num(fd, 'second_instrument_id'),
    notes: str(fd, 'notes'),
    status: oneOf(str(fd, 'status'), STUDENT_STATUSES) ?? 'active',
    gender: oneOf(str(fd, 'gender'), Object.keys(GENDER_LABELS) as Gender[]),
    health_fund: oneOf(str(fd, 'health_fund'), Object.keys(HEALTH_FUND_LABELS) as HealthFund[]),
    health_plan: str(fd, 'health_plan'),
    id_number: str(fd, 'id_number'),
    three_digits: str(fd, 'three_digits'),
    has_referral: fd.get('has_referral') === 'on',
    referral_name: str(fd, 'referral_name'),
    referral_id_number: str(fd, 'referral_id_number'),
    hmo_reported: fd.get('hmo_reported') === 'on',
    preferred_times: str(fd, 'preferred_times'),
    language: str(fd, 'language') || DEFAULT_LANGUAGE,
    payment_track: oneOf(str(fd, 'payment_track'), PAYMENT_TRACKS) ?? 'unknown',
    /** ערך ישן מלפני 0041 שלא שונה בטופס: לא נוגעים בו */
    legacy_track: ['maccabi', 'commitment'].includes(str(fd, 'payment_track')),
    standing_order: fd.get('standing_order') === 'on',
    contract_signed: fd.get('contract_signed') === 'on',
    card_on_file: fd.get('card_on_file') === 'on',
    email: str(fd, 'email'),
    no_email: fd.get('no_email') === 'on',
    needs_review: fd.get('needs_review') === 'on',
  };
  if (!row.first_name || !row.last_name) fail(here, 'חסר שם פרטי או שם משפחה');
  if (row.three_digits && !/^\d{3}$/.test(row.three_digits)) fail(here, 'בשדה "שלוש ספרות" צריך להיות בדיוק 3 ספרות');
  if (!row.referral_name !== !row.referral_id_number) fail(here, 'בפרטי ההפניה צריך למלא גם שם וגם ת"ז');
  if (row.no_email) row.email = '';
  if (row.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email)) fail(here, 'כתובת המייל לא תקינה');
  if (!row.health_fund) row.health_plan = '';
  // למה ממתינים: נשמר רק כשהשדה מוצג (סטטוס רשימת המתנה), אחרת נשאר מה שהיה
  const waiting = row.status === 'waiting' ? { waiting_reason: str(fd, 'waiting_reason') } : {};
  // המסלול לפי הקופה כשעוד לא נקבע: פרטי, או פיקדון בקופות האחרות. במכבי צריך לבחור אחת משתי האפשרויות
  if (row.payment_track === 'unknown' && row.health_fund === 'private') row.payment_track = 'private';
  if (row.payment_track === 'unknown' && COMMITMENT_FUNDS.includes(row.health_fund as CommitmentFund)) row.payment_track = 'fund_deposit';

  // הנחת אחים: השדות מוצגים רק אחרי 0059. כבוי: התאריך מתאפס, ובסימון הבא מתחילים לספור מחדש
  const siblingOn = fd.get('sibling_discount') === 'on';
  const siblingAmount = num(fd, 'sibling_discount_amount');
  if (siblingOn && (siblingAmount === null || siblingAmount <= 0)) fail(here, 'בהנחת אחים צריך לרשום סכום גדול מ-0');
  const siblingFrom = str(fd, 'sibling_discount_from');
  const sibling = fd.get('sibling_discount_field') ? {
    sibling_discount: siblingOn,
    sibling_discount_amount: siblingAmount && siblingAmount > 0 ? siblingAmount : SIBLING_DEFAULT_AMOUNT,
    sibling_discount_from: !siblingOn ? null
      : validDate(siblingFrom) ? siblingFrom : new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' }),
  } : {};

  const { legacy_track: legacy, ...fields } = row;
  const save = legacy ? (({ payment_track: _, ...rest }) => rest)(fields) : fields;

  // עד שמריצים את 0044 / 0046 / 0053 / 0056: שומרים את כל השאר, בלי חוזה, אשראי, מייל, כלי נוסף ופרטי הפניה
  const without = ({ contract_signed: _c, card_on_file: _k, email: _e, no_email: _n, second_instrument_id: _s, referral_name: _rn, referral_id_number: _ri, ...rest }: typeof save) => rest;
  const NEED_0044 = 'נשמר, חוץ מחוזה, אשראי, מייל, כלי נוסף ופרטי הפניה: צריך להריץ את 0044_contract_card.sql, 0046_student_email.sql, 0053_second_instrument.sql ו-0056_referral_holder.sql ב-Supabase';

  if (id) {
    // מה היה לפני השמירה: רק מה ששונה עובר לאחים
    const { data: before } = await db.from('students').select('family_id, email, no_email, contract_signed, card_on_file').eq('id', id).maybeSingle();
    const { error } = await db.from('students').update({ ...save, ...waiting, ...sibling }).eq('id', id);
    if (error?.code === 'PGRST204') {
      const { error: e } = await db.from('students').update({ ...without(save), ...waiting }).eq('id', id);
      if (e) fail(here, dbMessage(e));
      fail(here, NEED_0044);
    }
    if (error) fail(here, dbMessage(error));
    let synced = false;
    if (before) {
      try {
        synced = await syncSharedDetails(db, id, before.family_id, before, save);
      } catch (e) {
        fail(here, `נשמר, אבל הפרטים לא עודכנו אצל האחים: ${(e as Error).message}`);
      }
    }
    let discountNote = '';
    try {
      const d = await syncSiblingDiscounts(db, [id]);
      if (d.inserted) discountNote += ` הנחות אחים שנוספו: ${d.inserted}.`;
      if (d.removed) discountNote += ` הנחות אחים שהוסרו: ${d.removed}.`;
    } catch (e) {
      fail(here, `נשמר, אבל הנחות האחים לא חושבו: ${(e as Error).message}`);
    }
    const siblingsNote = `${synced ? ' מייל, חוזה ואשראי עודכנו גם אצל האחים.' : ''}${discountNote}`;
    // המסלול השתנה ובחרו לעדכן גם את העבר: חישוב מחדש של החיובים של השיעורים שכבר היו
    if (!legacy && fd.get('rebill_past') === 'yes') {
      let r: Awaited<ReturnType<typeof rebillStudent>>;
      try {
        r = await rebillStudent(db, id);
      } catch (e) {
        fail(here, `נשמר, אבל החיובים הקודמים לא חושבו מחדש: ${(e as Error).message}`);
      }
      done(here, `${r!.changed ? `נשמר. החיובים של ${r!.changed} שיעורים קודמים חושבו מחדש לפי המסלול החדש` : 'נשמר. לא היו חיובים קודמים לשנות'}.${siblingsNote}`);
    }
    done(here, `נשמר.${siblingsNote}`);
  }
  let { data, error } = await db.from('students').insert({ ...save, ...waiting, ...sibling }).select('id').single();
  const partial = error?.code === 'PGRST204';
  if (partial) ({ data, error } = await db.from('students').insert({ ...without(save), ...waiting }).select('id').single());
  if (error || !data) fail(here, dbMessage(error!));

  // איש קשר ראשי אופציונלי כבר ביצירה
  const contactName = str(fd, 'contact_name');
  if (contactName) {
    await db.from('contacts').insert({
      student_id: data!.id, name: contactName, relation: str(fd, 'contact_relation'),
      phone: str(fd, 'contact_phone'), email: '', is_primary: true,
    });
  }
  if (partial) fail(`/students/${data!.id}`, NEED_0044);
  done(`/students/${data!.id}`, 'התלמיד/ה נוספ/ה');
}

export async function deleteStudent(fd: FormData) {
  const db = await createClient();
  const id = num(fd, 'id')!;
  const { error } = await db.from('students').delete().eq('id', id);
  if (error) fail(`/students/${id}`, dbMessage(error));
  done('/students', 'נמחק');
}

export async function saveContact(fd: FormData) {
  const db = await createClient();
  const studentId = num(fd, 'student_id')!;
  const here = `/students/${studentId}`;
  const row = {
    student_id: studentId,
    name: str(fd, 'name'),
    relation: str(fd, 'relation'),
    phone: str(fd, 'phone'),
    email: str(fd, 'email'),
    is_primary: fd.get('is_primary') === 'on',
  };
  if (!row.name) fail(here, 'חסר שם איש קשר');
  if (row.is_primary) await db.from('contacts').update({ is_primary: false }).eq('student_id', studentId);
  const { error } = await db.from('contacts').insert(row);
  if (error) fail(here, dbMessage(error));
  try {
    const { student_id: _, ...fields } = row;
    await addContactToSiblings(db, studentId, fields);
  } catch (e) {
    fail(here, `נשמר, אבל לא נוסף אצל האחים: ${(e as Error).message}`);
  }
  done(here);
}

export async function deleteContact(fd: FormData) {
  const db = await createClient();
  const here = `/students/${num(fd, 'student_id')}`;
  const { data: removed } = await db.from('contacts').select('*').eq('id', num(fd, 'id')!).maybeSingle<Contact>();
  const { error } = await db.from('contacts').delete().eq('id', num(fd, 'id')!);
  if (error) fail(here, dbMessage(error));
  if (removed) {
    try {
      await removeContactFromSiblings(db, removed);
    } catch (e) {
      fail(here, `נמחק, אבל לא נמחק אצל האחים: ${(e as Error).message}`);
    }
  }
  done(here, 'נמחק');
}
