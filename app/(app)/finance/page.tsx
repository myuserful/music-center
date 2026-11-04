import Link from 'next/link';
import { ConfirmButton } from '@/components/ConfirmButton';
import { TransactionFields } from '@/components/TransactionFields';
import { Empty, Flash, PageHead, one, type SP } from '@/components/ui';
import { copyRecurring, deleteTransaction, saveTransaction } from '@/lib/actions/finance';
import { monthLabel, shekel } from '@/lib/billing';
import { EXPENSE_GROUP_LABELS, PARENTS_INCOME, PARENTS_REFUND, SALARY_CATEGORY, TX_KIND_LABELS, type ExpenseGroup } from '@/lib/constants';
import { loadBilling, loadStudentNames, loadTables } from '@/lib/data';
import { buildEntries, byCategory, inMonth, paidToTeachers, totals, trackBreakdown, yearTable, type Entry } from '@/lib/finance';
import { autoLockOverdue } from '@/lib/dayLock';
import { monthPayroll } from '@/lib/payrollMonth';
import { ensureRecurring } from '@/lib/recurring';
import { createClient } from '@/lib/supabase/server';
import { fullName, type Transaction } from '@/lib/types';

const fmtDate = (d: string) => new Date(d).toLocaleDateString('he-IL');

export default async function FinancePage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const db = await createClient();
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' });
  // הוצאות קבועות שהגיע זמנן נרשמות לפני שמחשבים
  const recurringError = await ensureRecurring(db, today);
  // ימים שלא נסגרו ביד נסגרים 24 שעות אחרי שנגמרו, כמו בדף השכר, כדי שהסכומים יהיו זהים
  await autoLockOverdue(db);
  const [all, students, billing, tx, payroll] = await Promise.all([
    loadTables(db, 'teachers'), loadStudentNames(db), loadBilling(db), db.from('transactions').select('*').order('occurred_on', { ascending: false }),
    db.from('teacher_payroll').select('month, transaction_id'),
  ]);
  const transactions = (tx.data ?? []) as Transaction[];
  const salaryMonth = new Map(((payroll.data ?? []) as { month: string; transaction_id: number | null }[])
    .filter((p) => p.transaction_id).map((p) => [p.transaction_id!, p.month]));

  const monthParam = one(sp.month);
  const month = `${/^\d{4}-\d{2}$/.test(monthParam) ? monthParam : today.slice(0, 7)}-01`;
  const back = `/finance?month=${month.slice(0, 7)}`;
  const [y, m] = month.split('-').map(Number);
  const prevMonth = new Date(Date.UTC(y, m - 2, 1)).toISOString().slice(0, 10);
  const lastDay = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  // תאריך ברירת מחדל לרישום: היום, או סוף החודש המוצג אם מסתכלים על חודש אחר
  const defaultDate = inMonth(today, month) ? today : lastDay;

  const entries = buildEntries(transactions, billing.payments,
    (id) => fullName(students.get(id)), salaryMonth);
  const monthEntries = entries.filter((e) => inMonth(e.date, month));
  const sum = totals(monthEntries);
  const yearSum = totals(entries.filter((e) => e.date.startsWith(`${y}-`) && e.date <= lastDay));

  const tracks = trackBreakdown(billing.charges, billing.payments, (id) => students.get(id)?.payment_track, month, today);
  const otherIncome = sum.income - tracks.deposit.income - tracks.private.income - tracks.maccabi.income;
  const totalDebt = Object.values(tracks).reduce((n, t) => n + t.debt, 0);
  const debtLabel = lastDay < today ? 'חייבים בסוף החודש' : 'חייבים כרגע';
  const maccabiUpcoming = Object.values(tracks).reduce((n, t) => n + t.maccabiUpcoming, 0);

  const income = byCategory(monthEntries, 'income');
  const expenseOf = (group: ExpenseGroup) => byCategory(monthEntries.filter((e) => e.group === group), 'expense');
  const year = yearTable(entries, y);
  const paidNow = paidToTeachers(entries, month);
  const pay = await monthPayroll(db, all.teachers, month.slice(0, 7), today);
  // הרווח של החודש: אחרי כל שכר החודש, גם מה שעוד לא שולם
  const operating = sum.operating - pay.left.remaining;

  const canCopy = transactions.some((t) => t.recurring && inMonth(t.occurred_on, prevMonth));

  const teachers = all.teachers.filter((t) => t.active);
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
      {recurringError && <div className="flash flash-error" role="alert">רישום ההוצאות הקבועות נכשל: {recurringError}</div>}
      {tx.error && (
        <div className="flash flash-error" role="alert">
          לא ניתן לטעון הכנסות והוצאות: {tx.error.message}. האם הורץ הקובץ supabase/migrations/0024_finance.sql?
        </div>
      )}

      <div className="grid grid-4" style={{ marginBottom: 18 }}>
        <TrackCard title="פיקדון" t={tracks.deposit} debtLabel={debtLabel} />
        <TrackCard title="פרטי" t={tracks.private} debtLabel={debtLabel} />
        <TrackCard title="מכבי" t={tracks.maccabi} debtLabel={debtLabel} />
        <section className="card fin-track fin-track-total">
          <h2>סך הכל</h2>
          <div className="fin-track-row"><span>הכנסות</span><strong className="fin-track-in">{shekel(sum.income)}</strong></div>
          {otherIncome > 0 && <div className="muted">כולל {shekel(otherIncome)} מניסיון, מסלול לא ידוע ורישום ידני</div>}
          {sum.refunds > 0 && <div className="fin-track-row muted"><span>הוחזר להורים</span><span>{shekel(sum.refunds)}</span></div>}
          <div className="fin-track-row"><span>שכר מורים ששולם</span><strong className="fin-neg">{shekel(sum.teachers)}</strong></div>
          <div className="fin-track-row"><span>נותר לשלם למורים</span><strong className="fin-neg">{shekel(pay.left.remaining)}</strong></div>
          <div className="fin-track-row"><span>הוצאות קבועות</span><strong className="fin-neg">{shekel(sum.fixed)}</strong></div>
          <div className="fin-track-row"><span>הוצאות משתנות</span><strong className="fin-neg">{shekel(sum.variable)}</strong></div>
          <div className="fin-track-row"><span>סה&quot;כ הוצאות (כולל שכר שנותר לשלם)</span><strong className="fin-neg">{shekel(sum.expenses + pay.left.remaining)}</strong></div>
          <div className="fin-track-row fin-track-net">
            <span>{operating < 0 ? 'הפסד מהפעילות' : 'רווח מהפעילות'}</span>
            <strong className={operating < 0 ? 'fin-neg' : 'fin-track-in'}>{shekel(Math.abs(operating))}</strong>
          </div>
          {pay.left.remaining > 0 && <div className="muted">כולל השכר שנותר לשלם</div>}
          <div className="fin-track-row"><span>השקעות בעסק</span><strong>{shekel(sum.investment)}</strong></div>
          <div className="fin-track-row muted"><span>נשאר אחרי השקעות</span><span>{shekel(sum.afterInvestment - pay.left.remaining)}</span></div>
          <div className="fin-track-row"><span>{debtLabel}</span><strong>{shekel(totalDebt)}</strong></div>
          {tracks.other.debt > 0 && <div className="muted">כולל {shekel(tracks.other.debt)} מניסיון ומסלול לא ידוע</div>}
          <div className="fin-track-row"><span>עתידי ממכבי</span><strong>{shekel(maccabiUpcoming)}</strong></div>
          <div className="fin-track-row fin-track-net">
            <span>סה&quot;כ הכנסות כולל חייבים ועתידי</span>
            <strong className="fin-track-in">{shekel(sum.income - sum.refunds + totalDebt + maccabiUpcoming)}</strong>
          </div>
          <div className="fin-track-row muted"><span>מתחילת {y}, לפי שכר ששולם, לפני השקעות</span><span>{yearSum.operating < 0 ? 'הפסד' : 'רווח'} {shekel(Math.abs(yearSum.operating))}</span></div>
        </section>
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
        <Link className="btn" href="/finance/recurring">הוצאות קבועות</Link>
        {canCopy && (
          <form action={copyRecurring}>
            <input type="hidden" name="month" value={month} />
            <button className="btn">העתקת הקבועים מ{monthLabel(prevMonth)}</button>
          </form>
        )}
      </div>

      <div className="grid grid-2">
        <CategoryCard title="הכנסות" rows={income} total={sum.income} tone="income" />
        <CategoryCard title="הוצאות קבועות" rows={expenseOf('fixed')} total={sum.fixed} tone="expense" />
        <CategoryCard title="הוצאות משתנות" rows={expenseOf('variable')} total={sum.variable} tone="expense" />
        <CategoryCard title="השקעות בעסק" rows={expenseOf('investment')} total={sum.investment} tone="expense" />
      </div>

      <section className="card table-wrap">
        <h2>יומן {monthLabel(month)}</h2>
        {ledger.length === 0 && parentRows.length === 0 ? <Empty>אין הכנסות או הוצאות בחודש הזה</Empty> : (
          <table>
            <thead><tr><th>תאריך</th><th>סוג</th><th>קטגוריה</th><th>פירוט</th><th>אמצעי</th><th>סכום</th><th /></tr></thead>
            <tbody>
              {(['income', 'expense'] as const).map((kind) => {
                const rows = parentRows.filter((e) => e.kind === kind);
                return rows.length > 0 && (
                  <tr key={kind}>
                    <td />
                    <td><span className={`badge fin-${kind}`}>{TX_KIND_LABELS[kind]}</span></td>
                    <td>{kind === 'income' ? PARENTS_INCOME : PARENTS_REFUND}</td>
                    <td><Link href={`/payments?month=${month.slice(0, 7)}`}>{rows.length} {kind === 'income' ? 'תשלומים' : 'החזרים'} (פירוט בדף התשלומים)</Link></td>
                    <td />
                    <td><strong>{shekel(rows.reduce((n, e) => n + e.amount, 0))}</strong></td>
                    <td><span className="muted">אוטומטי</span></td>
                  </tr>
                );
              })}
              {ledger.map((e) => <LedgerRow key={e.key} e={e} tx={manual.get(e.id)} back={back} salaryMonth={salaryMonth} />)}
            </tbody>
          </table>
        )}
      </section>

      <section className="card">
        <h2>תשלומים למורים: {monthLabel(month)}</h2>
        <div className="grid grid-2">
          <div>
            <div className="fin-track-row"><span>שולם למורים בפועל החודש</span><strong>{shekel(paidNow.reduce((n, e) => n + e.amount, 0))}</strong></div>
            {paidNow.length === 0 ? <Empty>לא יצאו תשלומים למורים החודש</Empty> : (
              <ul className="list">
                {paidNow.map((e) => {
                  const t = manual.get(e.id);
                  return (
                    <li key={e.key}>
                      <div>
                        {e.label}
                        <div className="muted">{t && fmtDate(t.occurred_on)}{t?.notes && ` · ${t.notes}`}</div>
                        {t && <TxReceipt tx={t} salaryMonth={salaryMonth} />}
                      </div>
                      <strong>{shekel(e.amount)}</strong>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          <div>
            <div className="fin-track-row"><span>שכר מורים על {monthLabel(month)}</span><strong>{shekel(pay.left.total)}</strong></div>
            <div className="fin-track-row"><span>שולם מתוכו ({pay.left.paidCount} מתוך {pay.rows.length} מורים)</span><strong>{shekel(pay.left.paid)}</strong></div>
            <div className="fin-track-row"><span>נותר לשלם</span><strong className={pay.left.remaining ? 'fin-neg' : ''}>{shekel(pay.left.remaining)}</strong></div>
            {pay.left.noRate > 0 && <div className="muted">לא כולל {pay.left.noRate} מורים בלי תעריף לשעה</div>}
            {pay.left.gap > 0 && <div className="muted">ועוד {shekel(pay.left.gap)} הפרש אצל מי ששולם</div>}
            {Math.round(sum.teachers) !== Math.round(pay.left.paid) && <div className="muted">ביומן נרשם שכר של {shekel(sum.teachers)} על החודש הזה</div>}
            <p className="muted">
              כל השכר יורד מהרווח של {monthLabel(month)}, גם מה שעוד לא שולם או ששולם בחודש אחר. הסכום מחושב לפי השעות בימים שנסגרו, אז הוא יכול לעלות כשנסגרים עוד ימים.
            </p>
            <Link className="btn btn-primary" href={`/payroll?month=${month.slice(0, 7)}`}>לשכר מורים של {monthLabel(month)}</Link>
          </div>
        </div>
      </section>

      <YearTableCard t={year} y={y} month={month} />
    </>
  );
}

function YearTableCard({ t, y, month }: { t: ReturnType<typeof yearTable>; y: number; month: string }) {
  const cell = (n: number) => (n ? n.toLocaleString('he-IL') : '—');
  const cur = (mo: string) => (mo === month ? 'fin-current-cell' : '');
  const section = (title: string, rows: typeof t.fixed, sub: 'income' | 'teachers' | 'fixed' | 'variable' | 'investment') => rows.length > 0 && (
    <>
      <tr className="fin-sec"><td colSpan={14}>{title}</td></tr>
      {rows.map((r) => (
        <tr key={r.category}>
          <td>{r.category}</td>
          {r.byMonth.map((n, i) => <td key={i} className={cur(t.months[i])}>{cell(n)}</td>)}
          <td><strong>{cell(r.total)}</strong></td>
        </tr>
      ))}
      <SumRow label={`סה"כ ${title}`} values={t.totals.map((m) => m[sub])} total={t.year[sub]} />
    </>
  );
  const SumRow = ({ label, values, total, strong }: { label: string; values: number[]; total: number; strong?: boolean }) => (
    <tr className={strong ? 'fin-result' : 'fin-sub'}>
      <td>{label}</td>
      {values.map((n, i) => <td key={i} className={`${cur(t.months[i])} ${n < 0 ? 'fin-neg' : ''}`}>{cell(n)}</td>)}
      <td className={total < 0 ? 'fin-neg' : ''}>{cell(total)}</td>
    </tr>
  );
  return (
    <section className="card table-wrap">
      <h2>לפי חודשים {y} (₪)</h2>
      <table className="fin-year">
        <thead>
          <tr>
            <th />
            {t.months.map((mo) => (
              <th key={mo}>
                <Link href={`/finance?month=${mo.slice(0, 7)}`}>
                  {new Date(`${mo}T00:00:00Z`).toLocaleDateString('he-IL', { month: 'short', timeZone: 'UTC' })}
                </Link>
              </th>
            ))}
            <th>סה&quot;כ</th>
          </tr>
        </thead>
        <tbody>
          {section('הכנסות', t.income, 'income')}
          {t.year.refunds > 0 && <SumRow label="הוחזר להורים" values={t.totals.map((m) => m.refunds)} total={t.year.refunds} />}
          {section('שכר מורים (לפי חודש השכר)', t.teachers, 'teachers')}
          {t.teachersPaid.some(Boolean) && (
            <SumRow label="שולם למורים בפועל באותו חודש" values={t.teachersPaid} total={t.teachersPaid.reduce((n, v) => n + v, 0)} />
          )}
          {section('הוצאות קבועות', t.fixed, 'fixed')}
          {section('הוצאות משתנות', t.variable, 'variable')}
          <SumRow strong label="סה&quot;כ הוצאות (כולל שכר)" values={t.totals.map((m) => m.expenses)} total={t.year.expenses} />
          <SumRow strong label="רווח מהפעילות" values={t.totals.map((m) => m.operating)} total={t.year.operating} />
          {section('השקעות בעסק', t.investment, 'investment')}
          <SumRow strong label="נשאר אחרי השקעות" values={t.totals.map((m) => m.afterInvestment)} total={t.year.afterInvestment} />
        </tbody>
      </table>
    </section>
  );
}

function TrackCard({ title, t, debtLabel }: { title: string; t: ReturnType<typeof trackBreakdown>['private']; debtLabel: string }) {
  return (
    <section className="card fin-track">
      <h2>{title}</h2>
      <div className="fin-track-row"><span>הכנסות</span><strong className="fin-track-in">{shekel(t.income)}</strong></div>
      {t.refunds > 0 && <div className="fin-track-row muted"><span>הוחזר להורים</span><span>{shekel(t.refunds)}</span></div>}
      <div className="fin-track-row">
        <span>{debtLabel}{t.debtors > 0 && ` (${t.debtors})`}</span>
        <strong className={t.debt > 0 ? 'fin-neg' : ''}>{shekel(t.debt)}</strong>
      </div>
      {t.maccabiOverdue > 0 && <div className="muted">מתוכם {shekel(t.maccabiOverdue)} זיכוי מכבי באיחור</div>}
      {t.maccabiUpcoming > 0 && <div className="fin-track-row"><span>עתידי ממכבי</span><strong>{shekel(t.maccabiUpcoming)}</strong></div>}
      <div className="fin-track-row fin-track-net">
        <span>סה&quot;כ כולל חייבים{t.maccabiUpcoming > 0 && ' ועתידי'}</span>
        <strong>{shekel(t.income - t.refunds + t.debt + t.maccabiUpcoming)}</strong>
      </div>
    </section>
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

/** קישורים לקבלה ולאסמכתא. בשכר מורים בלי קבלה: "חסרה קבלה", עם קישור למקום שמצרפים אותה */
function TxReceipt({ tx, salaryMonth }: { tx: Transaction; salaryMonth: Map<number, string> }) {
  const month = salaryMonth.get(tx.id);
  return (
    <>
      {tx.receipt_path ? (
        <div><a className="fin-clip" href={`/finance/${tx.id}/receipt`} target="_blank" rel="noopener" title={tx.receipt_name}>📎 קבלה</a></div>
      ) : tx.category === SALARY_CATEGORY && (
        <div><Link className="badge badge-pending" href={month ? `/payroll?month=${month.slice(0, 7)}` : `/finance/${tx.id}`}>חסרה קבלה</Link></div>
      )}
      {tx.proof_path && (
        <div><a className="fin-clip" href={`/finance/${tx.id}/receipt?file=proof`} target="_blank" rel="noopener" title={tx.proof_name}>📎 אסמכתא</a></div>
      )}
    </>
  );
}

function LedgerRow({ e, tx, back, salaryMonth }: { e: Entry; tx?: Transaction; back: string; salaryMonth: Map<number, string> }) {
  return (
    <tr>
      <td>{e.source === 'fund' ? '' : fmtDate(tx?.occurred_on ?? e.date)}</td>
      <td><span className={`badge fin-${e.kind}`}>{e.group ? EXPENSE_GROUP_LABELS[e.group] : TX_KIND_LABELS[e.kind]}</span></td>
      <td>
        {e.category}
        {tx?.recurring_id ? <span className="chip chip-plain">נרשם אוטומטית</span> : tx?.recurring && <span className="chip chip-plain">קבוע</span>}
      </td>
      <td>
        {e.label}
        {tx?.notes && <div className="muted">{tx.notes}</div>}
      </td>
      <td>
        {e.method}{tx?.reference && <div className="muted">{tx.reference}</div>}
        {tx && <TxReceipt tx={tx} salaryMonth={salaryMonth} />}
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
