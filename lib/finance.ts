import {
  FUNDS_INCOME, HEALTH_FUND_LABELS, LESSON_MINUTES, PARENTS_INCOME, PAYMENT_METHOD_LABELS, TX_METHOD_LABELS,
  type HealthFund, type TxKind,
} from './constants';
import { toMin } from './time';
import type { Charge, Choir, Lesson, Payment, Teacher, Transaction } from './types';

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
};

/** כל ההכנסות וההוצאות. צ'קים שחזרו, חיובי קופה שלא שולמו - לא נספרים */
export function buildEntries(
  transactions: Transaction[], payments: Payment[], charges: Charge[], studentName: (id: number) => string,
): Entry[] {
  const manual: Entry[] = transactions.map((t) => ({
    key: `t${t.id}`, kind: t.kind, date: t.occurred_on, amount: Number(t.amount), category: t.category,
    label: t.counterparty, method: TX_METHOD_LABELS[t.method], source: 'manual', id: t.id,
  }));
  const parents: Entry[] = payments.filter((p) => p.check_status !== 'bounced').map((p) => ({
    key: `p${p.id}`, kind: 'income', date: p.paid_on, amount: Number(p.amount), category: PARENTS_INCOME,
    label: studentName(p.student_id), method: PAYMENT_METHOD_LABELS[p.method], source: 'parents', id: p.student_id,
  }));
  // הקופה משלמת על חודש שלם: מקבצים לפי קופה וחודש
  const funds = new Map<string, Entry>();
  for (const c of charges) {
    if (c.payer !== 'fund' || c.state !== 'paid' || c.amount == null) continue;
    const k = `${c.fund}:${c.month}`;
    const e = funds.get(k);
    if (e) e.amount += Number(c.amount);
    else funds.set(k, {
      key: `f${k}`, kind: 'income', date: c.month, amount: Number(c.amount), category: FUNDS_INCOME,
      label: HEALTH_FUND_LABELS[c.fund as HealthFund] ?? c.fund ?? '', method: 'התחייבויות', source: 'fund', id: 0,
    });
  }
  return [...manual, ...parents, ...funds.values()]
    .sort((a, b) => b.date.localeCompare(a.date) || a.key.localeCompare(b.key));
}

export const inMonth = (date: string, month: string) => date.slice(0, 7) === month.slice(0, 7);

export function totals(entries: Entry[]) {
  let income = 0;
  let expense = 0;
  for (const e of entries) {
    if (e.kind === 'income') income += e.amount;
    else expense += e.amount;
  }
  return { income, expense, net: income - expense };
}

/** סכום לפי קטגוריה, מהגדול לקטן */
export function byCategory(entries: Entry[], kind: TxKind) {
  const m = new Map<string, number>();
  for (const e of entries) if (e.kind === kind) m.set(e.category, (m.get(e.category) ?? 0) + e.amount);
  return [...m].map(([category, amount]) => ({ category, amount })).sort((a, b) => b.amount - a.amount);
}

/** כמה פעמים יום בשבוע מסוים (0 = ראשון) מופיע בחודש. month בפורמט YYYY-MM-01 */
export function weekdayCount(month: string, weekday: number) {
  const [y, m] = month.split('-').map(Number);
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const first = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
  return Array.from({ length: days }, (_, d) => (first + d) % 7).filter((w) => w === weekday).length;
}

/**
 * הערכת שכר חודשי למורה: שיעורים סופיים + מקהלות, כפול מספר הפעמים שהיום חל בחודש, כפול שכר לשעה.
 * לא מתחשב בחגים וחופשות - את הסכום אפשר לתקן לפני הרישום.
 */
export function salaryEstimate(teacher: Teacher, lessons: Lesson[], choirs: Choir[], month: string) {
  const weekly = [
    ...lessons.filter((l) => l.teacher_id === teacher.id && l.status === 'confirmed')
      .map((l) => ({ weekday: l.weekday, minutes: LESSON_MINUTES })),
    ...choirs.filter((c) => c.teacher_id === teacher.id)
      .map((c) => ({ weekday: c.weekday, minutes: toMin(c.end_time) - toMin(c.start_time) })),
  ];
  const minutes = weekly.reduce((n, w) => n + w.minutes * weekdayCount(month, w.weekday), 0);
  const hours = minutes / 60;
  const rate = teacher.hourly_rate == null ? null : Number(teacher.hourly_rate);
  return {
    weeklyHours: weekly.reduce((n, w) => n + w.minutes, 0) / 60,
    hours,
    amount: rate == null ? null : Math.round(hours * rate),
  };
}
