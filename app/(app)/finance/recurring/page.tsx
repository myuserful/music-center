import { ConfirmButton } from '@/components/ConfirmButton';
import { BackLink, Empty, Flash, PageHead, type SP } from '@/components/ui';
import { deleteRecurring, saveRecurring } from '@/lib/actions/finance';
import { monthLabel, shekel } from '@/lib/billing';
import { EXPENSE_GROUP_LABELS, FIXED_EXPENSES, TX_METHOD_LABELS, TX_METHODS } from '@/lib/constants';
import { expenseGroup } from '@/lib/finance';
import { isMissing, RECURRING_MISSING } from '@/lib/recurring';
import { createClient } from '@/lib/supabase/server';
import type { RecurringExpense } from '@/lib/types';

/** ניהול ההוצאות הקבועות: מגדירים פעם אחת, והן נרשמות לבד בכל חודש (ensureRecurring בדף הכספים) */
export default async function RecurringPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const db = await createClient();
  const { data, error } = await db.from('recurring_expenses').select('*').order('day_of_month').order('category');
  const missing = isMissing(error);
  const items = (data ?? []) as RecurringExpense[];

  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' });
  const month = `${today.slice(0, 7)}-01`;
  const active = (r: RecurringExpense) => r.start_month.slice(0, 10) <= month && (!r.end_month || r.end_month.slice(0, 10) >= month);
  const total = items.filter(active).reduce((n, r) => n + Number(r.amount), 0);

  return (
    <>
      <BackLink href="/finance">הכנסות והוצאות</BackLink>
      <PageHead title="הוצאות קבועות" sub={`סה"כ ${shekel(total)} בחודש · נרשמות לבד בתחילת כל חודש`} />
      <Flash sp={sp} />
      {missing && <div className="flash flash-error" role="alert">{RECURRING_MISSING}. עד אז אי אפשר להוסיף הוצאות קבועות.</div>}
      {error && !missing && <div className="flash flash-error" role="alert">{error.message}</div>}

      <details className="card fin-new" open={!missing && items.length === 0}>
        <summary className="btn btn-primary">+ הוצאה קבועה</summary>
        <form action={saveRecurring}>
          <RecurringFields today={today} />
          <div className="form-foot"><button className="btn btn-primary" disabled={missing}>הוספה</button></div>
        </form>
      </details>

      <section className="card">
        <h2>הרשימה</h2>
        <p className="muted">
          אפשר להתחיל מחודש שעבר, ואז החודשים שעברו יירשמו גם הם. אם הוצאה כבר נרשמה ביד באותו חודש, היא לא תירשם פעמיים.
          עריכת סכום חלה על החודש הנוכחי והלאה. מחיקה של רישום בודד ביומן לא מחזירה אותו.
        </p>
        {items.length === 0 ? <Empty>עוד אין הוצאות קבועות</Empty> : (
          <div className="rec-list">
            {items.map((r) => (
              <details key={r.id} className="rec-item">
                <summary>
                  <span className="rec-name">
                    <strong>{r.category}</strong>
                    {r.counterparty && <span className="muted"> · {r.counterparty}</span>}
                    {!active(r) && <span className="chip chip-plain">לא פעיל</span>}
                  </span>
                  <span className="muted">
                    כל {r.day_of_month} לחודש · {TX_METHOD_LABELS[r.method]} · מ{monthLabel(r.start_month)}
                    {r.end_month && ` עד ${monthLabel(r.end_month)}`} · {EXPENSE_GROUP_LABELS[expenseGroup(r.category, true)]}
                  </span>
                  <strong>{shekel(Number(r.amount))}</strong>
                </summary>
                <form action={saveRecurring}>
                  <input type="hidden" name="id" value={r.id} />
                  <RecurringFields r={r} today={today} />
                  <div className="form-foot"><button className="btn btn-primary">שמירה</button></div>
                </form>
                <form action={deleteRecurring}>
                  <input type="hidden" name="id" value={r.id} />
                  <ConfirmButton className="btn btn-xs btn-danger" message={`למחוק את ההוצאה הקבועה (${r.category})? מה שכבר נרשם נשאר ביומן.`}>מחיקה</ConfirmButton>
                </form>
              </details>
            ))}
          </div>
        )}
      </section>
    </>
  );
}

function RecurringFields({ r, today }: { r?: RecurringExpense; today: string }) {
  const list = `recurring-categories-${r?.id ?? 'new'}`;
  return (
    <div className="form-grid">
      <label>
        קטגוריה
        <input name="category" list={list} defaultValue={r?.category} placeholder="בחירה או הקלדה" required />
        <datalist id={list}>{FIXED_EXPENSES.map((c) => <option key={c} value={c} />)}</datalist>
      </label>
      <label>למי (ספק / נותן שירות)<input name="counterparty" defaultValue={r?.counterparty} /></label>
      <label>סכום לחודש (₪)<input type="number" name="amount" min="0.01" step="any" defaultValue={r?.amount} required /></label>
      <label>יום בחודש<input type="number" name="day_of_month" min="1" max="31" defaultValue={r?.day_of_month ?? 1} required /></label>
      <label>
        אמצעי תשלום
        <select name="method" defaultValue={r?.method ?? 'bank_transfer'}>
          {TX_METHODS.map((m) => <option key={m} value={m}>{TX_METHOD_LABELS[m]}</option>)}
        </select>
      </label>
      <label>מאיזה חודש<input type="month" name="start_month" defaultValue={(r?.start_month ?? today).slice(0, 7)} required /></label>
      <label>עד איזה חודש (לא חובה)<input type="month" name="end_month" defaultValue={r?.end_month?.slice(0, 7)} /></label>
      <label className="wide">הערות<textarea name="notes" defaultValue={r?.notes} /></label>
    </div>
  );
}
