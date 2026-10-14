import Link from 'next/link';
import { ConfirmButton } from '@/components/ConfirmButton';
import { TransactionFields } from '@/components/TransactionFields';
import { Empty, Flash, PageHead, one, type SP } from '@/components/ui';
import { copyRecurring, deleteTransaction, saveTransaction } from '@/lib/actions/finance';
import { monthLabel, shekel } from '@/lib/billing';
import { PARENTS_INCOME, SALARY_CATEGORY, TX_KIND_LABELS } from '@/lib/constants';
import { loadAll, loadBilling } from '@/lib/data';
import { buildEntries, byCategory, inMonth, salaryEstimate, totals, type Entry } from '@/lib/finance';
import { createClient } from '@/lib/supabase/server';
import { fullName, type Transaction } from '@/lib/types';

const fmtDate = (d: string) => new Date(d).toLocaleDateString('he-IL');

export default async function FinancePage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const db = await createClient();
  const [all, billing, tx] = await Promise.all([
    loadAll(db), loadBilling(db), db.from('transactions').select('*').order('occurred_on', { ascending: false }),
  ]);
  const transactions = (tx.data ?? []) as Transaction[];

  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' });
  const monthParam = one(sp.month);
  const month = `${/^\d{4}-\d{2}$/.test(monthParam) ? monthParam : today.slice(0, 7)}-01`;
  const back = `/finance?month=${month.slice(0, 7)}`;
  const [y, m] = month.split('-').map(Number);
  const prevMonth = new Date(Date.UTC(y, m - 2, 1)).toISOString().slice(0, 10);
  const lastDay = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  // תאריך ברירת מחדל לרישום: היום, או סוף החודש המוצג אם מסתכלים על חודש אחר
  const defaultDate = inMonth(today, month) ? today : lastDay;

  const entries = buildEntries(transactions, billing.payments, billing.charges,
    (id) => fullName(all.maps.student.get(id)));
  const monthEntries = entries.filter((e) => inMonth(e.date, month));
  const sum = totals(monthEntries);
  const yearSum = totals(entries.filter((e) => e.date.startsWith(`${y}-`) && e.date <= lastDay));

  const income = byCategory(monthEntries, 'income');
  const expense = byCategory(monthEntries, 'expense');

  const months = Array.from({ length: 12 }, (_, i) => `${y}-${String(i + 1).padStart(2, '0')}-01`);
  const yearRows = months.map((mo) => ({ month: mo, ...totals(entries.filter((e) => inMonth(e.date, mo))) }));

  const canCopy = transactions.some((t) => t.recurring && inMonth(t.occurred_on, prevMonth));

  const teachers = all.teachers.filter((t) => t.active);
  const salaries = teachers.map((t) => ({
    t,
    ...salaryEstimate(t, all.lessons, all.choirs, month),
    paid: transactions.filter((x) => x.kind === 'expense' && x.teacher_id === t.id && inMonth(x.occurred_on, month))
      .reduce((n, x) => n + Number(x.amount), 0),
  })).filter((s) => s.weeklyHours > 0 || s.paid > 0);

  const parentRows = monthEntries.filter((e) => e.source === 'parents');
  const ledger = monthEntries.filter((e) => e.source !== 'parents');
  const manual = new Map(transactions.map((t) => [t.id, t]));

  return (
    <>
      <PageHead title="הכנסות והוצאות" sub={monthLabel(month)}>
        <form className="inline" method="get">
          <input type="month" name="month" defaultValue={month.slice(0, 7)} aria-label="חודש" />
          <button className="btn btn-xs">הצגה</button>
        </form>
        <a className="btn" href={`/finance/export?year=${y}`}>הורדה לאקסל ({y})</a>
      </PageHead>
      <Flash sp={sp} />
      {tx.error && (
        <div className="flash flash-error" role="alert">
          לא ניתן לטעון הכנסות והוצאות: {tx.error.message}. האם הורץ הקובץ supabase/migrations/0024_finance.sql?
        </div>
      )}

      <div className="grid grid-4" style={{ marginBottom: 18 }}>
        <div className="stat stat-free"><div className="stat-num">{shekel(sum.income)}</div><div className="stat-label">הכנסות החודש</div></div>
        <div className="stat stat-none"><div className="stat-num">{shekel(sum.expense)}</div><div className="stat-label">הוצאות החודש</div></div>
        <div className={`stat ${sum.net < 0 ? 'stat-none' : 'stat-undecided'}`}>
          <div className="stat-num">{shekel(sum.net)}</div><div className="stat-label">{sum.net < 0 ? 'הפסד החודש' : 'רווח החודש'}</div>
        </div>
        <div className={`stat ${yearSum.net < 0 ? 'stat-none' : 'stat-pending'}`}>
          <div className="stat-num">{shekel(yearSum.net)}</div><div className="stat-label">מתחילת {y}</div>
        </div>
      </div>

      <div className="fin-actions">
        {(['expense', 'income'] as const).map((kind) => (
          <details key={kind} className="card fin-new">
            <summary className={`btn ${kind === 'expense' ? 'btn-primary' : 'btn-confirmed'}`}>+ {TX_KIND_LABELS[kind]}</summary>
            <form action={saveTransaction}>
              <input type="hidden" name="back" value={back} />
              <TransactionFields kind={kind} teachers={teachers} today={defaultDate} />
              <div className="form-foot"><button className="btn btn-primary">רישום {TX_KIND_LABELS[kind]}</button></div>
            </form>
          </details>
        ))}
        {canCopy && (
          <form action={copyRecurring}>
            <input type="hidden" name="month" value={month} />
            <button className="btn">העתקת הקבועים מ{monthLabel(prevMonth)}</button>
          </form>
        )}
      </div>

      <div className="grid grid-2">
        <CategoryCard title="הכנסות לפי קטגוריה" rows={income} total={sum.income} tone="income" />
        <CategoryCard title="הוצאות לפי קטגוריה" rows={expense} total={sum.expense} tone="expense" />
      </div>

      <section className="card table-wrap">
        <h2>יומן {monthLabel(month)}</h2>
        {ledger.length === 0 && parentRows.length === 0 ? <Empty>אין הכנסות או הוצאות בחודש הזה</Empty> : (
          <table>
            <thead><tr><th>תאריך</th><th>סוג</th><th>קטגוריה</th><th>פירוט</th><th>אמצעי</th><th>סכום</th><th /></tr></thead>
            <tbody>
              {parentRows.length > 0 && (
                <tr>
                  <td />
                  <td><span className="badge fin-income">הכנסה</span></td>
                  <td>{PARENTS_INCOME}</td>
                  <td><Link href={`/payments?month=${month.slice(0, 7)}`}>{parentRows.length} תשלומים (פירוט בדף התשלומים)</Link></td>
                  <td />
                  <td><strong>{shekel(parentRows.reduce((n, e) => n + e.amount, 0))}</strong></td>
                  <td><span className="muted">אוטומטי</span></td>
                </tr>
              )}
              {ledger.map((e) => <LedgerRow key={e.key} e={e} tx={manual.get(e.id)} back={back} />)}
            </tbody>
          </table>
        )}
      </section>

      <section className="card table-wrap">
        <h2>שכר מורים: {monthLabel(month)}</h2>
        <p className="muted">
          הערכה לפי שיעורים סופיים ומקהלות כפול מספר הפעמים שהיום חל בחודש, כפול השכר לשעה (בכרטיס המורה).
          לא כולל חגים וחופשות: אפשר לתקן את הסכום לפני הרישום.
        </p>
        {salaries.length === 0 ? <Empty>אין מורים עם שיעורים סופיים</Empty> : (
          <table>
            <thead><tr><th>מורה</th><th>שעות בשבוע</th><th>שעות בחודש</th><th>לשעה</th><th>הערכה</th><th>שולם החודש</th><th>רישום תשלום</th></tr></thead>
            <tbody>
              {salaries.map((s) => {
                const left = s.amount == null ? null : Math.max(s.amount - s.paid, 0);
                return (
                  <tr key={s.t.id}>
                    <td><Link href={`/teachers/${s.t.id}`}>{fullName(s.t)}</Link></td>
                    <td>{s.weeklyHours}</td>
                    <td>{s.hours}</td>
                    <td>{s.t.hourly_rate == null ? <span className="muted">לא הוגדר</span> : shekel(Number(s.t.hourly_rate))}</td>
                    <td>{shekel(s.amount)}</td>
                    <td>{s.paid ? <strong className="fin-paid">{shekel(s.paid)}</strong> : <span className="muted">—</span>}</td>
                    <td>
                      <form action={saveTransaction} className="inline fin-salary">
                        <input type="hidden" name="kind" value="expense" />
                        <input type="hidden" name="category" value={SALARY_CATEGORY} />
                        <input type="hidden" name="teacher_id" value={s.t.id} />
                        <input type="hidden" name="counterparty" value={fullName(s.t)} />
                        <input type="hidden" name="occurred_on" value={defaultDate} />
                        <input type="hidden" name="method" value="bank_transfer" />
                        <input type="hidden" name="notes" value={`שכר ${monthLabel(month)}`} />
                        <input type="hidden" name="back" value={back} />
                        <input type="number" name="amount" min="1" step="any" defaultValue={left || ''} aria-label="סכום" required />
                        <button className="btn btn-xs">שולם</button>
                      </form>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      <section className="card table-wrap">
        <h2>סיכום שנתי {y}</h2>
        <table>
          <thead><tr><th>חודש</th><th>הכנסות</th><th>הוצאות</th><th>רווח / הפסד</th></tr></thead>
          <tbody>
            {yearRows.map((r) => (
              <tr key={r.month} className={r.month === month ? 'fin-current' : ''}>
                <td><Link href={`/finance?month=${r.month.slice(0, 7)}`}>{monthLabel(r.month)}</Link></td>
                <td>{r.income ? shekel(r.income) : '—'}</td>
                <td>{r.expense ? shekel(r.expense) : '—'}</td>
                <td className={r.net < 0 ? 'fin-neg' : ''}>{r.income || r.expense ? shekel(r.net) : '—'}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th>סה&quot;כ</th>
              <th>{shekel(yearRows.reduce((n, r) => n + r.income, 0))}</th>
              <th>{shekel(yearRows.reduce((n, r) => n + r.expense, 0))}</th>
              <th>{shekel(yearRows.reduce((n, r) => n + r.net, 0))}</th>
            </tr>
          </tfoot>
        </table>
      </section>
    </>
  );
}

function CategoryCard({
  title, rows, total, tone,
}: { title: string; rows: { category: string; amount: number }[]; total: number; tone: 'income' | 'expense' }) {
  return (
    <section className="card">
      <h2>{title}</h2>
      {rows.length === 0 ? <Empty>אין</Empty> : (
        <ul className="fin-cats">
          {rows.map((r) => (
            <li key={r.category}>
              <div className="fin-cat-top"><span>{r.category}</span><strong>{shekel(r.amount)}</strong></div>
              <div className="fin-bar"><span className={`fin-bar-${tone}`} style={{ width: `${(r.amount / total) * 100}%` }} /></div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function LedgerRow({ e, tx, back }: { e: Entry; tx?: Transaction; back: string }) {
  return (
    <tr>
      <td>{e.source === 'fund' ? '' : fmtDate(e.date)}</td>
      <td><span className={`badge fin-${e.kind}`}>{TX_KIND_LABELS[e.kind]}</span></td>
      <td>{e.category}{tx?.recurring && <span className="chip chip-plain">קבוע</span>}</td>
      <td>
        {e.label}
        {tx?.notes && <div className="muted">{tx.notes}</div>}
      </td>
      <td>
        {e.method}{tx?.reference && <div className="muted">{tx.reference}</div>}
        {tx?.receipt_path && (
          <a className="fin-clip" href={`/finance/${tx.id}/receipt`} target="_blank" rel="noopener" title={tx.receipt_name}>📎 קבלה</a>
        )}
      </td>
      <td><strong>{shekel(e.amount)}</strong></td>
      <td>
        {e.source === 'manual' ? (
          <div className="status-actions">
            <Link className="btn btn-xs" href={`/finance/${e.id}`}>עריכה</Link>
            <form action={deleteTransaction}>
              <input type="hidden" name="id" value={e.id} />
              <input type="hidden" name="back" value={back} />
              <ConfirmButton className="btn btn-xs btn-danger" message={`למחוק את הרישום (${e.category}, ${shekel(e.amount)})?`}>מחיקה</ConfirmButton>
            </form>
          </div>
        ) : <span className="muted">אוטומטי</span>}
      </td>
    </tr>
  );
}
