import type {
  Assignee, Attendance, CallState, ChargeKind, CheckStatus, Gender, HealthFund, Interest, PaymentMethod, PaymentTrack, Status, StudentStatus,
  ReceiptField, TaskStatus, TeacherGender, TxKind, TxMethod,
} from './constants';
import { DAYS } from './constants';
import { hhmm } from './time';

export type Branch = { id: number; name: string; address: string };
export type Room = { id: number; branch_id: number; name: string };
export type Instrument = { id: number; name: string };
export type Teacher = {
  id: number; first_name: string; last_name: string; phone: string; email: string;
  room_id: number | null; notes: string; active: boolean;
  gender: TeacherGender | null; teaches_young_boys: boolean; hourly_rate: number | null;
  interest: Interest | null; days_per_week: number | null; languages: string[];
  /** מינימום שעות בשבוע שהתחייבנו למורה (null = אין) */
  min_weekly_hours: number | null;
};
/** תוספת לשכר המורה: זמן (דקות) או סכום (בונוס), עם סיבה */
export type TeacherExtra = {
  id: number; teacher_id: number; extra_date: string; minutes: number | null; amount: number | null; reason: string;
};
/** שכר חודש שאושר ושולם */
export type TeacherPayroll = {
  teacher_id: number; month: string; amount: number; minutes: number; transaction_id: number | null; paid_on: string;
};
export type TeacherHours = {
  id: number; teacher_id: number; weekday: number; start_time: string; end_time: string; room_id: number | null;
};
export type Student = {
  id: number; first_name: string; last_name: string; school: string; birth_date: string | null; birth_date_approx: boolean;
  branch_id: number | null; requested_instrument_id: number | null;
  /** כלי נוסף (למשל גם מקהלה) */
  second_instrument_id: number | null; notes: string; status: StudentStatus; waiting_reason: string;
  gender: Gender | null; health_fund: HealthFund | null; health_plan: string; id_number: string; three_digits: string;
  has_referral: boolean; hmo_reported: boolean; preferred_times: string; language: string;
  /** חתמו על חוזה / נלקחו פרטי אשראי */
  contract_signed: boolean; card_on_file: boolean;
  /** מייל, או no_email = אין להם מייל */
  email: string; no_email: boolean;
  /** משפחה (אחים = אותה משפחה). null = לא משויך/ת */
  family_id: number | null;
  payment_track: PaymentTrack; standing_order: boolean; needs_review: boolean;
  call_state: CallState; call_attempts: number; last_call_at: string | null;
};
export type Contact = {
  id: number; student_id: number; name: string; relation: string; phone: string; email: string; is_primary: boolean;
};
/** שיעור רגיל: יום, שעה וחדר. שיעור בבית המורה (at_home): רק מספר משבצת, בלי יום/שעה/חדר */
export type Lesson = {
  id: number; student_id: number; teacher_id: number; instrument_id: number; room_id: number | null;
  weekday: number | null; start_time: string | null; status: Status; notes: string;
  at_home: boolean; home_slot: number | null;
  /** שיעור בזוג: עוד תלמיד/ה באותו שיעור (אותו מורה, יום ושעה) */
  pair: boolean;
};
/** שיעור רגיל (לא בבית): יש לו תמיד יום, שעה וחדר */
export type TimedLesson = Lesson & { at_home: false; room_id: number; weekday: number; start_time: string; home_slot: null };
export const isTimed = (l: Lesson): l is TimedLesson => !l.at_home;
/** "שני 16:30", או "בבית · 2" לשיעור בבית המורה */
export const lessonWhen = (l: Lesson) =>
  isTimed(l) ? `${DAYS[l.weekday]} ${hhmm(l.start_time)}` : `🏠 בבית · ${l.home_slot}`;
export type Choir = {
  id: number; name: string; teacher_id: number; room_id: number; weekday: number;
  start_time: string; end_time: string; notes: string;
  price_private: number | null; price_maccabi_1: number | null; price_maccabi_2: number | null; commitments: number | null;
};
export type Enrollment = { id: number; choir_id: number; student_id: number; status: Status };
export type Task = {
  id: number; title: string; due_date: string | null; kind: string; description: string;
  assignee: Assignee; status: TaskStatus; position: number; created_at: string;
};

export type Transaction = {
  id: number; kind: TxKind; occurred_on: string; amount: number; category: string; counterparty: string;
  teacher_id: number | null; method: TxMethod; reference: string; recurring: boolean; notes: string;
  receipt_path: string | null; receipt_name: string;
};

export type BillingSettings = {
  price_private: number; price_maccabi_full: number; price_maccabi_upfront: number; price_maccabi_later: number;
  price_fund_deposit: number; maccabi_later_months: number;
  /** שיעור ניסיון: מי שהיה/תה בשיעור ולא ממשיך/ה */
  price_trial: number;
};
/** שורת חיוב. teacher_id + lesson_date = השיעור (בחיוב ידני teacher_id ריק) */
export type Charge = {
  id: number; student_id: number; teacher_id: number | null; lesson_date: string; kind: ChargeKind; track: string;
  description: string; amount: number; due_date: string; commitment_on: string | null; commitment_ref: string;
};
export type Payment = {
  id: number; student_id: number; paid_on: string; amount: number; method: PaymentMethod; reference: string;
  check_number: string; check_bank: string; check_date: string | null; check_status: CheckStatus | null; notes: string;
  /** החזר להורים (למשל פיקדון שחזר): יורד מהיתרה */
  refund: boolean;
  /** כמה מהתשלום מיועד לזיכוי מכבי (95 ₪ לשיעור). השאר - לשיעורים הרגילים */
  maccabi_amount: number;
};
/** קבלה על תשלום (מ-SUMIT, או מספר שהוקלד ביד). kind: על השיעורים, או על השלמת מכבי */
export type Receipt = {
  id: number; payment_id: number; student_id: number; kind: 'lesson' | 'maccabi_later' | 'deposit'; number: string; url: string;
  /** sumit = הופקה ב-SUMIT, internal = אישור מהמערכת (למשל על פיקדון), manual = מספר שהוקלד ביד */
  source: 'sumit' | 'internal' | 'manual';
  sumit_document_id: number | null; amount: number; customer_name: string; description: string; issued_on: string;
};

/** אישור קבלה לקופה שהופק (0048). כל מה שמודפס נשמר, כדי שההורדה החוזרת תהיה זהה */
export type ReceiptCertificate = {
  id: number; student_id: number | null; name: string; id_number: string; gender: Gender | null;
  amount: number; dates: string[]; number: string; issued_on: string; source: 'lessons' | 'manual'; created_at: string;
  /** התחום שכתוב באישור (0050). null / חסר = הבעה ויצירה */
  field?: ReceiptField | null;
  /** נשלח במייל (0051): לאן ומתי. ריק = עוד לא */
  emailed_to?: string; emailed_at?: string | null;
};

/** שיעור שהתקיים (או תוכנן) ביום מסוים. lesson_id ריק = נוסף רק ליום הזה */
export type DayLesson = {
  id: number; lesson_date: string; teacher_id: number; student_id: number; lesson_id: number | null;
  instrument_id: number | null; start_time: string | null; room_id: number | null; attendance: Attendance; notes: string;
  /** מילוי מקום: מי לימד/ה בפועל. null = המורה הקבוע/ה */
  substitute_id: number | null;
  /** משולם למורה? null = לפי הכלל */
  teacher_paid: boolean | null;
  /** שיעור בזוג (מכל 4, הרביעי חינם) */
  pair: boolean;
  /** העברה חד-פעמית: מאיזה יום ומאיזה/ו מורה השיעור הועבר ליום הזה (לפני 0052: חסר) */
  moved_from?: string | null;
  moved_from_teacher?: number | null;
};
export type DayClosure = { teacher_id: number; lesson_date: string; closed_at: string };
/** יום שנסגר סופית לכל המורים */
export type DayLock = {
  lesson_date: string; locked_at: string; auto: boolean; stats: Partial<DayStats>;
  /** נפתח בחריגה לתיקון (null = נעול) */
  unlocked_at: string | null;
};
/** תמונת מצב של יום שנסגר */
export type DayStats = {
  teachers: number; students: number; lessons: number;
  present: number; absent: number; excused: number; cancelled: number;
  substitutes: number; added: number; moved: number;
  teacherMinutes: number; extraMinutes: number; charged: number; unbilled: number;
};

type Named = { first_name: string; last_name: string };
export const fullName = (p: Named | null | undefined) => (p ? `${p.first_name} ${p.last_name}`.trim() : '');
/** הכלים המבוקשים של התלמיד/ה (עד שניים), בלי כפילויות */
export const requestedInstrumentIds = (s: Pick<Student, 'requested_instrument_id' | 'second_instrument_id'>) =>
  [...new Set([s.requested_instrument_id, s.second_instrument_id].filter((i): i is number => !!i))];
