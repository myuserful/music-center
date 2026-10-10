import Link from 'next/link';
import { Empty, Flash, PageHead, one, type SP } from '@/components/ui';
import {
  addPayment, generateCharges, saveBillingSettings, setChargeState, setCheckStatus,
} from '@/lib/actions/payments';
import { monthLabel, parentBalance, shekel } from '@/lib/billing';
import { CHARGE_STATE_LABELS, COMMITMENT_FUNDS, HEALTH_FUND_LABELS } from '@/lib/constants';
import { loadAll, loadBilling } from '@/lib/data';
import { createClient } from '@/lib/supabase/server';
import { fullName, type Charge } from '@/lib/types';

const fmtDate = (d: string) => new Date(d).toLocaleDateString('he-IL');

export default async function PaymentsPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const db = await createClient();
  const [all, billing] = await Promise.all([loadAll(db), loadBilling(db)]);
  const { maps } = all;

  const monthParam = one(sp.month);
  const month = `${/^\d{4}-\d{2}$/.test(monthParam) ? monthParam : new Date().toISOString().slice(0, 7)}-01`;
  const back = `/payments?month=${month.slice(0, 7)}`;
  const name = (id: number) => fullName(maps.student.get(id));

  const byStudent = <T extends { student_id: number }>(rows: T[]) => {
    const m = new Map<number, T[]>();
    for (const r of rows) m.set(r.student_id, [...(m.get(r.student_id) ?? []), r]);
    return m;
  };
  const chargesOf = byStudent(billing.charges);
  const paymentsOf = byStudent(billing.payments);
  const balance = (id: number) => parentBalance(chargesOf.get(id) ?? [], paymentsOf.get(id) ?? []);

  const thisMonth = billing.charges.filter((c) => c.month === month && c.state !== 'cancelled');
  const billed = thisMonth.filter((c) => c.payer === 'parents' && c.state === 'due')
    .reduce((n, c) => n + Number(c.amount), 0);
  const collected = billing.payments.filter((p) => p.paid_on.startsWith(month.slice(0, 7)) && p.check_status !== 'bounced')
    .reduce((n, p) => n + Number(p.amount), 0);

  const debtors = all.students
    .map((s) => ({ s, owe: balance(s.id) }))
    .filter((x) => x.owe > 0)
    .sort((a, b) => b.owe - a.owe);
  const awaitingRefund = billing.charges.filter((c) => c.state === 'awaiting_refund');
  const standingDue = debtors.filter((x) => x.s.standing_order);
  const pendingChecks = billing.payments.filter((p) => p.check_status === 'pending')
    .sort((a, b) => (a.check_date ?? '').localeCompare(b.check_date ?? ''));

  // תלמידים פעילים עם שיבוץ סופי שאי אפשר לחייב
  const hasActivity = (id: number) =>
    all.lessons.some((l) => l.student_id === id && l.status === 'confirmed') ||
    all.enrollments.some((e) => e.student_id === id && e.status === 'confirmed');
  const unknownTrack = all.students.filter((s) => s.status === 'active' && s.payment_track === 'unknown' && hasActivity(s.id));
  const unpricedChoirs = all.choirs.filter((c) => c.price_private == null || c.commitments == null);

  const fundCharges = thisMonth.filter((c) => c.payer === 'fund');
  const rate = new Map(billing.rates.map((r) => [r.fund, r.amount]));

  return (
    <>
      <PageHead title="תשלומים" sub={monthLabel(month)}>
        <form className="inline" method="get">
          <input type="month" name="month" defaultValue={month.slice(0, 7)} aria-label="חודש" />
          <button className="btn btn-xs">הצגה</button>
        </form>
        <form action={generateCharges}>
          <input type="hidden" name="month" value={month} />
          <button className="btn btn-primary">יצירת חיובים ל{monthLabel(month)}</button>
        </form>
      </PageHead>
      <Flash sp={sp} />

      <div className="grid grid-4" style={{ marginBottom: 18 }}>
        <div className="stat"><div className="stat-num">{shekel(billed)}</div><div className="stat-label">חויב מהורים החודש</div></div>
        <div className="stat stat-free"><div className="stat-num">{shekel(collected)}</div><div className="stat-label">התקבל החודש</div></div>
        <div className="stat stat-pending"><div className="stat-num">{awaitingRefund.length}</div><div className="stat-label">ממתינים להחזר ממכבי</div></div>
        <div className="stat stat-undecided">
          <div className="stat-num">{fundCharges.filter((c) => c.state === 'to_submit').reduce((n, c) => n + (c.commitments ?? 0), 0)}</div>
          <div className="stat-label">התחייבויות להגשה החודש</div>
        </div>
      </div>

      {(unknownTrack.length > 0 || unpricedChoirs.length > 0) && (
        <section className="card">
          <h2>חסר מידע לחיוב</h2>
          {unknownTrack.length > 0 && (
            <p>
              <strong>מסלול תשלום לא ידוע ({unknownTrack.length}):</strong>{' '}
              {unknownTrack.map((s) => (
                <Link key={s.id} className="chip" href={`/students/${s.id}`}>
                  {fullName(s)}{s.health_fund ? ` · ${HEALTH_FUND_LABELS[s.health_fund]}` : ''}
                </Link>
              ))}
            </p>
          )}
          {unpricedChoirs.length > 0 && (
            <p>
              <strong>מקהלות בלי מחירון מלא:</strong>{' '}
              {unpricedChoirs.map((c) => <Link key={c.id} className="chip" href={`/choirs/${c.id}`}>{c.name}</Link>)}
            </p>
          )}
        </section>
      )}

      <div className="grid grid-2">
        <section className="card">
          <h2>חובות הורים ({debtors.length})</h2>
          {debtors.length === 0 ? <Empty>אין חובות</Empty> : (
            <ul className="list">
              {debtors.map(({ s, owe }) => (
                <li key={s.id}>
                  <Link href={`/students/${s.id}`}>{fullName(s)}</Link>
                  <span>{s.standing_order && <span className="chip chip-plain">הוראת קבע</span>}</span>
                  <strong>{shekel(owe)}</strong>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card">
          <h2>מכבי: חלק 2 ממתין להחזר</h2>
          {awaitingRefund.length === 0 ? <Empty>אין</Empty> : (
            <ul className="list">
              {awaitingRefund.map((c) => (
                <li key={c.id}>
                  <div>
                    <Link href={`/students/${c.student_id}`}>{name(c.student_id)}</Link>
                    <div className="muted">{c.description} · {monthLabel(c.month)} · {shekel(Number(c.amount))}</div>
                  </div>
                  <form action={setChargeState}>
                    <input type="hidden" name="id" value={c.id} />
                    <input type="hidden" name="state" value="due" />
                    <input type="hidden" name="back" value={back} />
                    <button className="btn btn-xs">קיבלו החזר</button>
                  </form>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card">
          <h2>הוראות קבע לאישור</h2>
          <p className="muted">אחרי שבודקים בדף הבנק שהכסף נכנס</p>
          {standingDue.length === 0 ? <Empty>אין הוראות קבע פתוחות</Empty> : (
            <ul className="list">
              {standingDue.map(({ s, owe }) => (
                <li key={s.id}>
                  <Link href={`/students/${s.id}`}>{fullName(s)}</Link>
                  <form action={addPayment}>
                    <input type="hidden" name="student_id" value={s.id} />
                    <input type="hidden" name="amount" value={owe} />
                    <input type="hidden" name="method" value="standing_order" />
                    <input type="hidden" name="back" value={back} />
                    <button className="btn btn-xs btn-confirmed">נכנסו {shekel(owe)}</button>
                  </form>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card">
          <h2>צ&apos;קים ממתינים להפקדה</h2>
          {pendingChecks.length === 0 ? <Empty>אין צ&apos;קים ממתינים</Empty> : (
            <ul className="list">
              {pendingChecks.map((p) => (
                <li key={p.id}>
                  <div>
                    <Link href={`/students/${p.student_id}`}>{name(p.student_id)}</Link> · {shekel(Number(p.amount))}
                    <div className="muted">
                      צ&apos;ק {p.check_number} {p.check_bank}{p.check_date && ` · לפירעון ${fmtDate(p.check_date)}`}
                    </div>
                  </div>
                  <div className="status-actions">
                    {(['deposited', 'bounced'] as const).map((st) => (
                      <form key={st} action={setCheckStatus}>
                        <input type="hidden" name="id" value={p.id} />
                        <input type="hidden" name="check_status" value={st} />
                        <input type="hidden" name="back" value={back} />
                        <button className={`btn btn-xs ${st === 'bounced' ? 'btn-danger' : 'btn-confirmed'}`}>
                          {st === 'deposited' ? 'הופקד' : 'חזר'}
                        </button>
                      </form>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="card">
        <h2>התחייבויות לקופות: {monthLabel(month)}</h2>
        {fundCharges.length === 0 ? <Empty>אין התחייבויות לחודש הזה. יוצרים אותן בכפתור &quot;יצירת חיובים&quot;.</Empty> : (
          COMMITMENT_FUNDS.map((fund) => {
            const rows = fundCharges.filter((c) => c.fund === fund);
            if (!rows.length) return null;
            const total = rows.reduce((n, c) => n + (c.commitments ?? 0), 0);
            const toSubmit = rows.filter((c) => c.state === 'to_submit');
            return (
              <div key={fund} style={{ marginBottom: 16 }}>
                <h3>
                  {HEALTH_FUND_LABELS[fund]}: {total} התחייבויות
                  {rate.get(fund) != null && ` · ${shekel(total * Number(rate.get(fund)))}`}
                </h3>
                <div className="table-wrap">
                  <table>
                    <thead><tr><th>תלמיד/ה</th><th>ת&quot;ז</th><th>פעילות</th><th>התחייבויות</th><th>סטטוס</th><th /></tr></thead>
                    <tbody>
                      {rows.map((c) => (
                        <tr key={c.id}>
                          <td><Link href={`/students/${c.student_id}`}>{name(c.student_id)}</Link></td>
                          <td dir="ltr">{maps.student.get(c.student_id)?.id_number}</td>
                          <td>{c.description}</td>
                          <td>{c.commitments}</td>
                          <td>{CHARGE_STATE_LABELS[c.state]}</td>
                          <td><FundStateButtons c={c} back={back} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {toSubmit.length > 0 && (
                  <form action={setChargeState} style={{ marginTop: 8 }}>
                    {toSubmit.map((c) => <input key={c.id} type="hidden" name="id" value={c.id} />)}
                    <input type="hidden" name="state" value="submitted" />
                    <input type="hidden" name="back" value={back} />
                    <button className="btn btn-xs">סימון הכול כהוגש ל{HEALTH_FUND_LABELS[fund]} ({toSubmit.length})</button>
                  </form>
                )}
              </div>
            );
          })
        )}
      </section>

      <section className="card">
        <h2>מחירון</h2>
        <form action={saveBillingSettings}>
          <div className="form-grid">
            <label>שיעור פרטי: מחיר פרטי לחודש<input name="lesson_private" type="number" min="0" defaultValue={billing.settings.lesson_private} required /></label>
            <label>שיעור פרטי: מכבי חלק 1<input name="lesson_maccabi_1" type="number" min="0" defaultValue={billing.settings.lesson_maccabi_1} required /></label>
            <label>שיעור פרטי: מכבי חלק 2<input name="lesson_maccabi_2" type="number" min="0" defaultValue={billing.settings.lesson_maccabi_2} required /></label>
            <label>שיעור פרטי: התחייבויות בחודש<input name="lesson_commitments" type="number" min="0" defaultValue={billing.settings.lesson_commitments} required /></label>
            {COMMITMENT_FUNDS.map((f) => (
              <label key={f}>
                {HEALTH_FUND_LABELS[f]}: ₪ להתחייבות
                <input name={`rate_${f}`} type="number" min="0" step="any" defaultValue={rate.get(f) ?? ''} placeholder="לא ידוע" />
              </label>
            ))}
          </div>
          <p className="muted">מחירי המקהלות נקבעים בדף של כל מקהלה.</p>
          <div className="form-foot"><button className="btn btn-primary">שמירת מחירון</button></div>
        </form>
      </section>
    </>
  );
}

function FundStateButtons({ c, back }: { c: Charge; back: string }) {
  const next: Partial<Record<Charge['state'], Charge['state'][]>> = {
    to_submit: ['submitted'],
    submitted: ['paid', 'rejected'],
    rejected: ['to_submit'],
  };
  return (
    <div className="status-actions">
      {(next[c.state] ?? []).map((st) => (
        <form key={st} action={setChargeState}>
          <input type="hidden" name="id" value={c.id} />
          <input type="hidden" name="state" value={st} />
          <input type="hidden" name="back" value={back} />
          <button className={`btn btn-xs ${st === 'rejected' ? 'btn-danger' : st === 'paid' ? 'btn-confirmed' : ''}`}>
            {st === 'to_submit' ? 'להגיש שוב' : CHARGE_STATE_LABELS[st]}
          </button>
        </form>
      ))}
    </div>
  );
}
