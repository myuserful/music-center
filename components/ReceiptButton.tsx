'use client';

import { useRef, useState } from 'react';
import { ACTIVITY_YEAR, activityDates, shortDate } from '@/lib/activityDays';
import { isoDate } from '@/lib/age';
import { DAYS } from '@/lib/constants';

/** כפתור "הפקת קבלה": סכום, ימי פעילות ומספר פעילויות → אישור קבלה ב-PDF עם תאריכי הפעילות */
export function ReceiptButton({ studentId, days }: { studentId: number; days: number[] }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [picked, setPicked] = useState<number[]>(days.filter((d) => ACTIVITY_YEAR.weekdays.includes(d)));
  const [count, setCount] = useState('');
  const [from, setFrom] = useState(ACTIVITY_YEAR.start);

  const n = Math.floor(Number(count));
  const dates = n > 0 && picked.length > 0 && from ? activityDates(picked, from, n) : [];
  const short = n > 0 && dates.length < n;

  const toggle = (d: number) => setPicked((p) => (p.includes(d) ? p.filter((x) => x !== d) : [...p, d].sort()));

  return (
    <>
      <button type="button" className="btn" onClick={() => dialog.current?.showModal()}>הפקת קבלה</button>
      <dialog ref={dialog} className="receipt-dialog" onClick={(e) => e.target === dialog.current && dialog.current.close()}>
        <form className="receipt-form" action={`/students/${studentId}/receipt`} method="get" target="_blank">
          <div className="dash-head">
            <h2>הפקת אישור קבלה</h2>
            <button type="button" className="btn btn-ghost btn-xs" onClick={() => dialog.current?.close()}>סגירה</button>
          </div>
          <div className="form-grid">
            <label>סכום (₪)<input name="amount" type="number" min="1" step="any" required inputMode="decimal" /></label>
            <label>
              מספר פעילויות
              <input name="count" type="number" min="1" max="200" required value={count} onChange={(e) => setCount(e.target.value)} />
            </label>
            <fieldset className="receipt-days">
              <legend>ימי פעילות</legend>
              {ACTIVITY_YEAR.weekdays.map((d) => (
                <label key={d} className="check">
                  <input type="checkbox" name="day" value={d} checked={picked.includes(d)} onChange={() => toggle(d)} /> {DAYS[d]}
                </label>
              ))}
            </fieldset>
            <label>
              החל מתאריך
              <input name="from" type="date" required value={from} min={ACTIVITY_YEAR.start} max={ACTIVITY_YEAR.end}
                onChange={(e) => setFrom(e.target.value)} />
            </label>
            <label>מספר קבלה (אופציונלי)<input name="number" placeholder="למשל 21460" /></label>
            <label>תאריך הקבלה<input name="date" type="date" defaultValue={isoDate(new Date())} /></label>
          </div>

          {picked.length === 0 && <p className="flash flash-error">יש לבחור לפחות יום פעילות אחד</p>}
          {short && (
            <p className="flash flash-error">
              מהתאריך שנבחר יש רק {dates.length} ימי פעילות עד סוף השנה ({shortDate(ACTIVITY_YEAR.end)})
            </p>
          )}
          {dates.length > 0 && !short && (
            <div className="receipt-dates">
              <span className="muted">{dates.length} תאריכים:</span>{' '}
              {dates.map((d) => <span key={d} className="chip" dir="ltr">{shortDate(d)}</span>)}
            </div>
          )}
          <p className="muted dash-sub">לפי לוח מועדי הפעילות {ACTIVITY_YEAR.label}, בלי חגים וחופשות</p>

          <div className="form-foot">
            <button className="btn btn-primary" disabled={picked.length === 0 || short || dates.length === 0}>יצירת קבלה (PDF)</button>
          </div>
        </form>
      </dialog>
    </>
  );
}
