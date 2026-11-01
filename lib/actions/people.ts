'use server';

import {
  COMMITMENT_FUNDS, DEFAULT_LANGUAGE, GENDER_LABELS, LESSON_MINUTES, HEALTH_FUND_LABELS, INTEREST_LABELS, PAYMENT_TRACKS, STUDENT_STATUSES,
  TEACHER_GENDER_LABELS,
  type CommitmentFund, type Gender, type HealthFund, type Interest, type TeacherGender,
} from '../constants';
import { createClient } from '../supabase/server';
import { overlaps, toMin } from '../time';
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
  };
  // באקסל לחלק מהמורים יש רק שם פרטי
  if (!row.first_name) fail(here, 'חסר שם פרטי');
  if (row.gender !== 'female') row.teaches_young_boys = false;

  // עד שמריצים את 0046 אין עמודת מינימום: שומרים בלעדיה
  const { min_weekly_hours: minWeekly, ...base } = row;
  let teacherId = id;
  let skippedMin = false;
  if (id) {
    let { error } = await db.from('teachers').update(row).eq('id', id);
    if (error?.code === 'PGRST204') {
      ({ error } = await db.from('teachers').update(base).eq('id', id));
      skippedMin = minWeekly != null;
    }
    if (error) fail(here, dbMessage(error));
  } else {
    let { data, error } = await db.from('teachers').insert(row).select('id').single();
    if (error?.code === 'PGRST204') {
      ({ data, error } = await db.from('teachers').insert(base).select('id').single());
      skippedMin = minWeekly != null;
    }
    if (error || !data) fail(here, dbMessage(error!));
    teacherId = data!.id;
  }
  if (skippedMin) fail(`/teachers/${teacherId}`, 'נשמר, חוץ ממינימום השעות בשבוע: צריך להריץ את 0046_teacher_pay.sql ב-Supabase');

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
  if (row.no_email) row.email = '';
  if (row.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email)) fail(here, 'כתובת המייל לא תקינה');
  if (!id && !row.email && !row.no_email) fail(here, 'חסר מייל (או לסמן "אין מייל")');
  if (!row.health_fund) row.health_plan = '';
  // למה ממתינים: נשמר רק כשהשדה מוצג (סטטוס רשימת המתנה), אחרת נשאר מה שהיה
  const waiting = row.status === 'waiting' ? { waiting_reason: str(fd, 'waiting_reason') } : {};
  // המסלול לפי הקופה כשעוד לא נקבע: פרטי, או פיקדון בקופות האחרות. במכבי צריך לבחור אחת משתי האפשרויות
  if (row.payment_track === 'unknown' && row.health_fund === 'private') row.payment_track = 'private';
  if (row.payment_track === 'unknown' && COMMITMENT_FUNDS.includes(row.health_fund as CommitmentFund)) row.payment_track = 'fund_deposit';

  const { legacy_track: legacy, ...fields } = row;
  const save = legacy ? (({ payment_track: _, ...rest }) => rest)(fields) : fields;

  // עד שמריצים את 0044 / 0046: שומרים את כל השאר, בלי חוזה, אשראי ומייל
  const without = ({ contract_signed: _c, card_on_file: _k, email: _e, no_email: _n, ...rest }: typeof save) => rest;
  const NEED_0044 = 'נשמר, חוץ מחוזה, אשראי ומייל: צריך להריץ את 0044_contract_card.sql ו-0046_student_email.sql ב-Supabase';

  if (id) {
    const { error } = await db.from('students').update({ ...save, ...waiting }).eq('id', id);
    if (error?.code === 'PGRST204') {
      const { error: e } = await db.from('students').update({ ...without(save), ...waiting }).eq('id', id);
      if (e) fail(here, dbMessage(e));
      fail(here, NEED_0044);
    }
    if (error) fail(here, dbMessage(error));
    done(here);
  }
  let { data, error } = await db.from('students').insert({ ...save, ...waiting }).select('id').single();
  if (error?.code === 'PGRST204') ({ data, error } = await db.from('students').insert({ ...without(save), ...waiting }).select('id').single());
  if (error || !data) fail(here, dbMessage(error!));

  // איש קשר ראשי אופציונלי כבר ביצירה
  const contactName = str(fd, 'contact_name');
  if (contactName) {
    await db.from('contacts').insert({
      student_id: data!.id, name: contactName, relation: str(fd, 'contact_relation'),
      phone: str(fd, 'contact_phone'), email: '', is_primary: true,
    });
  }
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
  done(here);
}

export async function deleteContact(fd: FormData) {
  const db = await createClient();
  const here = `/students/${num(fd, 'student_id')}`;
  const { error } = await db.from('contacts').delete().eq('id', num(fd, 'id')!);
  if (error) fail(here, dbMessage(error));
  done(here, 'נמחק');
}
