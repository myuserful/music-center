'use client';

import { useState } from 'react';
import { PAYMENT_METHOD_LABELS, PAYMENT_METHODS, type PaymentMethod } from '@/lib/constants';

/** שדות תשלום: פרטי הצ'ק מופיעים רק כשבוחרים צ'ק */
export function PaymentFields({ amount, defaultMethod }: { amount: number; defaultMethod: PaymentMethod }) {
  const [method, setMethod] = useState<PaymentMethod>(defaultMethod);
  return (
    <>
      <label>סכום<input name="amount" type="number" min="1" step="any" defaultValue={amount > 0 ? amount : ''} required /></label>
      <label>תאריך<input name="paid_on" type="date" defaultValue={new Date().toISOString().slice(0, 10)} /></label>
      <label>
        אמצעי תשלום
        <select name="method" value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>
          {PAYMENT_METHODS.map((m) => <option key={m} value={m}>{PAYMENT_METHOD_LABELS[m]}</option>)}
        </select>
      </label>
      {method === 'check' ? (
        <>
          <label>מספר צ&apos;ק<input name="check_number" dir="ltr" inputMode="numeric" /></label>
          <label>בנק<input name="check_bank" /></label>
          <label>תאריך פירעון<input name="check_date" type="date" /></label>
        </>
      ) : (
        <label>אסמכתא<input name="reference" dir="ltr" placeholder={method === 'credit' ? '4 ספרות / מספר אישור' : ''} /></label>
      )}
    </>
  );
}
