'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { ACTIVITY_YEAR, offName, shortDate, weekdayDates } from '@/lib/activityDays';
import { isoDate } from '@/lib/age';
import { BOARD_DAYS, DAYS, RECEIPT_FIELD_LABELS, type Gender } from '@/lib/constants';

/**
 * כפתור "הפקת קבלה": אישור קבלה ב-PDF (לקופה, למשל מכבי).
 * לפי שיעורים שהתקיימו: התאריכים מהשיעורים שהתלמיד/ה הגיע/ה אליהם, והסכום = מחיר מכבי לשיעור × מספרם.
 * בשני המצבים בוחרים את התחום שייכתב: "הבעה ויצירה" או "אומנות".
 * ידני: סכום, ימי פעילות ומספר פעילויות. התאריכים מחושבים מהם, ואפשר להסיר ולהוסיף כל תאריך.
 * כל קבלה שנוצרת נשמרת (בדף "אישורי קבלה" ובכרטיס התלמיד/ה) כדי שאפשר יהיה להוריד אותה שוב
 */
export function ReceiptButton({ studentId, days, gender, attended, price }: {
  studentId: number; days: number[]; gender: Gender | null;
  /** תאריכי השיעורים שהתלמיד/ה הגיע/ה אליהם (ימים סגורים) */
  attended: string[]; price: number;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const today = isoDate(new Date());
  const [mode, setMode] = useState<'lessons' | 'manual'>(attended.length ? 'lessons' : 'manual');
  const [picked, setPicked] = useState<number[]>(days.filter((d) => BOARD_DAYS.includes(d)));
  const [count, setCount] = useState('');
  const [from, setFrom] = useState(ACTIVITY_YEAR.start);
  const [skipOff, setSkipOff] = useState(true);
  // התאריכים שיודפסו: מחושבים מחדש כשמשנים ימים/מספר/התחלה, ואפשר לערוך אותם ביד
  const [dates, setDates] = useState<string[]>([]);
  const [extra, setExtra] = useState('');
  const [range, setRange] = useState({ from: `${today.slice(0, 7)}-01`, to: today });
  const router = useRouter();

  const lessonDates = attended.filter((d) => d >= range.from && d <= range.to);

  const regenerate = (next: { picked?: number[]; count?: string; from?: string; skipOff?: boolean }) => {
    const v = { picked, count, from, skipOff, ...next };
    setPicked(v.picked); setCount(v.count); setFrom(v.from); setSkipOff(v.skipOff);
    setDates(weekdayDates(v.picked, v.from, Math.min(200, Math.floor(Number(v.count))), v.skipOff));
  };
  const toggle = (d: number) => regenerate({ picked: picked.includes(d) ? picked.filter((x) => x !== d) : [...picked, d].sort() });

  return (
    <>
      <button type="button" className="btn" onClick={() => dialog.current?.showModal()}>הפקת קבלה</button>
      <dialog ref={dialog} className="receipt-dialog" onClick={(e) => e.target === dialog.current && dialog.current.close()}>
        <form className="receipt-form" action={`/students/${studentId}/receipt`} method="post" target="_blank"
          onSubmit={() => { dialog.current?.close(); setTimeout(() => router.refresh(), 1500); }}>
          <div className="dash-head">
            <h2>הפקת אישור קבלה</h2>
            <button type="button" className="btn btn-ghost btn-xs" onClick={() => dialog.current?.close()}>סגירה</button>
          </div>

          <nav className="tabs">
            <button type="button" className={mode === 'lessons' ? 'active' : ''} onClick={() => setMode('lessons')}>לפי שיעורים שהתקיימו</button>
            <button type="button" className={mode === 'manual' ? 'active' : ''} onClick={() => setMode('manual')}>ידני (בחירת תאריכים)</button>
          </nav>
          <label className="receipt-field">
            מה ייכתב באישור
            <select name="field" defaultValue="expression">
              {Object.entries(RECEIPT_FIELD_LABELS).map(([k, v]) => <option key={k} value={k}>טיפולים ב{v}</option>)}
            </select>
          </label>
          {!gender && <p className="muted">לא נבחר מין בכרטיס: הנוסח יהיה &quot;הילד/ה ... קיבל/ה&quot;</p>}

          {mode === 'lessons' ? (
            <>
              <input type="hidden" name="source" value="lessons" />
              <div className="form-grid">
                <label>מתאריך<input name="from" type="date" required value={range.from} onChange={(e) => setRange({ ...range, from: e.target.value })} /></label>
                <label>עד תאריך<input name="to" type="date" required value={range.to} onChange={(e) => setRange({ ...range, to: e.target.value })} /></label>
                <label>
                  סכום (₪)
                  <input name="amount" type="number" min="1" step="any" inputMode="decimal" placeholder={String(lessonDates.length * price)} />
                </label>
                <label>מספר קבלה<input name="number" placeholder="ריק = מהקבלות של התשלומים" /></label>
                <label>תאריך הקבלה<input name="date" type="date" defaultValue={today} /></label>
              </div>
              {lessonDates.length === 0 ? (
                <p className="flash flash-error">אין שיעורים שהתלמיד/ה הגיע/ה אליהם בתאריכים האלה (רק ימים סגורים נספרים)</p>
              ) : (
                <div className="receipt-dates">
                  <span className="muted">{lessonDates.length} שיעורים × {price} ₪ = {lessonDates.length * price} ₪:</span>{' '}
                  {lessonDates.map((d) => <span key={d} className="chip" dir="ltr">{shortDate(d)}</span>)}
                </div>
              )}
              <p className="muted dash-sub">רק שיעורים שהתלמיד/ה הגיע/ה אליהם, מימים סגורים. אפשר לשנות את הסכום</p>
              <div className="form-foot">
                <button className="btn btn-primary" disabled={lessonDates.length === 0}>יצירת קבלה (PDF)</button>
              </div>
            </>
          ) : (
            <>
              <div className="form-grid">
                <label>סכום (₪)<input name="amount" type="number" min="1" step="any" required inputMode="decimal" /></label>
                <label>
                  מספר פעילויות
                  <input type="number" min="1" max="200" value={count} onChange={(e) => regenerate({ count: e.target.value })} />
                </label>
                <fieldset className="receipt-days">
                  <legend>ימי פעילות</legend>
                  {BOARD_DAYS.map((d) => (
                    <label key={d} className="check">
                      <input type="checkbox" checked={picked.includes(d)} onChange={() => toggle(d)} /> {DAYS[d]}
                    </label>
                  ))}
                </fieldset>
                <label>
                  החל מתאריך
                  <input type="date" value={from} onChange={(e) => regenerate({ from: e.target.value })} />
                </label>
                <label>מספר קבלה (אופציונלי)<input name="number" placeholder="למשל 21460" /></label>
                <label>תאריך הקבלה<input name="date" type="date" defaultValue={today} /></label>
                <label className="check">
                  <input type="checkbox" checked={skipOff} onChange={(e) => regenerate({ skipOff: e.target.checked })} /> לדלג על חגים וחופשות
                </label>
              </div>

              <div className="receipt-dates">
                <span className="muted">{dates.length ? `${dates.length} תאריכים:` : 'אין תאריכים עדיין'}</span>{' '}
                {dates.map((d) => (
                  <span key={d} className="chip">
                    <input type="hidden" name="d" value={d} />
                    <span dir="ltr">{shortDate(d)}</span> {'אבגדהוש'[new Date(`${d}T12:00`).getDay()]}&apos;{offName(d) && ` (${offName(d)})`}
                    <button type="button" className="chip-x" aria-label={`הסרת ${shortDate(d)}`}
                      onClick={() => setDates(dates.filter((x) => x !== d))}>✕</button>
                  </span>
                ))}
              </div>
              <div className="row-form">
                <input type="date" value={extra} onChange={(e) => setExtra(e.target.value)} aria-label="תאריך להוספה" />
                <button type="button" className="btn btn-xs" disabled={!extra || dates.includes(extra)}
                  onClick={() => { setDates([...dates, extra].sort()); setExtra(''); }}>+ הוספת תאריך</button>
              </div>
              <p className="muted dash-sub">
                התאריכים מחושבים לפי הימים ומספר הפעילויות, ואפשר להסיר או להוסיף כל תאריך (גם תאריך שעבר, יום חמישי או חג)
              </p>

              <div className="form-foot">
                <button className="btn btn-primary" disabled={dates.length === 0}>יצירת קבלה (PDF)</button>
              </div>
            </>
          )}
        </form>
      </dialog>
    </>
  );
}
