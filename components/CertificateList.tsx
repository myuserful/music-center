import Link from 'next/link';
import { ConfirmButton } from '@/components/ConfirmButton';
import { Empty } from '@/components/ui';
import { shortDate } from '@/lib/activityDays';
import { deleteCertificate, emailCertificate } from '@/lib/actions/certificates';
import { shekel } from '@/lib/billing';
import { dmy } from '@/lib/day';
import type { ReceiptCertificate } from '@/lib/types';

/**
 * טבלת אישורי הקבלה לקופות שהופקו, עם הורדה חוזרת ושליחה במייל. showStudent = עמודת שם (בדף הכללי).
 * emails: המייל התקין של כל תלמיד/ה (לפי student_id). בלי מייל תקין - אין שליחה
 */
export function CertificateList({ certificates, back, emails, showStudent = false }: {
  certificates: ReceiptCertificate[]; back: string; emails: Record<number, string>; showStudent?: boolean;
}) {
  if (certificates.length === 0) return <Empty>עוד לא הופקו אישורי קבלה</Empty>;
  return (
    <table className="day-table">
      <thead>
        <tr>
          <th>הופק</th>{showStudent && <th>תלמיד/ה</th>}<th>מספר קבלה</th><th>סכום</th><th>פעילויות</th><th>תאריך הקבלה</th><th />
        </tr>
      </thead>
      <tbody>
        {certificates.map((c) => (
          <tr key={c.id}>
            <td className="nowrap">{dmy(c.created_at.slice(0, 10))}</td>
            {showStudent && (
              <td>{c.student_id ? <Link href={`/students/${c.student_id}`}>{c.name}</Link> : c.name}</td>
            )}
            <td>{c.number || <span className="muted">—</span>}</td>
            <td className="nowrap"><strong>{shekel(Number(c.amount))}</strong></td>
            <td>
              {c.dates.length}{' '}
              <span className="muted" dir="ltr">({shortDate(c.dates[0])}{c.dates.length > 1 && ` – ${shortDate(c.dates[c.dates.length - 1])}`})</span>
              {c.source === 'lessons' && <span className="chip chip-plain">לפי שיעורים</span>}
            </td>
            <td className="nowrap">
              {dmy(c.issued_on)}
              {c.emailed_at && <div className="muted" title={c.emailed_to}>נשלח במייל {dmy(c.emailed_at.slice(0, 10))}</div>}
            </td>
            <td className="nowrap">
              <a className="btn btn-xs" href={`/certificates/${c.id}`} target="_blank" rel="noreferrer">הורדה (PDF)</a>{' '}
              {(() => {
                const to = c.student_id ? emails[c.student_id] : '';
                if (!to) return <button type="button" className="btn btn-xs" disabled title="אין מייל תקין בכרטיס התלמיד/ה">שליחה במייל</button>;
                return (
                  <form action={emailCertificate} style={{ display: 'inline' }}>
                    <input type="hidden" name="id" value={c.id} />
                    <input type="hidden" name="back" value={back} />
                    <ConfirmButton className="btn btn-xs" message={`לשלוח את אישור הקבלה של ${c.name} ל-${to}?`}>
                      {c.emailed_at ? 'שליחה שוב' : 'שליחה במייל'}
                    </ConfirmButton>
                  </form>
                );
              })()}{' '}
              <form action={deleteCertificate} style={{ display: 'inline' }}>
                <input type="hidden" name="id" value={c.id} />
                <input type="hidden" name="back" value={back} />
                <ConfirmButton className="btn btn-xs btn-ghost" message={`למחוק את אישור הקבלה של ${c.name}?`}>מחיקה</ConfirmButton>
              </form>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
