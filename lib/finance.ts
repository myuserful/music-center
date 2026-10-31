import { PARENTS_INCOME, PARENTS_REFUND, PAYMENT_METHOD_LABELS, TX_METHOD_LABELS, type TxKind } from './constants';
import type { Payment, Transaction } from './types';

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

/** כל ההכנסות וההוצאות. צ'קים שחזרו לא נספרים. החזר להורים (למשל פיקדון) = הוצאה */
export function buildEntries(
  transactions: Transaction[], payments: Payment[], studentName: (id: number) => string,
): Entry[] {
  const manual: Entry[] = transactions.map((t) => ({
    key: `t${t.id}`, kind: t.kind, date: t.occurred_on, amount: Number(t.amount), category: t.category,
    label: t.counterparty, method: TX_METHOD_LABELS[t.method], source: 'manual', id: t.id,
  }));
  const parents: Entry[] = payments.filter((p) => p.check_status !== 'bounced').map((p) => ({
    key: `p${p.id}`, kind: p.refund ? 'expense' : 'income', date: p.paid_on, amount: Number(p.amount),
    category: p.refund ? PARENTS_REFUND : PARENTS_INCOME,
    label: studentName(p.student_id), method: PAYMENT_METHOD_LABELS[p.method], source: 'parents', id: p.student_id,
  }));
  return [...manual, ...parents]
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

