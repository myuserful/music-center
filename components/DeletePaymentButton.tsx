import { ConfirmButton } from '@/components/ConfirmButton';
import { deletePayment } from '@/lib/actions/payments';
import { shekel } from '@/lib/billing';
import { dmy } from '@/lib/day';
import type { Payment, Receipt } from '@/lib/types';

/**
 * מחיקת תשלום (או החזר), למשל שנרשם לתלמיד/ה הלא נכון/ה או בסכום לא נכון. הקבלות שלו נמחקות מהמערכת יחד איתו.
 * קבלה ב-SUMIT לא מתבטלת מכאן: אחרי המחיקה צריך לבטל אותה ב-SUMIT (ההודעה מזכירה)
 */
export function DeletePaymentButton({ payment: p, receipts, back }: { payment: Payment; receipts: Receipt[]; back: string }) {
  const sumit = receipts.filter((r) => r.source === 'sumit');
  const local = receipts.filter((r) => r.source !== 'sumit');
  const what = p.refund ? 'ההחזר' : 'התשלום';
  const effect = p.refund ? 'הסכום יחזור לזכות ההורים' : 'הסכום יחזור ליתרת החוב';
  const others = local.length ? ` גם ${local.map((r) => (r.source === 'internal' ? `אישור ${r.number}` : `מספר קבלה ${r.number}`)).join(', ')} יימחק.` : '';
  const sumitNote = sumit.length
    ? `

שימו לב: ${sumit.length > 1 ? 'הקבלות' : 'הקבלה'} ${sumit.map((r) => r.number).join(', ')} ב-SUMIT לא ${sumit.length > 1 ? 'מתבטלות' : 'מתבטלת'} מכאן. אחרי המחיקה צריך לבטל ב-SUMIT (להפיק מסמך ביטול/זיכוי).`
    : '';
  return (
    <form action={deletePayment}>
      <input type="hidden" name="id" value={p.id} />
      <input type="hidden" name="back" value={back} />
      <ConfirmButton className="btn btn-xs btn-danger" message={`למחוק את ${what} של ${shekel(Number(p.amount))} מ-${dmy(p.paid_on)}? ${effect}.${others}${sumitNote}`}>
        מחיקה
      </ConfirmButton>
    </form>
  );
}
