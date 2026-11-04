import { addMonths } from './billing';
import type { DB } from './supabase/server';
import type { RecurringExpense, RecurringRun } from './types';

const MISSING = ['42P01', 'PGRST205', 'PGRST204', '42703'];
export const RECURRING_MISSING = 'צריך להריץ את 0058_recurring_expenses.sql ב-Supabase';
export const isMissing = (e: { code?: string } | null) => !!e && MISSING.includes(e.code ?? '');

export type DueRun = { template: RecurringExpense; month: string; occurred_on: string };

/** התאריך של ההוצאה בחודש. 31 בחודש קצר -> היום האחרון של החודש */
export function occurrenceDate(month: string, day: number) {
  const [y, m] = month.split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${month.slice(0, 8)}${String(Math.min(day, last)).padStart(2, '0')}`;
}

/** החודשים שעדיין לא נרשמו, מחודש ההתחלה ועד החודש הנוכחי (או תאריך הסיום, אם הוא מוקדם יותר) */
export function dueRuns(templates: RecurringExpense[], runs: RecurringRun[], today: string): DueRun[] {
  const thisMonth = `${today.slice(0, 7)}-01`;
  const done = new Set(runs.map((r) => `${r.recurring_id}:${r.month.slice(0, 10)}`));
  const out: DueRun[] = [];
  for (const template of templates) {
    const until = template.end_month && template.end_month.slice(0, 10) < thisMonth ? template.end_month.slice(0, 10) : thisMonth;
    for (let month = template.start_month.slice(0, 10); month <= until; month = addMonths(month, 1)) {
      if (!done.has(`${template.id}:${month}`)) {
        out.push({ template, month, occurred_on: occurrenceDate(month, template.day_of_month) });
      }
    }
  }
  return out;
}

type ExistingTx = { id: number; kind: string; occurred_on: string; category: string; counterparty: string; recurring_id?: number | null };

/**
 * רישום ידני קיים של אותה הוצאה באותו חודש (למשל שכירות שכבר נרשמה ביד), כדי לקשר אליו ולא לרשום פעמיים.
 * נותן/ת השירות חייב להיות זהה, אלא אם אחד מהם לא מולא
 */
export function findExisting(due: DueRun, transactions: ExistingTx[], taken: Set<number> = new Set()) {
  const who = due.template.counterparty;
  return transactions.find((t) => t.kind === 'expense' && !t.recurring_id && !taken.has(t.id)
    && t.occurred_on.slice(0, 7) === due.month.slice(0, 7) && t.category === due.template.category
    && (t.counterparty === who || !t.counterparty || !who));
}

/**
 * רושם את ההוצאות הקבועות שהגיע זמנן. נקרא בכניסה לדף הכספים.
 * קודם נרשם החודש ב-recurring_runs (מפתח ראשי): שתי כניסות במקביל לא ירשמו פעמיים.
 * מחזיר הודעת שגיאה, אם הייתה. לפני 0058: לא עושה כלום
 */
export async function ensureRecurring(db: DB, today: string): Promise<string | null> {
  const [t, r] = await Promise.all([
    db.from('recurring_expenses').select('*'),
    db.from('recurring_runs').select('recurring_id, month'),
  ]);
  if (isMissing(t.error) || isMissing(r.error)) return null;
  if (t.error || r.error) return (t.error ?? r.error)!.message;
  const due = dueRuns(t.data as RecurringExpense[], r.data as RecurringRun[], today);
  if (!due.length) return null;

  const tx = await db.from('transactions').select('id, kind, occurred_on, category, counterparty, recurring_id')
    .eq('kind', 'expense').gte('occurred_on', due.reduce((a, d) => (d.month < a ? d.month : a), due[0].month));
  if (tx.error) return isMissing(tx.error) ? null : tx.error.message;
  const taken = new Set<number>();

  for (const d of due) {
    const claim = await db.from('recurring_runs').insert({ recurring_id: d.template.id, month: d.month });
    if (claim.error?.code === '23505') continue;
    if (claim.error) return claim.error.message;
    const run = () => db.from('recurring_runs').delete().eq('recurring_id', d.template.id).eq('month', d.month);

    const existing = findExisting(d, tx.data as ExistingTx[], taken);
    let id = existing?.id;
    if (existing) {
      taken.add(existing.id);
      const { error } = await db.from('transactions').update({ recurring_id: d.template.id }).eq('id', existing.id);
      if (error) { await run(); return error.message; }
    } else {
      const { data, error } = await db.from('transactions').insert({
        kind: 'expense', occurred_on: d.occurred_on, amount: d.template.amount, category: d.template.category,
        counterparty: d.template.counterparty, method: d.template.method, notes: d.template.notes, recurring_id: d.template.id,
      }).select('id').single();
      if (error || !data) { await run(); return error?.message ?? 'רישום ההוצאה הקבועה נכשל'; }
      id = data.id;
    }
    await db.from('recurring_runs').update({ transaction_id: id }).eq('recurring_id', d.template.id).eq('month', d.month);
  }
  return null;
}
