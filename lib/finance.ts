import { account } from './billing';
import {
  FIXED_EXPENSES, INVESTMENT_EXPENSES, PARENTS_INCOME, PARENTS_REFUND, PAYMENT_METHOD_LABELS, SALARY_CATEGORY, TX_METHOD_LABELS,
  type ExpenseGroup, type PaymentTrack, type TxKind,
} from './constants';
import type { Charge, Payment, Transaction } from './types';

/** שורה ביומן הכספים: רישום ידני, או תשלום שנספר אוטומטית מתשלומי הורים / קופות */
export type Entry = {
  key: string;
  kind: TxKind;
  date: string;
  amount: number;
  category: string;
  label: string;
  method: string;
  source: 'manual' | 'parents' | 'fund';
  /** לרישום ידני: מזהה. לתשלום הורים: מזהה התלמיד/ה */
  id: number;
  /** סוג ההוצאה. null = הכנסה או החזר להורים */
  group: ExpenseGroup | null;
  /** התאריך שבו הכסף יצא בפועל. בשכר מורים date הוא חודש השכר, ויכול להיות שונה */
  paidOn: string;
};

/** סוג ההוצאה לפי הקטגוריה. קטגוריה שהוקלדה ביד: קבועה אם סומנה "קבוע כל חודש", אחרת משתנה */
export function expenseGroup(category: string, recurring = false): ExpenseGroup {
  if (category === SALARY_CATEGORY) return 'teachers';
  if (INVESTMENT_EXPENSES.includes(category)) return 'investment';
  return FIXED_EXPENSES.includes(category) || recurring ? 'fixed' : 'variable';
}

/**
 * כל ההכנסות וההוצאות. צ'קים שחזרו לא נספרים. החזר להורים (למשל פיקדון) = הוצאה.
 * salaryMonth: מזהה רישום -> חודש השכר, כדי ששכר ייספר בחודש שעליו הוא משולם ולא בחודש שבו אושר
 */
export function buildEntries(
  transactions: Transaction[], payments: Payment[], studentName: (id: number) => string,
  salaryMonth: Map<number, string> = new Map(),
): Entry[] {
  const manual: Entry[] = transactions.map((t) => ({
    key: `t${t.id}`, kind: t.kind, date: salaryMonth.get(t.id) ?? t.occurred_on, amount: Number(t.amount), category: t.category,
    label: t.counterparty, method: TX_METHOD_LABELS[t.method], source: 'manual', id: t.id,
    group: t.kind === 'expense' ? expenseGroup(t.category, t.recurring || !!t.recurring_id) : null, paidOn: t.occurred_on,
  }));
  const parents: Entry[] = payments.filter((p) => p.check_status !== 'bounced').map((p) => ({
    key: `p${p.id}`, kind: p.refund ? 'expense' : 'income', date: p.paid_on, amount: Number(p.amount),
    category: p.refund ? PARENTS_REFUND : PARENTS_INCOME,
    label: studentName(p.student_id), method: PAYMENT_METHOD_LABELS[p.method], source: 'parents', id: p.student_id, group: null, paidOn: p.paid_on,
  }));
  return [...manual, ...parents]
    .sort((a, b) => b.date.localeCompare(a.date) || a.key.localeCompare(b.key));
}

export const inMonth = (date: string, month: string) => date.slice(0, 7) === month.slice(0, 7);

/**
 * operating: הרווח מהפעילות, בלי השקעות בעסק. afterInvestment: מה שנשאר אחרי ההשקעות.
 * החזר להורים יורד מהרווח, אבל לא נספר כהוצאה של העסק
 */
export function totals(entries: Entry[]) {
  const t = { income: 0, refunds: 0, teachers: 0, fixed: 0, variable: 0, investment: 0 };
  for (const e of entries) {
    if (e.kind === 'income') t.income += e.amount;
    else if (e.group) t[e.group] += e.amount;
    else t.refunds += e.amount;
  }
  const operating = t.income - t.refunds - t.teachers - t.fixed - t.variable;
  return { ...t, operating, afterInvestment: operating - t.investment };
}

/** התשלומים למורים שיצאו בפועל בחודש, לפי תאריך התשלום */
export const paidToTeachers = (entries: Entry[], month: string) =>
  entries.filter((e) => e.group === 'teachers' && inMonth(e.paidOn, month));

/** טבלה שנתית: לכל קטגוריה הסכום בכל חודש, וסיכום לכל חודש ולכל השנה */
export function yearTable(entries: Entry[], year: number) {
  const months = Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, '0')}-01`);
  const ofYear = entries.filter((e) => e.date.startsWith(`${year}-`));
  const rows = (keep: (e: Entry) => boolean) => byCategory(ofYear.filter(keep), ofYear.find(keep)?.kind ?? 'expense').map(({ category, amount }) => ({
    category,
    total: amount,
    byMonth: months.map((mo) => ofYear.filter((e) => keep(e) && e.category === category && inMonth(e.date, mo)).reduce((n, e) => n + e.amount, 0)),
  }));
  const salaries = ofYear.filter((e) => e.group === 'teachers');
  const teachers = [...new Set(salaries.map((e) => e.label))].map((name) => {
    const mine = salaries.filter((e) => e.label === name);
    return {
      category: name || 'ללא שם',
      total: mine.reduce((n, e) => n + e.amount, 0),
      byMonth: months.map((mo) => mine.filter((e) => inMonth(e.date, mo)).reduce((n, e) => n + e.amount, 0)),
    };
  }).sort((a, b) => b.total - a.total);
  return {
    months,
    income: rows((e) => e.kind === 'income'),
    teachers,
    /** כמה יצא למורים בפועל בכל חודש, לפי תאריך התשלום (גם שכר של חודש או שנה אחרים) */
    teachersPaid: months.map((mo) => paidToTeachers(entries, mo).reduce((n, e) => n + e.amount, 0)),
    fixed: rows((e) => e.group === 'fixed'),
    variable: rows((e) => e.group === 'variable'),
    investment: rows((e) => e.group === 'investment'),
    totals: months.map((mo) => totals(ofYear.filter((e) => inMonth(e.date, mo)))),
    year: totals(ofYear),
  };
}

/** סכום לפי קטגוריה, מהגדול לקטן */
export function byCategory(entries: Entry[], kind: TxKind) {
  const m = new Map<string, number>();
  for (const e of entries) if (e.kind === kind) m.set(e.category, (m.get(e.category) ?? 0) + e.amount);
  return [...m].map(([category, amount]) => ({ category, amount })).sort((a, b) => b.amount - a.amount);
}

export type TrackGroup = 'deposit' | 'private' | 'maccabi' | 'other';

/** קבוצת המסלול בדוח: פיקדון, פרטי, מכבי. שיעור ניסיון או מסלול לא ידוע = אחר */
export function trackGroup(track: PaymentTrack | undefined): TrackGroup {
  switch (track) {
    case 'fund_deposit': return 'deposit';
    case 'private': return 'private';
    case 'maccabi_full':
    case 'maccabi_split': return 'maccabi';
    default: return 'other';
  }
}

/**
 * הכנסות וחובות לפי מסלול התשלום הנוכחי של התלמיד/ה.
 * income, refunds: מה שהתקבל והוחזר בחודש. debt: החוב נכון להיום, או לסוף החודש אם החודש כבר נגמר.
 * debt כולל זיכוי מכבי באיחור (maccabiOverdue). maccabiUpcoming: זיכויים שעוד לא הגיע זמנם, לא חלק מהחוב
 */
export function trackBreakdown(
  charges: Charge[], payments: Payment[], trackOf: (studentId: number) => PaymentTrack | undefined, month: string, today: string,
) {
  const blank = () => ({ income: 0, refunds: 0, debt: 0, debtors: 0, maccabiOverdue: 0, maccabiUpcoming: 0 });
  const out: Record<TrackGroup, ReturnType<typeof blank>> = { deposit: blank(), private: blank(), maccabi: blank(), other: blank() };

  for (const p of payments) {
    if (p.check_status === 'bounced' || !inMonth(p.paid_on, month)) continue;
    const g = out[trackGroup(trackOf(p.student_id))];
    if (p.refund) g.refunds += Number(p.amount);
    else g.income += Number(p.amount);
  }

  const [y, m] = month.split('-').map(Number);
  const lastDay = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  const past = lastDay < today;
  const asOf = past ? lastDay : today;
  const known = {
    charges: past ? charges.filter((c) => c.lesson_date <= asOf) : charges,
    payments: past ? payments.filter((p) => p.paid_on <= asOf) : payments,
  };
  const ids = new Set([...known.charges, ...known.payments].map((r) => r.student_id));
  for (const id of ids) {
    const a = account(known.charges.filter((c) => c.student_id === id), known.payments.filter((p) => p.student_id === id), asOf);
    const g = out[trackGroup(trackOf(id))];
    const debt = Math.max(0, -a.balance) + a.overdueAmount;
    g.debt += debt;
    if (debt > 0) g.debtors += 1;
    g.maccabiOverdue += a.overdueAmount;
    g.maccabiUpcoming += a.upcoming;
  }
  return out;
}

/** כמה פעמים יום בשבוע מסוים (0 = ראשון) מופיע בחודש. month בפורמט YYYY-MM-01 */
export function weekdayCount(month: string, weekday: number) {
  const [y, m] = month.split('-').map(Number);
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const first = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
  return Array.from({ length: days }, (_, d) => (first + d) % 7).filter((w) => w === weekday).length;
}

