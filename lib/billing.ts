import { BILLABLE, type ChargeKind, type PaymentTrack } from './constants';
import { weekdayOf } from './day';
import type { BillingSettings, Charge, DayLesson, FundCommitment, Payment } from './types';

export type NewCharge = Omit<Charge, 'id' | 'commitment_on' | 'commitment_ref'>;

/** "2026-10-17" -> "2026-10-01" */
export const monthStart = (date: string) => `${date.slice(0, 7)}-01`;

export const monthLabel = (month: string) => {
  const [y, m] = month.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('he-IL', { month: 'long', year: 'numeric' });
};

export const shekel = (n: number | null) => (n == null ? '—' : `${n.toLocaleString('he-IL')} ₪`);

/** "2026-10-20" + n חודשים. 31 בחודש שאין בו 31 -> היום האחרון של החודש */
export function addMonths(date: string, n: number): string {
  const [y, m, d] = date.split('-').map(Number);
  const last = new Date(Date.UTC(y, m - 1 + n + 1, 0)).getUTCDate();
  const t = new Date(Date.UTC(y, m - 1 + n, Math.min(d, last)));
  return t.toISOString().slice(0, 10);
}

/** כמה משלמים מראש על שיעור (בלי ה-95 של מכבי שמשלמים אחר כך). null = מסלול לא ידוע */
export function upfrontPrice(track: PaymentTrack, s: BillingSettings): number | null {
  switch (track) {
    case 'private': return Number(s.price_private);
    case 'maccabi_full': return Number(s.price_maccabi_full);
    case 'maccabi_split': return Number(s.price_maccabi_upfront);
    case 'fund_deposit': return Number(s.price_fund_deposit);
    // לאומית: לא משלמים, מביאים התחייבות על כל שיעור
    case 'fund_commitment': return 0;
    case 'trial': return Number(s.price_trial ?? 55);
    // 'unknown', או ערך ישן מלפני 0041
    default: return null;
  }
}

/** שורות החיוב של שיעור אחד לפי המסלול. null = מסלול לא ידוע, אי אפשר לחייב */
export function chargesForLesson(
  track: PaymentTrack, date: string, s: BillingSettings,
): { kind: ChargeKind; amount: number; due_date: string }[] | null {
  const upfront = upfrontPrice(track, s);
  if (upfront === null) return null;
  const kind: ChargeKind = track === 'fund_deposit' ? 'deposit' : track === 'fund_commitment' ? 'commitment' : 'lesson';
  const rows: { kind: ChargeKind; amount: number; due_date: string }[] = [{ kind, amount: upfront, due_date: date }];
  if (track === 'maccabi_split') {
    rows.push({ kind: 'maccabi_later', amount: Number(s.price_maccabi_later), due_date: addMonths(date, Number(s.maccabi_later_months)) });
  }
  return rows;
}

/** שיעור בזוג: מכל PAIR_CYCLE שיעורים, האחרון חינם (משלמים על 3 ומקבלים את הרביעי) */
export const PAIR_CYCLE = 4;

const pairOrder = (a: DayLesson, b: DayLesson) =>
  a.lesson_date.localeCompare(b.lesson_date) || (a.start_time ?? '').localeCompare(b.start_time ?? '') || a.id - b.id;

/**
 * השיעורים בזוג שיוצאים חינם: אצל כל תלמיד/ה, לפי הסדר, כל שיעור רביעי שמחויב (הגיע/ה או לא הגיע/ה בלי הודעה).
 * rows: כל השיעורים בזוג של התלמיד/ה בימים סגורים (מההתחלה), כדי שהספירה תהיה רציפה. מחזיר מזהי day_lessons
 */
export function freePairLessons(rows: DayLesson[]): Set<number> {
  const free = new Set<number>();
  const byStudent = new Map<number, DayLesson[]>();
  for (const r of rows.filter((x) => x.pair && BILLABLE.includes(x.attendance))) {
    byStudent.set(r.student_id, [...(byStudent.get(r.student_id) ?? []), r]);
  }
  for (const list of byStudent.values()) {
    list.sort(pairOrder).forEach((r, i) => { if ((i + 1) % PAIR_CYCLE === 0) free.add(r.id); });
  }
  return free;
}

// שיעור חינם (רביעי בזוג) מקבל מפתח משלו, כדי ששיעור שחויב ועכשיו חינם (או להפך) יוחלף
const chargeKey = (c: { teacher_id: number | null; lesson_date: string; student_id: number; kind: string; amount: number }) =>
  `${c.teacher_id}:${c.lesson_date}:${c.student_id}:${c.kind}${c.kind === 'lesson' && Number(c.amount) === 0 ? ':free' : ''}`;

/**
 * החיובים שצריכים להיות לשיעורים של ימים סגורים: לכל שיעור שהתלמיד/ה הגיע/ה אליו או לא הגיע/ה בלי הודעה.
 * unbilled: שיעורים של תלמידים במסלול לא ידוע (לא חויבו)
 */
export function planCharges(
  rows: DayLesson[], track: (studentId: number) => PaymentTrack, s: BillingSettings,
  describe: (row: DayLesson) => string, free: Set<number> = new Set(),
): { charges: NewCharge[]; unbilled: DayLesson[] } {
  const charges = new Map<string, NewCharge>();
  const unbilled: DayLesson[] = [];
  for (const r of rows.filter((x) => BILLABLE.includes(x.attendance))) {
    const t = track(r.student_id);
    // השיעור הרביעי בזוג: שורת חיוב של 0 (שיופיע בחשבון), בלי השלמת מכבי ובלי פיקדון
    const plan = free.has(r.id) ? [{ kind: 'lesson' as const, amount: 0, due_date: r.lesson_date }]
      : chargesForLesson(t, r.lesson_date, s);
    if (!plan) { unbilled.push(r); continue; }
    for (const p of plan) {
      const c: NewCharge = {
        student_id: r.student_id, teacher_id: r.teacher_id, lesson_date: r.lesson_date, track: t,
        description: free.has(r.id) ? `${describe(r)} · חינם (רביעי בזוג)` : describe(r), ...p,
      };
      // אותו/ה תלמיד/ה פעמיים באותו יום אצל אותו/ה מורה: חיוב אחד
      if (!charges.has(chargeKey(c))) charges.set(chargeKey(c), c);
    }
  }
  return { charges: [...charges.values()], unbilled };
}

/** מסיר מהתוכנית חיובים שנמחקו ביד (waived_charges), כדי שחיוב מחדש לא ייצור אותם שוב */
export function dropWaived<T extends { teacher_id: number | null; lesson_date: string; student_id: number; kind: string }>(
  planned: T[], waived: { teacher_id: number; lesson_date: string; student_id: number; kind: string }[],
): T[] {
  const key = (c: { teacher_id: number | null; lesson_date: string; student_id: number; kind: string }) =>
    `${c.teacher_id}:${c.lesson_date}:${c.student_id}:${c.kind}`;
  const gone = new Set(waived.map(key));
  return planned.filter((c) => !gone.has(key(c)));
}

// גם המסלול, הסכום ותאריך התשלום: חיוב שחושב לפי מסלול או מחיר אחר יוחלף
const exactKey = (c: Parameters<typeof chargeKey>[0] & { track: string; due_date: string }) =>
  `${chargeKey(c)}:${c.track}:${Number(c.amount)}:${c.due_date}`;

/**
 * מה לשנות כדי שהחיובים הקיימים יתאימו לתוכנית. חיוב שכבר קיים נשאר כמו שהוא (גם אם המחיר השתנה מאז).
 * exact: חיוב שהמסלול, הסכום או תאריך התשלום שלו שונים מהתוכנית מוחלף (חישוב מחדש אחרי שינוי מסלול).
 * פיקדון (או התחייבות) שכבר הביאו עליו התחייבות לא נמחק, ועל אותו שיעור לא נוצר פיקדון או התחייבות נוספים
 */
export function diffCharges(existing: Charge[], planned: NewCharge[], exact = false): { insert: NewCharge[]; remove: number[] } {
  const key = exact ? exactKey : chargeKey;
  const have = new Set(existing.map(key));
  const want = new Set(planned.map(key));
  const lessonOf = (c: { teacher_id: number | null; lesson_date: string; student_id: number }) => `${c.teacher_id}:${c.lesson_date}:${c.student_id}`;
  const committed = new Set(existing.filter((c) => c.commitment_on).map(lessonOf));
  const commitmentKind = (c: NewCharge) => c.kind === 'deposit' || c.kind === 'commitment';
  return {
    insert: planned.filter((c) => !have.has(key(c)) && !(commitmentKind(c) && committed.has(lessonOf(c)))),
    remove: existing.filter((c) => c.kind !== 'manual' && !want.has(key(c)) && !c.commitment_on).map((c) => c.id),
  };
}

/** הנחת אחים: מכל SIBLING_CYCLE שיעורים ששילמו עליהם, הנחה בסכום שנרשם בכרטיס */
export const SIBLING_CYCLE = 4;
export const SIBLING_DEFAULT_AMOUNT = 25;
/** בפיקדון הכסף חוזר להורים, ובשיעור ניסיון אין המשך: אין שם הנחה */
export const SIBLING_TRACKS: string[] = ['private', 'maccabi_full', 'maccabi_split'];

const discountOrder = (a: Charge, b: Charge) =>
  a.lesson_date.localeCompare(b.lesson_date) || (a.teacher_id ?? 0) - (b.teacher_id ?? 0) || a.id - b.id;

/**
 * השיעורים שנספרים להנחת אחים, לפי הסדר: חיובי שיעור מהתאריך שנבחר, במסלול שיש בו הנחה.
 * נספרים לפי החיובים ולא לפי הנוכחות, אז שיעור חינם בזוג, שיעור שהחיוב שלו נמחק ביד ושיעור שלא חויב לא נכנסים לספירה
 */
export const siblingCounted = (charges: Charge[], from: string | null | undefined) =>
  charges.filter((c) => c.kind === 'lesson' && Number(c.amount) > 0 && SIBLING_TRACKS.includes(c.track) && c.lesson_date >= (from ?? ''))
    .sort(discountOrder);

/** שורות ההנחה שצריכות להיות לתלמיד/ה: אחת על כל שיעור רביעי שנספר, בתאריך של אותו שיעור */
export function planSiblingDiscounts(charges: Charge[], amount: number, from: string | null | undefined): NewCharge[] {
  return siblingCounted(charges, from).filter((_, i) => (i + 1) % SIBLING_CYCLE === 0).map((c) => ({
    student_id: c.student_id, teacher_id: c.teacher_id, lesson_date: c.lesson_date, track: c.track, kind: 'sibling_discount' as const,
    description: `הנחת אחים על ${SIBLING_CYCLE} שיעורים`, amount: -Math.abs(amount), due_date: c.lesson_date,
  }));
}

/** סכום החיוב בפועל: פיקדון שהביאו עליו התחייבות לא נספר (הכסף חוזר להורים), והתחייבות היא תמיד 0 */
export const effectiveAmount = (c: Charge) =>
  (c.kind === 'commitment' || (c.kind === 'deposit' && c.commitment_on) ? 0 : Number(c.amount));

/** returned = הביאו התחייבות (על פיקדון או על שיעור בלאומית), no_commitment = שיעור בלאומית שעוד לא הביאו עליו התחייבות */
export type ChargeStatus = 'paid' | 'partial' | 'unpaid' | 'overdue' | 'upcoming' | 'returned' | 'no_commitment';
/** paidBy: אילו תשלומים כיסו את החיוב ובכמה (null = הנחה ידנית) */
export type ChargeLine = { charge: Charge; covered: number; status: ChargeStatus; paidBy: { paymentId: number | null; amount: number }[] };

/** החלק בתשלום שמיועד לזיכוי מכבי (השאר - לשיעורים הרגילים) */
export const maccabiPart = (p: Payment) => Math.min(Number(p.amount), Math.max(0, Number(p.maccabi_amount ?? 0)));

type Credit = { paymentId: number | null; left: number };

/**
 * הכסף שמכסה את החיובים, בשתי קופות נפרדות: לשיעורים (כולל פיקדון וחיוב ידני), ולזיכוי מכבי.
 * תשלום מכסה זיכוי מכבי רק בחלק שסומן לזה, כך שתשלום רגיל לא "נשפך" על זיכוי שעוד לא שולם.
 * בכל קופה: התשלומים מהמוקדם למאוחר. החזר להורים יורד מהתשלומים האחרונים. צ'ק שחזר לא נחשב
 */
function credits(charges: Charge[], payments: Payment[]) {
  const live = payments.filter((p) => p.check_status !== 'bounced' && !p.refund)
    .sort((a, b) => a.paid_on.localeCompare(b.paid_on) || a.id - b.id);
  const regular: Credit[] = live.map((p) => ({ paymentId: p.id, left: Number(p.amount) - maccabiPart(p) }));
  const maccabi: Credit[] = live.map((p) => ({ paymentId: p.id, left: maccabiPart(p) }));
  let refunds = payments.filter((p) => p.check_status !== 'bounced' && p.refund).reduce((n, p) => n + Number(p.amount), 0);
  for (const pool of [regular, maccabi]) {
    for (let i = pool.length - 1; i >= 0 && refunds > 0; i--) {
      const take = Math.min(pool[i].left, refunds);
      pool[i].left -= take;
      refunds -= take;
    }
  }
  const discounts = charges.reduce((n, c) => n + Math.max(0, -effectiveAmount(c)), 0);
  if (discounts > 0) regular.unshift({ paymentId: null, left: discounts });
  return { regular, maccabi };
}

const isMaccabiLater = (c: Charge) => c.kind === 'maccabi_later';

/**
 * מצב החשבון של תלמיד/ה, בשני חלקים נפרדים:
 * balance - השיעורים הרגילים: חיובי = זכות, שלילי = חוב (רק מה שכבר הגיע זמנו).
 * זיכוי מכבי - upcoming (עוד לא הגיע זמנו), overdue (עבר הזמן ולא שולם), maccabiCredit (שולם מראש לזיכוי ועוד לא נוצל)
 */
export function account(charges: Charge[], payments: Payment[], today: string, commitments: FundCommitment[] = []) {
  const pools = credits(charges, payments);
  // לאומית: ההתחייבויות שהתקבלו מכסות את השיעורים מהראשון והלאה (שיעור שסומן עליו ביד לפני 0062 - כבר מכוסה)
  const received = commitments.reduce((n, c) => n + Number(c.count), 0);
  const waiting = charges.filter((c) => c.kind === 'commitment' && !c.commitment_on)
    .sort((x, y) => x.lesson_date.localeCompare(y.lesson_date) || x.id - y.id);
  const coveredByCommitment = new Set(waiting.slice(0, received).map((c) => c.id));
  const sorted = [...charges].sort((a, b) => a.due_date.localeCompare(b.due_date) || a.id - b.id);
  const lines: ChargeLine[] = sorted.map((c) => {
    const amount = effectiveAmount(c);
    if ((c.kind === 'deposit' || c.kind === 'commitment') && c.commitment_on) return { charge: c, covered: 0, status: 'returned', paidBy: [] };
    if (c.kind === 'commitment') return { charge: c, covered: 0, status: coveredByCommitment.has(c.id) ? 'returned' : 'no_commitment', paidBy: [] };
    if (amount <= 0) return { charge: c, covered: amount, status: 'paid', paidBy: [] };
    const paidBy: ChargeLine['paidBy'] = [];
    let covered = 0;
    for (const cr of isMaccabiLater(c) ? pools.maccabi : pools.regular) {
      if (covered >= amount) break;
      const take = Math.min(cr.left, amount - covered);
      if (take <= 0) continue;
      cr.left -= take;
      covered += take;
      paidBy.push({ paymentId: cr.paymentId, amount: take });
    }
    const status: ChargeStatus = covered >= amount ? 'paid'
      : c.due_date > today ? 'upcoming'
      : c.due_date < today && isMaccabiLater(c) ? 'overdue'
      : covered > 0 ? 'partial' : 'unpaid';
    return { charge: c, covered, status, paidBy };
  });

  const live = payments.filter((p) => p.check_status !== 'bounced');
  const regularPaid = live.reduce((n, p) => n + (p.refund ? -Number(p.amount) : Number(p.amount) - maccabiPart(p)), 0);
  const due = charges.filter((c) => !isMaccabiLater(c) && c.due_date <= today).reduce((n, c) => n + effectiveAmount(c), 0);
  const balance = regularPaid - due;
  const open = (l: ChargeLine) => effectiveAmount(l.charge) - l.covered;
  const maccabiOpen = lines.filter((l) => isMaccabiLater(l.charge) && open(l) > 0);
  const upcoming = maccabiOpen.filter((l) => l.status === 'upcoming').reduce((n, l) => n + open(l), 0);
  const overdue = lines.filter((l) => l.status === 'overdue');
  return {
    lines: lines.reverse(), balance, upcoming,
    overdue, overdueAmount: overdue.reduce((n, l) => n + open(l), 0),
    /** זיכויי מכבי שעוד לא שולמו (עתידיים ובאיחור) */
    maccabiOpen,
    /** כסף ששולם לזיכוי מכבי ועוד לא כיסה זיכוי (שולם מראש) */
    maccabiCredit: pools.maccabi.reduce((n, c) => n + c.left, 0),
    /** פיקדונות שעוד לא הביאו עליהם התחייבות */
    deposits: charges.filter((c) => c.kind === 'deposit' && !c.commitment_on),
    /** שיעורים בלאומית שעוד לא הביאו עליהם התחייבות */
    commitments: waiting.slice(received),
    /** התחייבויות שהתקבלו */
    commitmentsReceived: received + charges.filter((c) => c.kind === 'commitment' && c.commitment_on).length,
    /** התחייבויות בעודף: יכסו את השיעורים הבאים */
    commitmentsSurplus: Math.max(0, received - waiting.length),
  };
}

/**
 * ימי השיעור שנשארו בחודש (מהיום והלאה) לפי ימי השבוע של השיעורים הקבועים.
 * charged: תאריכים שכבר יש עליהם חיוב (למשל יום שנסגר היום) - לא נספרים שוב
 */
export function remainingLessonDates(weekdays: number[], month: string, today: string, charged: string[] = []): string[] {
  const [y, m] = month.split('-').map(Number);
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const out: string[] = [];
  for (let d = 1; d <= days; d++) {
    const date = `${month.slice(0, 7)}-${String(d).padStart(2, '0')}`;
    if (date < today || charged.includes(date)) continue;
    for (const w of weekdays) if (weekdayOf(date) === w) out.push(date);
  }
  return out;
}

/**
 * כמה לבקש מראש עד סוף החודש: השיעורים הקבועים שנשארו בחודש (ועוד לא חויבו) × המחיר מראש, פחות הזכות (או ועוד החוב).
 * רק בפרטי ובמכבי. בקופות האחרות משלמים פיקדון על כל שיעור (או מביאים התחייבות), לא מראש לחודש (null).
 * לא מתחשב בחגים וחופשות
 */
export function monthRequest(
  weekdays: number[], month: string, today: string, track: PaymentTrack, s: BillingSettings, balance: number, charged: string[] = [],
  /** שיעורים בזוג: ימי השבוע שלהם (לא כלולים ב-weekdays), וכמה שיעורים בזוג כבר חויבו (כדי לדעת איפה בסבב של 4) */
  pair?: { weekdays: number[]; done: number },
  /** הנחת אחים: הסכום, וכמה שיעורים כבר נספרו (כדי לדעת איפה בסבב של 4) */
  sibling?: { amount: number; done: number },
) {
  const price = upfrontPrice(track, s);
  // בקופות האחרות משלמים על כל שיעור; שיעור ניסיון - לא ממשיכים, אין מה לבקש מראש
  if (price === null || track === 'fund_deposit' || track === 'fund_commitment' || track === 'trial') return null;
  const regular = remainingLessonDates(weekdays, month, today, charged).length;
  const pairDates = pair ? remainingLessonDates(pair.weekdays, month, today, charged) : [];
  const free = pairDates.filter((_, i) => (pair!.done + i + 1) % PAIR_CYCLE === 0).length;
  const lessons = regular + pairDates.length - free;
  const discount = sibling ? Math.floor(((sibling.done % SIBLING_CYCLE) + lessons) / SIBLING_CYCLE) * sibling.amount : 0;
  return { lessons, free, price, discount, total: Math.max(0, lessons * price - discount - balance) };
}

// ---- קבלות ----

/** סוג קבלה: על השיעורים (כולל פיקדון ותשלום מראש), או על השלמת מכבי (95 ₪) - במכבי מקבלים עליה קבלה נפרדת */
export type ReceiptKind = 'lesson' | 'maccabi_later';
export type PlannedReceipt = { kind: ReceiptKind; amount: number; description: string };

/** "2026-10-20" -> "20.10" */
const dm = (d: string) => `${Number(d.slice(8, 10))}.${Number(d.slice(5, 7))}`;
/** תאריכי שיעורים לקבלה: "20.10, 27.10" (עד 12, ואז "ועוד") */
export const receiptDates = (dates: string[]) => datesText(dates);
const datesText = (dates: string[]) => {
  const u = [...new Set(dates)].sort();
  return u.length > 12 ? `${u.slice(0, 12).map(dm).join(', ')} ועוד ${u.length - 12}` : u.map(dm).join(', ');
};

/**
 * הקבלות שצריך להפיק על תשלום: לפי החיובים שהתשלום כיסה. במכבי (חלק מראש + זיכוי) - קבלה נפרדת על ההשלמה.
 * מה שנשאר מהתשלום אחרי החיובים = תשלום מראש, נכנס לקבלה של השיעורים
 */
export function planReceipts(lines: ChargeLine[], payment: Payment, studentName: string): PlannedReceipt[] {
  const mine = lines.flatMap((l) => l.paidBy.filter((p) => p.paymentId === payment.id).map((p) => ({ charge: l.charge, amount: p.amount })));
  const later = mine.filter((m) => m.charge.kind === 'maccabi_later');
  const rest = mine.filter((m) => m.charge.kind !== 'maccabi_later');
  // הסכומים לפי מה שסומן בתשלום, גם אם עוד לא כיסו חיוב (תשלום מראש)
  const laterAmount = maccabiPart(payment);
  const restAmount = Number(payment.amount) - laterAmount;

  const out: PlannedReceipt[] = [];
  if (restAmount > 0) {
    const lessons = rest.filter((m) => m.charge.kind !== 'manual').map((m) => m.charge.lesson_date);
    const prepaid = restAmount - rest.reduce((n, m) => n + m.amount, 0) > 0.001;
    const parts = [
      lessons.length ? `שיעורים ${datesText(lessons)}` : '',
      prepaid ? 'תשלום מראש' : '',
    ].filter(Boolean).join(' · ');
    out.push({ kind: 'lesson', amount: restAmount, description: `שכר לימוד - ${studentName}${parts ? ` · ${parts}` : ''}` });
  }
  if (laterAmount > 0) {
    const dates = later.map((m) => m.charge.lesson_date);
    out.push({
      kind: 'maccabi_later', amount: laterAmount,
      description: `השלמת תשלום (זיכוי מכבי) - ${studentName}${dates.length ? ` · שיעורים ${datesText(dates)}` : ' · מראש'}`,
    });
  }
  return out;
}

/**
 * מה תשלום כיסה: החיובים (ובכמה מכל אחד), ומה עוד לא נוצל - לשיעורים ולזיכוי מכבי (זכות לחיובים הבאים).
 * החזר להורים לא מכסה חיובים
 */
export function paymentCoverage(lines: ChargeLine[], payment: Payment) {
  const items = lines.flatMap((l) => l.paidBy.filter((x) => x.paymentId === payment.id).map((x) => ({ charge: l.charge, amount: x.amount })))
    .sort((a, b) => a.charge.due_date.localeCompare(b.charge.due_date) || a.charge.id - b.charge.id);
  if (payment.refund) return { items, unused: 0, unusedMaccabi: 0 };
  const used = (maccabi: boolean) => items.filter((i) => (i.charge.kind === 'maccabi_later') === maccabi).reduce((n, i) => n + i.amount, 0);
  const m = maccabiPart(payment);
  return { items, unused: Number(payment.amount) - m - used(false), unusedMaccabi: m - used(true) };
}
