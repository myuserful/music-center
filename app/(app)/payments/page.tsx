import Link from 'next/link';
import { Empty, Flash, PageHead, one, type SP } from '@/components/ui';
import { ConfirmButton } from '@/components/ConfirmButton';
import { DeletePaymentButton } from '@/components/DeletePaymentButton';
import {
  addPayment, issueInternal, issueReceipt, rebillMonth, saveBillingSettings, setCheckStatus, setCommitmentNotified, testSumit,
} from '@/lib/actions/payments';
import { account, effectiveAmount, maccabiPart, monthLabel, shekel } from '@/lib/billing';
import { BILLABLE, DAYS, HEALTH_FUND_LABELS, PAYMENT_METHOD_LABELS, PAYMENT_TRACK_LABELS } from '@/lib/constants';
import { addDays, dmy, weekdayOf } from '@/lib/day';
import { loadAll, loadBilling, loadReceipts } from '@/lib/data';
import { autoLockOverdue } from '@/lib/dayLock';
import { createClient } from '@/lib/supabase/server';
import { sumitConfigured } from '@/lib/sumit';
import { fullName, type Charge, type DayClosure, type DayLesson, type Payment } from '@/lib/types';

export default async function PaymentsPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const db = await createClient();
  // ימים שלא נסגרו ביד נסגרים 24 שעות אחרי שנגמרו (לפני שמחשבים)
  await autoLockOverdue(db);
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' });
  const monthParam = one(sp.month);
  const month = /^\d{4}-\d{2}$/.test(monthParam) ? monthParam : today.slice(0, 7);
  const [y, m] = month.split('-').map(Number);
  const first = `${month}-01`;
  const last = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  const back = `/payments?month=${month}`;

  const [all, billing, closuresRes, dayRes, receipts] = await Promise.all([
    loadAll(db), loadBilling(db),
    db.from('day_closures').select('*').gte('lesson_date', first).lte('lesson_date', last),
    db.from('day_lessons').select('*').gte('lesson_date', first).lte('lesson_date', last),
    loadReceipts(db),
  ]);
  const { maps } = all;
  const closures = (closuresRes.data ?? []) as DayClosure[];
  const dayLessons = (dayRes.data ?? []) as DayLesson[];
  const name = (id: number) => fullName(maps.student.get(id));

  const group = <T extends { student_id: number }>(rows: T[]) => {
    const g = new Map<number, T[]>();
    for (const r of rows) g.set(r.student_id, [...(g.get(r.student_id) ?? []), r]);
    return g;
  };
  const chargesOf = group<Charge>(billing.charges);
  const paymentsOf = group<Payment>(billing.payments);
  const ids = new Set([...chargesOf.keys(), ...paymentsOf.keys()]);
  const accounts = [...ids].map((id) => ({
    id, student: maps.student.get(id), a: account(chargesOf.get(id) ?? [], paymentsOf.get(id) ?? [], today),
  })).filter((x) => x.student);

  // החודש
  const monthCharges = billing.charges.filter((c) => c.lesson_date >= first && c.lesson_date <= last);
  const billedLessons = monthCharges.filter((c) => c.kind === 'lesson' || c.kind === 'deposit' || c.kind === 'commitment').length;
  const billedAmount = monthCharges.reduce((n, c) => n + effectiveAmount(c), 0);
  const collected = billing.payments
    .filter((p) => p.paid_on >= first && p.paid_on <= last && p.check_status !== 'bounced')
    .reduce((n, p) => n + (p.refund ? -1 : 1) * Number(p.amount), 0);

  const debtors = accounts.filter((x) => x.a.balance < 0).sort((a, b) => a.a.balance - b.a.balance);
  const totalDebt = debtors.reduce((n, x) => n - x.a.balance, 0);
  const overdue = accounts.flatMap((x) => x.a.overdue.map((l) => ({ ...x, line: l })))
    .sort((a, b) => a.line.charge.due_date.localeCompare(b.line.charge.due_date));
  const soon = addDays(today, 14);
  const dueSoon = accounts.flatMap((x) => x.a.lines.filter((l) => l.status === 'upcoming' && l.charge.due_date <= soon)
    .map((l) => ({ ...x, line: l })));
  const deposits = accounts.filter((x) => x.a.deposits.length > 0);
  const toReturn = accounts.filter((x) => x.a.balance > 0 && x.student!.payment_track === 'fund_deposit');
  // לאומית: התחייבות על כל שיעור בלי פיקדון. להתקשר להודיע, להחזיר פיקדון למי ששילם, ולקבל התחייבויות
  const accountOf = new Map(accounts.map((x) => [x.id, x.a]));
  const leumit = all.students
    .filter((st) => st.payment_track === 'fund_commitment')
    .map((st) => {
      const a = accountOf.get(st.id);
      return { student: st, refund: Math.max(0, a?.balance ?? 0), missing: a?.commitments.length ?? 0, phone: all.primaryContact(st.id)?.phone ?? '' };
    })
    .filter((x) => x.student.status === 'active' || x.refund > 0 || x.missing > 0)
    .sort((x, y) => Number(!!x.student.commitment_notified_on) - Number(!!y.student.commitment_notified_on)
      || y.refund - x.refund || y.missing - x.missing);
  const standingDue = debtors.filter((x) => x.student!.standing_order);
  const pendingChecks = billing.payments.filter((p) => p.check_status === 'pending')
    .sort((a, b) => (a.check_date ?? '').localeCompare(b.check_date ?? ''));

  // ימים שעוד לא נסגרו (עד היום): מורה עם שיעורים קבועים באותו יום בשבוע, בלי סגירה
  const closed = new Set(closures.map((c) => `${c.teacher_id}:${c.lesson_date}`));
  const openDays: { date: string; teachers: number[] }[] = [];
  for (let d = first; d <= last && d <= today; d = addDays(d, 1)) {
    const w = weekdayOf(d);
    const teachers = [...new Set(all.timedLessons.filter((l) => l.weekday === w).map((l) => l.teacher_id))]
      .filter((t) => !closed.has(`${t}:${d}`));
    if (teachers.length) openDays.push({ date: d, teachers });
  }

  // שיעורים בימים סגורים שלא חויבו: תלמידים במסלול לא ידוע
  const unbilled = [...new Set(dayLessons
    .filter((r) => closed.has(`${r.teacher_id}:${r.lesson_date}`) && BILLABLE.includes(r.attendance))
    .map((r) => r.student_id))]
    .filter((id) => maps.student.get(id)?.payment_track === 'unknown');

  const s = billing.settings;
  const sumit = sumitConfigured();
  // תשלומים בלי קבלה (באשראי הקבלה יוצאת ב-SUMIT עצמו)
  const withReceipt = new Set(receipts.receipts.map((r) => r.payment_id));
  const receiptsOf = (paymentId: number) => receipts.receipts.filter((r) => r.payment_id === paymentId);
  const monthPayments = billing.payments.filter((p) => p.paid_on >= first && p.paid_on <= last)
    .sort((a, b) => b.paid_on.localeCompare(a.paid_on) || b.id - a.id);
  const noReceipt = billing.payments
    .filter((p) => !p.refund && !withReceipt.has(p.id) && p.method !== 'credit' && p.check_status !== 'bounced')
    .sort((a, b) => b.paid_on.localeCompare(a.paid_on));

  return (
    <>
      <PageHead title="תשלומים" sub={`${monthLabel(first)} · חיוב לפי שיעורים שהתקיימו (ימים סגורים)`}>
        <form className="inline" method="get">
          <input type="month" name="month" defaultValue={month} aria-label="חודש" />
          <button className="btn btn-xs">הצגה</button>
        </form>
        <form action={rebillMonth}>
          <input type="hidden" name="month" value={month} />
          <button className="btn" title="בודק שוב את כל הימים הסגורים בחודש ומוסיף חיובים שחסרים">חיוב מחדש של {monthLabel(first)}</button>
        </form>
      </PageHead>
      <Flash sp={sp} />
      {billing.missing && (
        <div className="flash flash-error" role="alert">צריך להריץ את 0041_lesson_billing.sql ב-Supabase. עד אז אין חיובים.</div>
      )}

      <div className="grid grid-4" style={{ marginBottom: 18 }}>
        <div className="stat"><div className="stat-num">{billedLessons}</div><div className="stat-label">שיעורים שחויבו החודש ({shekel(billedAmount)})</div></div>
        <div className="stat stat-free"><div className="stat-num">{shekel(collected)}</div><div className="stat-label">התקבל החודש (פחות החזרים)</div></div>
        <div className="stat stat-pending"><div className="stat-num">{shekel(totalDebt)}</div><div className="stat-label">חובות הורים כרגע ({debtors.length})</div></div>
        <div className="stat stat-undecided"><div className="stat-num">{overdue.length}</div><div className="stat-label">זיכוי מכבי באיחור</div></div>
      </div>

      {(openDays.length > 0 || unbilled.length > 0) && (
        <section className="card">
          <h2>לפני שגובים</h2>
          {openDays.length > 0 && (
            <>
              <details>
              <summary><strong>ימים שעוד לא נסגרו ({openDays.reduce((n, d) => n + d.teachers.length, 0)} ימי מורים):</strong> השיעורים בהם עוד לא חויבו</summary>
              <ul className="list">
                {openDays.map((d) => (
                  <li key={d.date}>
                    <Link href={`/daily?date=${d.date}`}>{DAYS[weekdayOf(d.date)]} {dmy(d.date)}</Link>
                    <span>{d.teachers.map((t) => (
                      <Link key={t} className="chip" href={`/daily?date=${d.date}#t${t}`}>{fullName(maps.teacher.get(t))}</Link>
                    ))}</span>
                  </li>
                ))}
              </ul>
              </details>
            </>
          )}
          {unbilled.length > 0 && (
            <p>
              <strong>שיעורים שלא חויבו, מסלול תשלום לא ידוע ({unbilled.length}):</strong>{' '}
              {unbilled.map((id) => {
                const st = maps.student.get(id)!;
                return (
                  <Link key={id} className="chip" href={`/students/${id}`}>
                    {fullName(st)}{st.health_fund ? ` · ${HEALTH_FUND_LABELS[st.health_fund]}` : ''}
                  </Link>
                );
              })}
              <br /><span className="muted">אחרי שקובעים מסלול בכרטיס התלמיד/ה, לוחצים על &quot;חיוב מחדש&quot; למעלה.</span>
            </p>
          )}
        </section>
      )}

      <div className="grid grid-2">
        <section className="card">
          <h2>חובות הורים ({debtors.length})</h2>
          {debtors.length === 0 ? <Empty>אין חובות</Empty> : (
            <ul className="list">
              {debtors.map(({ id, student, a }) => (
                <li key={id}>
                  <div>
                    <Link href={`/students/${id}#account`}>{fullName(student)}</Link>
                    <div className="muted">{PAYMENT_TRACK_LABELS[student!.payment_track]}</div>
                  </div>
                  <span>{student!.standing_order && <span className="chip chip-plain">הוראת קבע</span>}</span>
                  <strong>{shekel(-a.balance)}</strong>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card">
          <h2>זיכוי מכבי: באיחור ובקרוב</h2>
          <p className="muted">95 ₪ לשיעור שצריך להשלים עד {s.maccabi_later_months} חודשים מיום השיעור</p>
          {overdue.length + dueSoon.length === 0 ? <Empty>אין</Empty> : (
            <ul className="list">
              {[...overdue, ...dueSoon].map(({ id, student, line }) => (
                <li key={line.charge.id}>
                  <div>
                    <Link href={`/students/${id}#account`}>{fullName(student)}</Link>
                    <div className="muted">שיעור {dmy(line.charge.lesson_date)} · עד {dmy(line.charge.due_date)}</div>
                  </div>
                  <span className={`badge ${line.status === 'overdue' ? 'badge-review' : 'badge-muted'}`}>
                    {line.status === 'overdue' ? 'באיחור' : 'בקרוב'}
                  </span>
                  <strong>{shekel(effectiveAmount(line.charge) - line.covered)}</strong>
                </li>
              ))}
            </ul>
          )}
        </section>

        {leumit.length > 0 && (
          <section className="card">
            <h2>לאומית: התחייבות על כל שיעור, בלי פיקדון</h2>
            <p className="muted">
              מתקשרים להורים להודיע. מי ששילם פיקדון מקבל אותו בחזרה (כפתור &quot;החזר&quot; בכרטיס), ועל כל שיעור שהתקיים צריך להביא התחייבות.
              {' '}הודענו: {leumit.filter((x) => x.student.commitment_notified_on).length} מתוך {leumit.length}
              {' '}· להחזיר: {shekel(leumit.reduce((n, x) => n + x.refund, 0))}
              {' '}· התחייבויות חסרות: {leumit.reduce((n, x) => n + x.missing, 0)}
            </p>
            <ul className="list">
              {leumit.map(({ student: st, refund, missing, phone }) => (
                <li key={st.id}>
                  <div>
                    <Link href={`/students/${st.id}#account`}>{fullName(st)}</Link>
                    <div className="muted">
                      {phone && <a href={`tel:${phone}`} dir="ltr">{phone}</a>}
                      {phone && ' · '}
                      {missing ? `${missing} התחייבויות חסרות` : 'אין התחייבויות חסרות'}
                      {refund > 0 && ` · להחזיר ${shekel(refund)}`}
                    </div>
                  </div>
                  <form action={setCommitmentNotified}>
                    <input type="hidden" name="student_id" value={st.id} />
                    <input type="hidden" name="back" value={back} />
                    {st.commitment_notified_on ? (
                      <>
                        <input type="hidden" name="on" value="0" />
                        <button className="btn btn-xs btn-ghost" title="ביטול הסימון">✓ הודענו {dmy(st.commitment_notified_on)}</button>
                      </>
                    ) : <button className="btn btn-xs btn-primary">התקשרנו והודענו</button>}
                  </form>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="card">
          <h2>פיקדונות שמחכים להתחייבות ({deposits.reduce((n, x) => n + x.a.deposits.length, 0)})</h2>
          <p className="muted">כללית ומאוחדת. כשההורים מביאים התחייבות מסמנים בכרטיס התלמיד/ה, והפיקדון חוזר אליהם</p>
          {deposits.length === 0 ? <Empty>אין</Empty> : (
            <ul className="list">
              {deposits.map(({ id, student, a }) => (
                <li key={id}>
                  <div>
                    <Link href={`/students/${id}#account`}>{fullName(student)}</Link>
                    <div className="muted">
                      {student!.health_fund ? HEALTH_FUND_LABELS[student!.health_fund] : ''} · {a.deposits.length} שיעורים · מ-{dmy(a.deposits[0].lesson_date)}
                    </div>
                  </div>
                  <strong>{shekel(a.deposits.reduce((n, c) => n + Number(c.amount), 0))}</strong>
                </li>
              ))}
            </ul>
          )}
          {toReturn.length > 0 && (
            <>
              <h3>פיקדונות להחזיר להורים</h3>
              <ul className="list">
                {toReturn.map(({ id, student, a }) => (
                  <li key={id}>
                    <Link href={`/students/${id}#account`}>{fullName(student)}</Link>
                    <strong>{shekel(a.balance)}</strong>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>

        <section className="card">
          <h2>הוראות קבע לאישור</h2>
          <p className="muted">אחרי שבודקים בדף הבנק שהכסף נכנס</p>
          {standingDue.length === 0 ? <Empty>אין הוראות קבע פתוחות</Empty> : (
            <ul className="list">
              {standingDue.map(({ id, student, a }) => (
                <li key={id}>
                  <Link href={`/students/${id}#account`}>{fullName(student)}</Link>
                  <form action={addPayment}>
                    <input type="hidden" name="student_id" value={id} />
                    <input type="hidden" name="amount" value={-a.balance} />
                    <input type="hidden" name="method" value="standing_order" />
                    <input type="hidden" name="back" value={back} />
                    <button className="btn btn-xs btn-confirmed">נכנסו {shekel(-a.balance)}</button>
                  </form>
                </li>
              ))}
            </ul>
          )}

          <h2 style={{ marginTop: 18 }}>צ&apos;קים ממתינים להפקדה</h2>
          {pendingChecks.length === 0 ? <Empty>אין צ&apos;קים ממתינים</Empty> : (
            <ul className="list">
              {pendingChecks.map((p) => (
                <li key={p.id}>
                  <div>
                    <Link href={`/students/${p.student_id}#account`}>{name(p.student_id)}</Link> · {shekel(Number(p.amount))}
                    <div className="muted">צ&apos;ק {p.check_number} {p.check_bank}{p.check_date && ` · לפירעון ${dmy(p.check_date)}`}</div>
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

      <section className="card table-wrap">
        <h2>תשלומים שהתקבלו ב{monthLabel(first)} ({monthPayments.length})</h2>
        {monthPayments.length === 0 ? <Empty>לא נרשמו תשלומים בחודש הזה</Empty> : (
          <table className="day-table">
            <thead><tr><th>תאריך</th><th>תלמיד/ה</th><th>סכום</th><th>אמצעי</th><th>קבלה</th><th /></tr></thead>
            <tbody>
              {monthPayments.map((p) => {
                const rs = receiptsOf(p.id);
                return (
                  <tr key={p.id}>
                    <td className="nowrap">{dmy(p.paid_on)}</td>
                    <td><Link href={`/students/${p.student_id}#account`}>{name(p.student_id)}</Link></td>
                    <td className="nowrap">
                      <strong>{p.refund ? `החזר ${shekel(Number(p.amount))}` : shekel(Number(p.amount))}</strong>
                      {maccabiPart(p) > 0 && <div className="muted">מתוכם {shekel(maccabiPart(p))} לזיכוי מכבי</div>}
                      {p.check_status === 'bounced' && <div><span className="badge badge-review">צ&apos;ק חזר</span></div>}
                    </td>
                    <td>{PAYMENT_METHOD_LABELS[p.method]}{p.reference && <div className="muted">{p.reference}</div>}</td>
                    <td>{rs.map((r) => (r.source === 'internal' ? `אישור ${r.number}` : `קבלה ${r.number}`)).join(', ') || <span className="muted">—</span>}</td>
                    <td><DeletePaymentButton payment={p} receipts={rs} back={back} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      <section className="card">
        <div className="day-head">
          <h2>קבלות (SUMIT)</h2>
          {sumit ? (
            <form action={testSumit}><button className="btn btn-xs">בדיקת חיבור</button></form>
          ) : <span className="badge badge-muted">לא מחובר</span>}
        </div>
        {!sumit && (
          <p className="muted">
            כדי להפיק קבלות צריך להכניס את מספר החברה ואת המפתח הפרטי של SUMIT לקובץ .env.local (SUMIT_COMPANY_ID, SUMIT_API_KEY)
            ולהפעיל מחדש את המערכת. ב-Vercel מוסיפים אותם ב-Environment Variables.
          </p>
        )}
        <p className="muted">תשלומים באשראי מקבלים קבלה ישירות ב-SUMIT. כאן: מזומן, העברה, צ&apos;ק והוראת קבע שעוד אין להם קבלה. על פיקדון מפיקים אישור פנימי מהמערכת (לא ב-SUMIT, כי פיקדון חוזר להורים).</p>
        {noReceipt.length === 0 ? <Empty>לכל התשלומים יש קבלה</Empty> : (
          <ul className="list">
            {noReceipt.slice(0, 50).map((p) => (
              <li key={p.id}>
                <div>
                  <Link href={`/students/${p.student_id}#account`}>{name(p.student_id)}</Link> · {shekel(Number(p.amount))}
                  <div className="muted">{dmy(p.paid_on)} · {PAYMENT_METHOD_LABELS[p.method]}</div>
                </div>
                <div className="status-actions">
                <form action={issueInternal}>
                  <input type="hidden" name="id" value={p.id} />
                  <input type="hidden" name="back" value={back} />
                  <button className="btn btn-xs">
                    {maps.student.get(p.student_id)?.payment_track === 'fund_deposit' ? 'אישור פיקדון' : 'אישור פנימי'}
                  </button>
                </form>
                {sumit && maps.student.get(p.student_id)?.payment_track !== 'fund_deposit' && (
                  <form action={issueReceipt}>
                    <input type="hidden" name="id" value={p.id} />
                    <input type="hidden" name="back" value={back} />
                    <ConfirmButton className="btn btn-xs btn-primary" message={`להפיק ב-SUMIT קבלה על ${shekel(Number(p.amount))} ל${name(p.student_id)}?`}>
                      קבלה ב-SUMIT
                    </ConfirmButton>
                  </form>
                )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card">
        <h2>מחירון לשיעור</h2>
        <form action={saveBillingSettings}>
          <div className="form-grid">
            <label>פרטי<input name="price_private" type="number" min="0" step="any" defaultValue={s.price_private} required /></label>
            <label>מכבי: מחיר מלא מראש<input name="price_maccabi_full" type="number" min="0" step="any" defaultValue={s.price_maccabi_full} required /></label>
            <label>מכבי: חלק מראש<input name="price_maccabi_upfront" type="number" min="0" step="any" defaultValue={s.price_maccabi_upfront} required /></label>
            <label>מכבי: זיכוי מכבי (אחר כך)<input name="price_maccabi_later" type="number" min="0" step="any" defaultValue={s.price_maccabi_later} required /></label>
            <label>מכבי: חודשים להשלמת הזיכוי<input name="maccabi_later_months" type="number" min="1" max="12" defaultValue={s.maccabi_later_months} required /></label>
            <label>כללית / מאוחדת / לאומית: פיקדון<input name="price_fund_deposit" type="number" min="0" step="any" defaultValue={s.price_fund_deposit} required /></label>
            <label>שיעור ניסיון (לא ממשיכים)<input name="price_trial" type="number" min="0" step="any" defaultValue={s.price_trial ?? 55} required /></label>
          </div>
          <p className="muted">שינוי מחיר חל על שיעורים שייסגרו מעכשיו. שיעורים שכבר חויבו נשארים במחיר שלהם.</p>
          <div className="form-foot"><button className="btn btn-primary">שמירת מחירון</button></div>
        </form>
      </section>
    </>
  );
}

