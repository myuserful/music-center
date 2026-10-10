import { ConfirmButton } from '@/components/ConfirmButton';
import { PaymentFields } from '@/components/PaymentFields';
import { Empty } from '@/components/ui';
import { addCharge, addPayment, deletePayment, setChargeState } from '@/lib/actions/payments';
import { monthLabel, parentBalance, shekel } from '@/lib/billing';
import {
  CHARGE_STATE_LABELS, CHECK_STATUS_LABELS, HEALTH_FUND_LABELS, PAYMENT_METHOD_LABELS, type HealthFund,
} from '@/lib/constants';
import type { Charge, Payment, Student } from '@/lib/types';

/** לשונית התשלומים בכרטיס התלמיד: יתרה, חיובים, תשלומים והוספת תשלום */
export function StudentPayments({ student, charges, payments }: { student: Student; charges: Charge[]; payments: Payment[] }) {
  const here = `/students/${student.id}`;
  const balance = parentBalance(charges, payments);
  const live = charges.filter((c) => c.state !== 'cancelled');

  return (
    <section className="card">
      <h2>תשלומים</h2>
      <p>
        <strong>{balance > 0 ? `יתרת חוב: ${shekel(balance)}` : balance < 0 ? `זכות: ${shekel(-balance)}` : 'אין חוב'}</strong>
        {student.standing_order && <span className="chip">הוראת קבע</span>}
      </p>

      <form action={addPayment} className="row-form">
        <input type="hidden" name="student_id" value={student.id} />
        <input type="hidden" name="back" value={here} />
        <PaymentFields amount={balance} defaultMethod={student.standing_order ? 'standing_order' : 'cash'} />
        <button className="btn btn-xs btn-primary">+ רישום תשלום</button>
      </form>

      <div className="grid grid-2" style={{ marginTop: 16 }}>
        <div>
          <h3>חיובים</h3>
          {live.length === 0 ? <Empty>אין חיובים</Empty> : (
            <ul className="list">
              {live.map((c) => (
                <li key={c.id}>
                  <div>
                    <strong>{c.description}</strong> · {monthLabel(c.month)}
                    <div className="muted">
                      {c.payer === 'fund'
                        ? `${HEALTH_FUND_LABELS[c.fund as HealthFund] ?? c.fund} · ${c.commitments} התחייבויות · ${shekel(c.amount == null ? null : Number(c.amount))}`
                        : shekel(Number(c.amount))}
                    </div>
                  </div>
                  <span className="chip chip-plain">{CHARGE_STATE_LABELS[c.state]}</span>
                  {c.state === 'awaiting_refund' && (
                    <form action={setChargeState}>
                      <input type="hidden" name="id" value={c.id} />
                      <input type="hidden" name="state" value="due" />
                      <input type="hidden" name="back" value={here} />
                      <button className="btn btn-xs">קיבלו החזר ממכבי</button>
                    </form>
                  )}
                  {c.payer === 'parents' && (
                    <form action={setChargeState}>
                      <input type="hidden" name="id" value={c.id} />
                      <input type="hidden" name="state" value="cancelled" />
                      <input type="hidden" name="back" value={here} />
                      <ConfirmButton className="btn btn-xs btn-ghost" message="לבטל את החיוב?">ביטול</ConfirmButton>
                    </form>
                  )}
                </li>
              ))}
            </ul>
          )}
          <form action={addCharge} className="row-form" style={{ marginTop: 8 }}>
            <input type="hidden" name="student_id" value={student.id} />
            <input type="hidden" name="back" value={here} />
            <label>חיוב / הנחה ידני<input name="description" placeholder="דמי רישום, הנחת אחים..." required /></label>
            <label>סכום<input name="amount" type="number" step="any" placeholder="הנחה: מספר שלילי" required /></label>
            <button className="btn btn-xs">+ הוספה</button>
          </form>
        </div>

        <div>
          <h3>תשלומים שהתקבלו</h3>
          {payments.length === 0 ? <Empty>עדיין לא התקבלו תשלומים</Empty> : (
            <ul className="list">
              {payments.map((p) => (
                <li key={p.id}>
                  <div>
                    <strong>{shekel(Number(p.amount))}</strong> · {PAYMENT_METHOD_LABELS[p.method]}
                    <div className="muted">
                      {new Date(p.paid_on).toLocaleDateString('he-IL')}
                      {p.method === 'check' && ` · צ'ק ${p.check_number}${p.check_date ? ` לתאריך ${new Date(p.check_date).toLocaleDateString('he-IL')}` : ''}`}
                      {p.reference && ` · ${p.reference}`}
                    </div>
                  </div>
                  {p.check_status && <span className="chip chip-plain">{CHECK_STATUS_LABELS[p.check_status]}</span>}
                  <form action={deletePayment}>
                    <input type="hidden" name="id" value={p.id} />
                    <input type="hidden" name="back" value={here} />
                    <ConfirmButton className="btn btn-xs btn-danger" message="למחוק את התשלום?">מחיקה</ConfirmButton>
                  </form>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
