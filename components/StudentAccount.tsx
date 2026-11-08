import { ConfirmButton } from '@/components/ConfirmButton';
import { DeletePaymentButton } from '@/components/DeletePaymentButton';
import { PaymentFields } from '@/components/PaymentFields';
import { Empty } from '@/components/ui';
import {
  addCharge, addLessonCharge, addManualReceipt, addPayment, deleteCharge, deleteReceipt, issueInternal, issueReceipt, markCommitment, stopAfterTrial,
  undoCommitment,
} from '@/lib/actions/payments';
import {
  account, chargesForLesson, maccabiPart, monthLabel, monthRequest, paymentCoverage, shekel, SIBLING_CYCLE, SIBLING_DEFAULT_AMOUNT, SIBLING_TRACKS, siblingCounted,
  type ChargeStatus,
} from '@/lib/billing';
import { CHARGE_KIND_LABELS, CHECK_STATUS_LABELS, PAYMENT_METHOD_LABELS, PAYMENT_TRACK_LABELS } from '@/lib/constants';
import { dmy } from '@/lib/day';
import { fullName, type BillingSettings, type Charge, type Payment, type Receipt, type Student, type Teacher } from '@/lib/types';

const STATUS_LABELS: Record<ChargeStatus, string> = {
  paid: 'שולם', partial: 'שולם חלקית', unpaid: 'לא שולם', overdue: 'באיחור', upcoming: 'עתידי', returned: 'הביאו התחייבות',
  no_commitment: 'חסרה התחייבות',
};
const STATUS_CLASS: Record<ChargeStatus, string> = {
  paid: 'badge-confirmed', partial: 'badge-pending', unpaid: 'badge-pending', overdue: 'badge-review',
  upcoming: 'badge-muted', returned: 'badge-undecided', no_commitment: 'badge-pending',
};

/** ממה מורכב הסכום לבקשה: השיעורים שנשארו בחודש, ועוד החוב (או פחות הזכות) */
function requestParts(r: NonNullable<ReturnType<typeof monthRequest>>, balance: number) {
  return [
    r.lessons ? `${r.lessons} שיעורים × ${shekel(r.price)}` : 'אין עוד שיעורים החודש',
    r.free ? `ועוד ${r.free} חינם בזוג` : '',
    r.discount ? `− הנחת אחים ${shekel(r.discount)}` : '',
    balance < 0 ? `+ חוב ${shekel(-balance)}` : balance > 0 ? `− זכות ${shekel(balance)}` : '',
  ].filter(Boolean).join(' · ');
}

/** החשבון של תלמיד/ה: יתרה, כמה לבקש החודש, תשלומים, פיקדונות וחיובים */
export function StudentAccount({
  student, charges, payments, receipts, settings, weekdays, pair, today, missing, sumit, hasEmail, teachers, defaultTeacherId,
}: {
  student: Student; charges: Charge[]; payments: Payment[]; receipts: Receipt[]; settings: BillingSettings;
  /** לחיוב שיעור נוסף: המורים, וברירת המחדל - המורה הקבוע/ה של התלמיד/ה */
  teachers: Teacher[]; defaultTeacherId: number | null;
  /** יש מפתחות SUMIT: אפשר להפיק קבלות */
  sumit: boolean;
  /** יש מייל לאחד מאנשי הקשר (לשליחת הקבלה) */
  hasEmail: boolean;
  /** ימי השבוע של השיעורים הקבועים (שיבוץ סופי) */
  weekdays: number[]; today: string; missing: boolean;
  /** שיעורים בזוג: ימי השבוע שלהם, וכמה כבר חויבו */
  pair?: { weekdays: number[]; done: number };
}) {
  const here = `/students/${student.id}#account`;
  const a = account(charges, payments, today);
  const month = today.slice(0, 7);
  // שיעורים שכבר חויבו (למשל יום שנסגר היום) לא נספרים שוב בתשלום מראש
  // (שיעור נוסף שחויב ביד - בלי מורה - לא תופס את מקומו של שיעור קבוע)
  const charged = charges.filter((c) => c.kind !== 'manual' && c.teacher_id !== null).map((c) => c.lesson_date);
  /** מה יחויב על שיעור נוסף לפי המסלול: "55 ₪ עכשיו + 95 ₪ זיכוי מכבי עתידי" */
  const lessonPlan = chargesForLesson(student.payment_track, today, settings)?.map((p) =>
    p.kind === 'maccabi_later' ? `${shekel(p.amount)} זיכוי מכבי עתידי (עד ${settings.maccabi_later_months} חודשים)`
      : p.kind === 'deposit' ? `פיקדון ${shekel(p.amount)}`
      : p.kind === 'commitment' ? 'התחייבות (בלי תשלום)'
      : `${shekel(p.amount)} עכשיו`).join(' + ');
  const siblingAmount = Number(student.sibling_discount_amount ?? SIBLING_DEFAULT_AMOUNT);
  const siblingOn = !!student.sibling_discount && SIBLING_TRACKS.includes(student.payment_track);
  const siblingDone = siblingCounted(charges, student.sibling_discount_from).length;
  const request = monthRequest(weekdays, month, today, student.payment_track, settings, a.balance, charged, pair,
    siblingOn ? { amount: siblingAmount, done: siblingDone } : undefined);
  const perLesson = student.payment_track === 'fund_deposit';
  const commitmentTrack = student.payment_track === 'fund_commitment';
  const suggested = request?.total || Math.max(0, -a.balance);
  const maccabi = student.payment_track === 'maccabi_split' || charges.some((c) => c.kind === 'maccabi_later');
  const receiptsOf = (paymentId: number) => receipts.filter((r) => r.payment_id === paymentId);
  const paymentById = new Map(payments.map((p) => [p.id, p]));
  /** הקבלות שכיסו חיוב: של התשלומים ששילמו אותו, מהסוג המתאים (במכבי ההשלמה מקבלת קבלה משלה) */
  const chargeReceipts = (c: Charge, paidBy: { paymentId: number | null }[]) => {
    const kind = c.kind === 'maccabi_later' || c.kind === 'deposit' ? c.kind : 'lesson';
    const rs = paidBy.flatMap((x) => (x.paymentId ? receiptsOf(x.paymentId) : []));
    const matching = rs.filter((r) => r.kind === kind);
    return [...new Map((matching.length ? matching : rs).map((r) => [r.id, r])).values()];
  };

  return (
    <section id="account" className="card">
      <div className="day-head">
        <h2>חשבון ותשלומים</h2>
        <span className="chip chip-plain">{PAYMENT_TRACK_LABELS[student.payment_track]}</span>
      </div>
      {missing && <div className="flash flash-error">צריך להריץ את 0041_lesson_billing.sql ב-Supabase כדי לראות חיובים</div>}
      {student.sibling_discount && (
        <p className="muted">
          <strong>הנחת אחים:</strong> {shekel(siblingAmount)} לכל {SIBLING_CYCLE} שיעורים
          {siblingOn
            ? ` · עוד ${SIBLING_CYCLE - (siblingDone % SIBLING_CYCLE)} שיעורים להנחה הבאה`
            : ` · לא חלה על המסלול ${PAYMENT_TRACK_LABELS[student.payment_track] ?? student.payment_track}`}
        </p>
      )}

      <div className="grid grid-4" style={{ marginBottom: 12 }}>
        <div className={`stat ${a.balance < 0 ? 'stat-pending' : 'stat-free'}`}>
          <div className="stat-num">{shekel(Math.abs(a.balance))}</div>
          <div className="stat-label">{a.balance < 0 ? 'חוב' : a.balance > 0 ? 'זכות (יתרה לשיעורים הבאים)' : 'יתרה'}</div>
        </div>
        <div className="stat">
          <div className="stat-num">{request ? shekel(request.total) : perLesson || commitmentTrack ? shekel(Math.max(0, -a.balance)) : '—'}</div>
          <div className="stat-label">
            {request ? `לתשלום עד סוף ${monthLabel(`${month}-01`)} (${requestParts(request, a.balance)})`
              : perLesson ? `לתשלום עכשיו (פיקדון ${shekel(Number(settings.price_fund_deposit))} על כל שיעור, לא מראש)`
              : commitmentTrack ? 'לתשלום עכשיו (בלי פיקדון: על כל שיעור מביאים התחייבות)'
              : 'מסלול לא ידוע: אי אפשר לחשב'}
          </div>
        </div>
        {(student.payment_track === 'maccabi_split' || a.upcoming > 0 || a.overdueAmount > 0) && (
          <div className={`stat ${a.overdueAmount > 0 ? 'stat-pending' : ''}`}>
            <div className="stat-num">{shekel(a.upcoming + a.overdueAmount)}</div>
            <div className="stat-label">
              חוב זיכוי מכבי{a.overdueAmount > 0 && ` · ${shekel(a.overdueAmount)} באיחור`}
              {a.maccabiCredit > 0 && ` · שולם מראש ${shekel(a.maccabiCredit)}`}
            </div>
          </div>
        )}
        {(student.payment_track === 'fund_deposit' || a.deposits.length > 0) && (
          <div className="stat stat-undecided">
            <div className="stat-num">{a.deposits.length}</div>
            <div className="stat-label">פיקדונות שמחכים להתחייבות ({shekel(a.deposits.reduce((n, c) => n + Number(c.amount), 0))})</div>
          </div>
        )}
        {(commitmentTrack || a.commitments.length > 0) && (
          <div className={`stat ${a.commitments.length > 0 ? 'stat-pending' : 'stat-free'}`}>
            <div className="stat-num">{a.commitments.length}</div>
            <div className="stat-label">
              התחייבויות חסרות (שיעור אחד = התחייבות אחת)
              {commitmentTrack && (student.commitment_notified_on ? ` · הודענו להורים ב-${dmy(student.commitment_notified_on)}` : ' · עוד לא הודענו להורים')}
            </div>
          </div>
        )}
      </div>

      {a.maccabiOpen.length > 0 && (
        <p className="muted">
          <strong>זיכוי מכבי שעוד לא שולם:</strong>{' '}
          {a.maccabiOpen.map((l) => (
            <span key={l.charge.id} className={`chip ${l.status === 'overdue' ? 'chip-sub' : 'chip-plain'}`}>
              שיעור {dmy(l.charge.lesson_date)} · {shekel(Number(l.charge.amount) - l.covered)} · {l.status === 'overdue' ? 'באיחור' : `עד ${dmy(l.charge.due_date)}`}
            </span>
          ))}
        </p>
      )}

      <form action={addPayment} className="row-form">
        <input type="hidden" name="student_id" value={student.id} />
        <input type="hidden" name="back" value={here} />
        <PaymentFields amount={suggested} defaultMethod={student.standing_order ? 'standing_order' : 'cash'} />
        {maccabi && (
          <label title="החלק מהתשלום שמכסה את זיכוי מכבי (95 ₪ לשיעור). השאר הולך לשיעורים הרגילים">
            מתוכם לזיכוי מכבי
            <input name="maccabi_amount" type="number" min="0" step="any" defaultValue="0" />
          </label>
        )}
        <label title="באשראי הקבלה יוצאת ב-SUMIT עצמו">
          קבלה
          <select name="receipt" defaultValue={student.payment_track === 'fund_deposit' || !sumit ? 'internal' : 'sumit'}>
            {sumit && <option value="sumit">קבלה ב-SUMIT</option>}
            <option value="internal">{student.payment_track === 'fund_deposit' ? 'אישור קבלת פיקדון (מהמערכת)' : 'אישור פנימי (מהמערכת)'}</option>
            <option value="">בלי</option>
          </select>
        </label>
        {sumit && hasEmail && <label className="check"><input type="checkbox" name="email" value="1" defaultChecked /> שליחה במייל (SUMIT)</label>}
        <button className="btn btn-xs btn-primary">+ רישום תשלום</button>
      </form>
      {a.balance > 0 && (
        <form action={addPayment} className="row-form" style={{ marginTop: 8 }}>
          <input type="hidden" name="student_id" value={student.id} />
          <input type="hidden" name="back" value={here} />
          <input type="hidden" name="refund" value="1" />
          <label>החזר להורים<input name="amount" type="number" min="1" step="any" defaultValue={a.balance} required /></label>
          <label>
            איך הוחזר
            <select name="method" defaultValue="cash">
              {(['cash', 'transfer', 'credit'] as const).map((m) => <option key={m} value={m}>{PAYMENT_METHOD_LABELS[m]}</option>)}
            </select>
          </label>
          <ConfirmButton className="btn btn-xs" message="לרשום החזר להורים? הסכום יורד מהזכות">החזר</ConfirmButton>
        </form>
      )}

      {a.commitments.length > 0 && (
        <form action={markCommitment} className="deposit-box">
          <input type="hidden" name="back" value={here} />
          <h3>שיעורים שחסרה עליהם התחייבות</h3>
          <p className="muted">
            בלאומית לא משלמים פיקדון: על כל שיעור שהתקיים צריך להביא התחייבות. מסמנים את השיעורים שההורים הביאו עליהם התחייבות.
            {a.balance > 0 && ` יש להורים זכות של ${shekel(a.balance)} (פיקדון ששילמו): מחזירים בכפתור "החזר".`}
          </p>
          <div className="checks">
            {a.commitments.map((c) => (
              <label key={c.id} className="check">
                <input type="checkbox" name="id" value={c.id} defaultChecked /> {dmy(c.lesson_date)}
              </label>
            ))}
          </div>
          <div className="row-form">
            <label>מספר התחייבות<input name="commitment_ref" dir="ltr" /></label>
            <label>תאריך<input name="commitment_on" type="date" defaultValue={today} /></label>
            <button className="btn btn-xs btn-primary">התקבלה התחייבות</button>
          </div>
        </form>
      )}

      {a.deposits.length > 0 && (
        <form action={markCommitment} className="deposit-box">
          <input type="hidden" name="back" value={here} />
          <h3>פיקדונות שמחכים להתחייבות</h3>
          <p className="muted">מסמנים את השיעורים שההורים הביאו עליהם התחייבות. הפיקדון עובר לזכות ההורים, ואפשר להחזיר אותו בכפתור &quot;החזר&quot;.</p>
          <div className="checks">
            {a.deposits.map((c) => (
              <label key={c.id} className="check">
                <input type="checkbox" name="id" value={c.id} defaultChecked /> {dmy(c.lesson_date)} · {shekel(Number(c.amount))}
              </label>
            ))}
          </div>
          <div className="row-form">
            <label>מספר התחייבות<input name="commitment_ref" dir="ltr" /></label>
            <label>תאריך<input name="commitment_on" type="date" defaultValue={today} /></label>
            <button className="btn btn-xs btn-primary">התקבלה התחייבות</button>
          </div>
        </form>
      )}

      <div className="account-cols">
        <div>
          <h3>חיובים</h3>
          {a.lines.length === 0 ? <Empty>אין חיובים. חיובים נוצרים כשסוגרים יום</Empty> : (
            <div className="table-wrap">
              <table className="day-table">
                <thead><tr><th>תאריך</th><th>מה</th><th>סכום</th><th>מצב</th><th>קבלה</th><th /></tr></thead>
                <tbody>
                  {a.lines.map(({ charge: c, status, paidBy }) => (
                    <tr key={c.id} id={`charge-${c.id}`}>
                      <td className="nowrap">
                        {dmy(c.lesson_date)}
                        {c.due_date !== c.lesson_date && <div className="muted">עד {dmy(c.due_date)}</div>}
                      </td>
                      <td>
                        {c.description || CHARGE_KIND_LABELS[c.kind]}
                        {c.kind !== 'lesson' && c.kind !== 'manual' && c.kind !== 'sibling_discount' && <div className="muted">{CHARGE_KIND_LABELS[c.kind]}</div>}
                        {c.commitment_ref && <div className="muted" dir="ltr">{c.commitment_ref}</div>}
                      </td>
                      <td className="nowrap">{shekel(Number(c.amount))}</td>
                      <td>
                        <span className={`badge ${STATUS_CLASS[status]}`}>{STATUS_LABELS[status]}</span>
                        {/* הקשר לתשלום: מאיזה תשלום (ובכמה) החיוב שולם */}
                        {paidBy.map((x, i) => {
                          const pay = x.paymentId ? paymentById.get(x.paymentId) : undefined;
                          return pay ? (
                            <a key={i} className="link-chip" href={`#pay-${pay.id}`}>
                              מתשלום {dmy(pay.paid_on)}{paidBy.length > 1 || x.amount < Number(c.amount) ? ` · ${shekel(x.amount)}` : ''}
                            </a>
                          ) : <span key={i} className="link-chip">מהנחה · {shekel(x.amount)}</span>;
                        })}
                      </td>
                      <td>{chargeReceipts(c, paidBy).map((r) => <ReceiptChip key={r.id} r={r} />)}</td>
                      <td>
                        {!c.commitment_on && (
                          <form action={deleteCharge}>
                            <input type="hidden" name="id" value={c.id} />
                            <input type="hidden" name="back" value={here} />
                            <ConfirmButton className="btn btn-xs btn-ghost" message={deleteChargeMessage(c, paidBy)}>✕</ConfirmButton>
                          </form>
                        )}
                        {(c.kind === 'deposit' || c.kind === 'commitment') && c.commitment_on && (
                          <form action={undoCommitment}>
                            <input type="hidden" name="id" value={c.id} />
                            <input type="hidden" name="back" value={here} />
                            <ConfirmButton className="btn btn-xs btn-ghost" message={c.kind === 'deposit' ? 'לבטל את ההתחייבות? הפיקדון יחזור להיות חיוב' : 'לבטל את ההתחייבות? השיעור יחזור להיות "חסרה התחייבות"'}>ביטול</ConfirmButton>
                          </form>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <form action={addCharge} className="row-form" style={{ marginTop: 8 }}>
            <input type="hidden" name="student_id" value={student.id} />
            <input type="hidden" name="back" value={here} />
            <label>חיוב / הנחה ידני<input name="description" placeholder="דמי רישום, הנחת אחים..." required /></label>
            <label>סכום<input name="amount" type="number" step="any" placeholder="הנחה: מספר שלילי" required /></label>
            <button className="btn btn-xs">+ הוספה</button>
          </form>
          <form action={addLessonCharge} className="row-form" style={{ marginTop: 8 }}>
            <input type="hidden" name="student_id" value={student.id} />
            <input type="hidden" name="back" value={here} />
            <label>
              חיוב שיעור
              <select name="teacher_id" defaultValue={defaultTeacherId ?? ''} required>
                {!defaultTeacherId && <option value="">בחירת מורה...</option>}
                {teachers.map((t) => <option key={t.id} value={t.id}>{fullName(t)}</option>)}
              </select>
            </label>
            <label title="לא חובה. בלי תאריך החיוב נרשם להיום">מתי (לא חובה)<input name="date" type="date" /></label>
            <label className="check"><input type="checkbox" name="pay_teacher" value="1" defaultChecked /> לשלם למורה</label>
            <button className="btn btn-xs" disabled={!lessonPlan}>+ שיעור</button>
          </form>
          <p className="muted">
            {lessonPlan
              ? `לפי ${PAYMENT_TRACK_LABELS[student.payment_track]}: ${lessonPlan}`
              : 'אין מסלול תשלום עם מחיר: קודם בוחרים מסלול'}
          </p>
        </div>

        <div>
          <h3>תשלומים</h3>
          {payments.length === 0 ? <Empty>עדיין לא התקבלו תשלומים</Empty> : (
            <ul className="list">
              {payments.map((p) => (
                <li key={p.id} id={`pay-${p.id}`}>
                  <div>
                    <strong>{p.refund ? `החזר ${shekel(Number(p.amount))}` : shekel(Number(p.amount))}</strong> · {PAYMENT_METHOD_LABELS[p.method]}
                    {!p.refund && <div>{paymentFor(p)}</div>}
                    {!p.refund && p.check_status !== 'bounced' && <Coverage cov={paymentCoverage(a.lines, p)} />}
                    <div className="muted">
                      {dmy(p.paid_on)}
                      {p.method === 'check' && ` · צ'ק ${p.check_number}${p.check_date ? ` לתאריך ${dmy(p.check_date)}` : ''}`}
                      {p.reference && ` · ${p.reference}`}
                    </div>
                  </div>
                  {p.check_status && <span className="chip chip-plain">{CHECK_STATUS_LABELS[p.check_status]}</span>}
                  {!p.refund && <ReceiptCell payment={p} receipts={receiptsOf(p.id)} sumit={sumit} hasEmail={hasEmail} back={here} />}
                  <DeletePaymentButton payment={p} receipts={receiptsOf(p.id)} back={here} />
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {student.payment_track !== 'trial' && (
        <details className="trial-box">
          <summary>לא ממשיכים אחרי שיעור ניסיון</summary>
          <form action={stopAfterTrial}>
            <input type="hidden" name="student_id" value={student.id} />
            <input type="hidden" name="back" value={here} />
            <p className="muted">
              למשל ילד/ה קטן/ה שלא יכול/ה ללמוד עדיין, ואנחנו מסכימים שלא ימשיכו. השיעורים שכבר חויבו יחויבו מחדש
              ב-{shekel(Number(settings.price_trial ?? 55))} לשיעור בלבד (במקום המחיר הרגיל / מכבי / פיקדון), והתלמיד/ה יסומן/תסומן כלא פעיל/ה.
            </p>
            <label className="check"><input type="checkbox" name="release" value="1" defaultChecked /> גם להסיר את השיבוץ הקבוע (לפנות את המקום אצל המורה)</label>
            <div className="form-foot">
              <ConfirmButton className="btn btn-danger" message={`${student.first_name} לא ממשיך/ה אחרי שיעור ניסיון? החיוב יהיה ${shekel(Number(settings.price_trial ?? 55))} לשיעור בלבד`}>
                לא ממשיכים: חיוב שיעור ניסיון בלבד
              </ConfirmButton>
            </div>
          </form>
        </details>
      )}
    </section>
  );
}

function ReceiptChip({ r }: { r: Receipt }) {
  const label = r.source === 'internal'
    ? `אישור ${r.number}${r.kind === 'deposit' ? ' (פיקדון)' : ''}`
    : `קבלה ${r.number}${r.kind === 'maccabi_later' ? ' (השלמה)' : ''}`;
  const href = r.source === 'internal' ? `/receipts/${r.id}` : r.url;
  return href
    ? <a className="chip chip-plain" href={href} target="_blank" rel="noreferrer" title={r.description}>{label}</a>
    : <span className="chip chip-plain" title={r.description}>{label}</span>;
}

/** מה קורה כשמוחקים חיוב: חיוב ששולם - הכסף עובר לזכות, חיוב של שיעור - לא נוצר שוב */
function deleteChargeMessage(c: Charge, paidBy: { paymentId: number | null; amount: number }[]) {
  const paid = paidBy.reduce((n, x) => n + (x.paymentId ? x.amount : 0), 0);
  return [
    'למחוק את החיוב?',
    paid > 0 && `הוא שולם: ${shekel(paid)} יעברו לזכות ההורים, והקבלה לא משתנה.`,
    c.kind !== 'manual' && 'החיוב לא ייווצר שוב גם אם מחייבים מחדש את היום.',
  ].filter(Boolean).join(' ');
}

/** הקבלות של תשלום, או הפקה ב-SUMIT / הקלדת מספר ביד */
function ReceiptCell({ payment: p, receipts, sumit, hasEmail, back }: {
  payment: Payment; receipts: Receipt[]; sumit: boolean; hasEmail: boolean; back: string;
}) {
  if (receipts.length) {
    return (
      <div className="status-actions">
        {receipts.map((r) => (
          <span key={r.id}>
            <ReceiptChip r={r} />
            {!r.sumit_document_id && (
              <form action={deleteReceipt} style={{ display: 'inline' }}>
                <input type="hidden" name="id" value={r.id} />
                <input type="hidden" name="back" value={back} />
                <ConfirmButton className="btn btn-xs btn-ghost" message={r.source === 'internal' ? 'לבטל את האישור הפנימי?' : 'למחוק את מספר הקבלה?'}>✕</ConfirmButton>
              </form>
            )}
          </span>
        ))}
      </div>
    );
  }
  return (
    <div className="status-actions">
      {sumit && p.method !== 'credit' && (
        <form action={issueReceipt}>
          <input type="hidden" name="id" value={p.id} />
          <input type="hidden" name="back" value={back} />
          {hasEmail && <input type="hidden" name="email" value="1" />}
          <ConfirmButton className="btn btn-xs btn-primary" message={`להפיק ב-SUMIT קבלה על ${shekel(Number(p.amount))} על שם ההורה?${hasEmail ? ' הקבלה תישלח במייל' : ''}`}>
            קבלה ב-SUMIT
          </ConfirmButton>
        </form>
      )}
      <form action={issueInternal}>
        <input type="hidden" name="id" value={p.id} />
        <input type="hidden" name="back" value={back} />
        <button className="btn btn-xs" title="אישור מהמערכת, למשל על פיקדון. לא קבלה לצורכי מס">אישור פנימי</button>
      </form>
      <details>
        <summary className="muted">מספר קבלה</summary>
        <form action={addManualReceipt} className="row-form">
          <input type="hidden" name="id" value={p.id} />
          <input type="hidden" name="back" value={back} />
          <input name="number" dir="ltr" aria-label="מספר קבלה" required style={{ width: 90 }} />
          <button className="btn btn-xs">שמירה</button>
        </form>
      </details>
    </div>
  );
}

/** למה התשלום: שיעורים, זיכוי מכבי, או חלוקה ביניהם */
function paymentFor(p: Payment) {
  const m = maccabiPart(p);
  const rest = Number(p.amount) - m;
  if (!m) return <span className="chip chip-plain">עבור שיעורים</span>;
  if (!rest) return <span className="chip chip-sub">עבור זיכוי מכבי</span>;
  return (
    <>
      <span className="chip chip-plain">שיעורים {shekel(rest)}</span>
      <span className="chip chip-sub">זיכוי מכבי {shekel(m)}</span>
    </>
  );
}

/** הקשר לחיובים: מה התשלום כיסה (קישור לכל חיוב), ומה עוד לא נוצל */
function Coverage({ cov }: { cov: ReturnType<typeof paymentCoverage> }) {
  return (
    <div className="coverage">
      {cov.items.length > 0 && <span className="muted">כיסה: </span>}
      {cov.items.map(({ charge: c, amount }) => (
        <a key={c.id} className="link-chip" href={`#charge-${c.id}`}>
          {c.kind === 'manual' ? c.description || 'חיוב ידני' : `${CHARGE_KIND_LABELS[c.kind]} ${dmy(c.lesson_date)}`} · {shekel(amount)}
        </a>
      ))}
      {cov.unused > 0.001 && <span className="link-chip link-chip-free">עוד לא נוצל {shekel(cov.unused)} (זכות לשיעורים)</span>}
      {cov.unusedMaccabi > 0.001 && <span className="link-chip link-chip-free">עוד לא נוצל {shekel(cov.unusedMaccabi)} (לזיכוי מכבי)</span>}
    </div>
  );
}
