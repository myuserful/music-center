import Link from 'next/link';
import { ConfirmButton } from '@/components/ConfirmButton';
import { Empty, Flash, one, PageHead, type SP } from '@/components/ui';
import { addTeacherExtra, approvePayroll, attachPayrollProof, cancelPayroll, deleteTeacherExtra } from '@/lib/actions/payroll';
import { monthLabel, shekel } from '@/lib/billing';
import { LESSON_MINUTES, TX_METHOD_LABELS, TX_METHODS } from '@/lib/constants';
import { addDays, dmy, hoursLabel } from '@/lib/day';
import { loadTables } from '@/lib/data';
import { monthsMissingReceipt } from '@/lib/payroll';
import { monthPayroll } from '@/lib/payrollMonth';
import { autoLockOverdue } from '@/lib/dayLock';
import { RECEIPT_ACCEPT } from '@/lib/receiptFile';
import { createClient } from '@/lib/supabase/server';
import { bankLabel, fullName } from '@/lib/types';

/** שכר מורים לחודש: לפי השעות שלימדו בפועל (ימים סגורים), תוספות, השלמה למינימום שבועי ובונוסים */
export default async function PayrollPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' });
  const monthParam = one(sp.month);
  const month = /^\d{4}-\d{2}$/.test(monthParam) ? monthParam : today.slice(0, 7);
  const back = `/payroll?month=${month}`;
  const db = await createClient();
  // ימים שלא נסגרו ביד נסגרים 24 שעות אחרי שנגמרו (לפני שמחשבים)
  await autoLockOverdue(db);
  const [all, allPaid] = await Promise.all([
    loadTables(db, 'teachers'),
    db.from('teacher_payroll').select('month, transaction_id, transactions(receipt_path)'),
  ]);
  const otherMonths = monthsMissingReceipt((allPaid.data ?? []) as unknown as Parameters<typeof monthsMissingReceipt>[0], month);
  const { range, missing, rows, left } = await monthPayroll(db, all.teachers, month, today);
  const openCount = rows.reduce((n, r) => n + r.p.openDays.length, 0);
  const noReceipt = rows.filter((r) => r.paid?.transaction_id && !r.paid.transactions?.receipt_path).length;

  return (
    <>
      <PageHead title="שכר מורים" sub={`${monthLabel(`${month}-01`)} · לפי שעות שלימדו בפועל (ימים סגורים)`}>
        <form className="inline" method="get">
          <input type="month" name="month" defaultValue={month} aria-label="חודש" />
          <button className="btn btn-xs">הצגה</button>
        </form>
      </PageHead>
      <Flash sp={sp} />
      {missing && <div className="flash flash-error">צריך להריץ את 0046_teacher_pay.sql ב-Supabase (תוספות, מינימום ואישור תשלום)</div>}

      <div className="grid grid-4" style={{ marginBottom: 18 }}>
        <div className="stat"><div className="stat-num">{shekel(left.total)}</div><div className="stat-label">סה&quot;כ שכר החודש</div></div>
        <div className={`stat ${left.remaining ? 'stat-pending' : ''}`}>
          <div className="stat-num">{shekel(left.remaining)}</div>
          <div className="stat-label">
            נותר לשלם החודש ({left.unpaid} מורים)
            {left.noRate > 0 && <div className="muted">לא כולל {left.noRate} מורים בלי תעריף לשעה</div>}
            {left.gap > 0 && <div className="muted">ועוד {shekel(left.gap)} הפרש אצל מי ששולם</div>}
          </div>
        </div>
        <div className="stat stat-free"><div className="stat-num">{rows.filter((r) => r.paid).length} / {rows.length}</div><div className="stat-label">מורים ששולמו</div></div>
        <div className={`stat ${openCount ? 'stat-pending' : ''}`}><div className="stat-num">{openCount}</div><div className="stat-label">ימים שעוד לא נסגרו (לא נספרו)</div></div>
        <div className={`stat ${noReceipt ? 'stat-pending' : ''}`}><div className="stat-num">{noReceipt}</div><div className="stat-label">תשלומים בלי קבלה</div></div>
      </div>
      {otherMonths.length > 0 && (
        <div className="flash flash-error" role="alert">
          חסרות קבלות על שכר ששולם:{' '}
          {otherMonths.map((m) => (
            <Link key={m.month} className="chip" href={`/payroll?month=${m.month}`}>{monthLabel(`${m.month}-01`)} ({m.count})</Link>
          ))}
        </div>
      )}
      <p className="muted">
        נספר: שיעור שהתלמיד/ה הגיע/ה אליו או לא הגיע/ה בלי הודעה, וביטול מראש באמצע היום ({LESSON_MINUTES} דק&apos; לשיעור).
        אפשר לשנות לכל שיעור בסגירת יום (&quot;למורה&quot;). מילוי מקום נספר למי שלימד/ה. מינימום שבועי: רק בשבוע שהסתיים ויש בו פעילות לפי הלוח.
      </p>

      <section className="card table-wrap">
        {rows.length === 0 ? <Empty>אין שעות בחודש הזה</Empty> : (
          <table className="day-table">
            <thead>
              <tr><th>מורה</th><th>שיעורים</th><th>מילוי מקום</th><th>תוספות</th><th>השלמה למינימום</th><th>בונוסים</th><th>לשעה</th><th>סה&quot;כ</th><th>תשלום</th></tr>
            </thead>
            <tbody>
              {rows.map(({ t, p, paid }) => (
                <tr key={t.id}>
                  <td>
                    <a href={`#pay-${t.id}`}><strong>{fullName(t)}</strong></a>
                    {p.openDays.length > 0 && <div><span className="badge badge-pending">{p.openDays.length} ימים לא נסגרו</span></div>}
                    <div className="muted pay-bank">
                      {bankLabel(t) || <Link href={`/teachers/${t.id}`}>חסרים פרטי בנק</Link>}
                    </div>
                  </td>
                  <td className="nowrap">{hoursLabel(p.ownMinutes)}</td>
                  <td className="nowrap">{p.subMinutes ? hoursLabel(p.subMinutes) : '—'}</td>
                  <td className="nowrap">{p.extraMinutes ? hoursLabel(p.extraMinutes) : '—'}</td>
                  <td className="nowrap">{p.topupMinutes ? hoursLabel(p.topupMinutes) : t.min_weekly_hours ? '—' : <span className="muted">אין מינימום</span>}</td>
                  <td className="nowrap">{p.bonus ? shekel(p.bonus) : '—'}</td>
                  <td className="nowrap">{t.hourly_rate == null ? <Link href={`/teachers/${t.id}`} className="muted">לא הוגדר</Link> : shekel(Number(t.hourly_rate))}</td>
                  <td className="nowrap"><strong>{shekel(p.amount)}</strong><div className="muted">{hoursLabel(p.totalMinutes)} שעות</div></td>
                  <td>
                    {paid ? (
                      <div>
                        <span className="badge badge-confirmed">שולם {shekel(Number(paid.amount))} · {dmy(paid.paid_on)}</span>
                        {p.amount != null && Math.round(p.amount) !== Math.round(Number(paid.amount)) && (
                          <div className="muted">החישוב היום: {shekel(p.amount)}</div>
                        )}
                        {paid.transactions?.reference && <div className="muted">אסמכתא: {paid.transactions.reference}</div>}
                        {paid.transactions?.receipt_path && paid.transaction_id ? (
                          <div><a className="fin-clip" href={`/finance/${paid.transaction_id}/receipt`} target="_blank" rel="noopener" title={paid.transactions.receipt_name}>📎 קבלה</a></div>
                        ) : <div><span className="badge badge-pending">חסרה קבלה</span></div>}
                        {paid.transactions?.proof_path && paid.transaction_id && (
                          <div><a className="fin-clip" href={`/finance/${paid.transaction_id}/receipt?file=proof`} target="_blank" rel="noopener" title={paid.transactions.proof_name}>📎 אסמכתא</a></div>
                        )}
                        <details className="pay-attach" open={!paid.transactions?.receipt_path}>
                          <summary>{paid.transactions?.receipt_path ? 'החלפה או צירוף של קבלה ואסמכתא' : 'צירוף קבלה ואסמכתא'}</summary>
                          <form action={attachPayrollProof} className="pay-proof">
                            <input type="hidden" name="teacher_id" value={t.id} />
                            <input type="hidden" name="month" value={month} />
                            <input type="hidden" name="back" value={back} />
                            <input name="reference" defaultValue={paid.transactions?.reference ?? ''} placeholder="מספר אסמכתא" aria-label="מספר אסמכתא" />
                            <label className="muted">קבלה<input type="file" name="receipt" accept={RECEIPT_ACCEPT} /></label>
                            <label className="muted">אסמכתא<input type="file" name="proof" accept={RECEIPT_ACCEPT} /></label>
                            <button className="btn btn-xs">שמירה</button>
                          </form>
                        </details>
                        <form action={cancelPayroll}>
                          <input type="hidden" name="teacher_id" value={t.id} />
                          <input type="hidden" name="month" value={month} />
                          <input type="hidden" name="back" value={back} />
                          <ConfirmButton className="btn btn-xs btn-ghost" message="לבטל את אישור השכר? גם ההוצאה ב'הכנסות והוצאות' תימחק">ביטול</ConfirmButton>
                        </form>
                      </div>
                    ) : (
                      <form action={approvePayroll}>
                        <input type="hidden" name="teacher_id" value={t.id} />
                        <input type="hidden" name="month" value={month} />
                        <input type="hidden" name="minutes" value={p.totalMinutes} />
                        <input type="hidden" name="back" value={back} />
                        <div className="fin-salary">
                          <input type="number" name="amount" min="1" step="any" defaultValue={p.amount ?? ''} aria-label="סכום" required />
                          <select name="method" defaultValue="bank_transfer" aria-label="אמצעי">
                            {TX_METHODS.map((m) => <option key={m} value={m}>{TX_METHOD_LABELS[m]}</option>)}
                          </select>
                          <ConfirmButton
                            className="btn btn-xs btn-primary"
                            message={`לאשר ולרשום תשלום שכר ל${fullName(t)}?${p.openDays.length ? ` שימו לב: ${p.openDays.length} ימים עוד לא נסגרו ולא נספרו` : ''}`}
                          >
                            אישור ותשלום
                          </ConfirmButton>
                        </div>
                        <div className="pay-proof">
                          <input name="reference" placeholder="מספר אסמכתא" aria-label="מספר אסמכתא" />
                          <label className="muted">קבלה (אפשר גם אחרי התשלום)<input type="file" name="receipt" accept={RECEIPT_ACCEPT} /></label>
                          <label className="muted">אסמכתא<input type="file" name="proof" accept={RECEIPT_ACCEPT} /></label>
                        </div>
                      </form>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {rows.map(({ t, p }) => (
        <section key={t.id} id={`pay-${t.id}`} className="card">
          <details>
            <summary><strong>{fullName(t)}</strong> · פירוט, תוספות ובונוסים</summary>

            {p.openDays.length > 0 && (
              <p>
                <strong>ימים שלא נסגרו:</strong>{' '}
                {p.openDays.map((d) => <Link key={d} className="chip" href={`/daily?date=${d}`}>{dmy(d)}</Link>)}
              </p>
            )}

            <h3>לפי שבועות</h3>
            <table className="day-table">
              <thead><tr><th>שבוע</th><th>שעות</th><th>השלמה למינימום</th></tr></thead>
              <tbody>
                {p.weeks.map((w) => (
                  <tr key={w.start}>
                    <td className="nowrap">{dmy(w.start)} - {dmy(addDays(w.start, 6))}</td>
                    <td>{hoursLabel(w.minutes)}</td>
                    <td>
                      {w.status === 'no_activity' ? <span className="muted">אין פעילות לפי הלוח</span>
                        : w.status === 'not_ended' ? <span className="muted">השבוע עוד לא הסתיים</span>
                        : w.topup ? <strong>{hoursLabel(w.topup)}</strong> : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <h3>תוספות ובונוסים</h3>
            {p.extras.length === 0 ? <Empty>אין תוספות החודש</Empty> : (
              <ul className="list">
                {p.extras.map((e) => (
                  <li key={e.id}>
                    <div>
                      <strong>{e.minutes ? `${hoursLabel(e.minutes)} שעות` : shekel(Number(e.amount))}</strong> · {e.reason}
                      <div className="muted">{dmy(e.extra_date)}</div>
                    </div>
                    <form action={deleteTeacherExtra}>
                      <input type="hidden" name="id" value={e.id} />
                      <input type="hidden" name="back" value={`${back}#pay-${t.id}`} />
                      <ConfirmButton className="btn btn-xs btn-ghost" message="למחוק את התוספת?">✕</ConfirmButton>
                    </form>
                  </li>
                ))}
              </ul>
            )}
            <form action={addTeacherExtra} className="row-form" style={{ marginTop: 10 }}>
              <input type="hidden" name="teacher_id" value={t.id} />
              <input type="hidden" name="back" value={`${back}#pay-${t.id}`} />
              <label>
                סוג
                <select name="type" defaultValue="amount">
                  <option value="amount">סכום (₪) - למשל בונוס</option>
                  <option value="minutes">זמן (דקות)</option>
                </select>
              </label>
              <label>כמות<input name="value" type="number" min="1" step="any" required style={{ width: 90 }} /></label>
              <label>תאריך<input name="extra_date" type="date" defaultValue={today.startsWith(month) ? today : range.first} required /></label>
              <label>סיבה<input name="reason" placeholder="למשל: הביא/ה מורה חדש/ה" required /></label>
              <button className="btn btn-xs">+ הוספה</button>
            </form>
          </details>
        </section>
      ))}
    </>
  );
}
