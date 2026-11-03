'use client';

import { useEffect, useRef, useState } from 'react';
import { PAYMENT_TRACK_LABELS, PAYMENT_TRACKS, type PaymentTrack } from '@/lib/constants';

/**
 * מסלול התשלום. כשמשנים מסלול לתלמיד/ה קיים/ת ושומרים, נשאלים אם לחשב מחדש גם את החיובים של השיעורים שכבר היו,
 * או רק מעכשיו והלאה. התשובה נשלחת בשדה rebill_past
 */
export function PaymentTrackField({ track, existing }: { track: PaymentTrack; existing: boolean }) {
  const [current, setCurrent] = useState(track);
  const [asking, setAsking] = useState(false);
  const select = useRef<HTMLSelectElement>(null);
  const rebill = useRef<HTMLInputElement>(null);
  const answered = useRef(false);

  useEffect(() => {
    const form = select.current?.form;
    if (!form || !existing) return;
    // אחרי שמירה המסלול השמור מתעדכן, ובשינוי הבא שואלים שוב
    answered.current = false;
    const onSubmit = (e: SubmitEvent) => {
      if (answered.current || select.current!.value === track) return;
      // לפני ש-React שולח את הטופס: עוצרים ושואלים
      e.preventDefault();
      e.stopPropagation();
      setAsking(true);
    };
    form.addEventListener('submit', onSubmit);
    return () => form.removeEventListener('submit', onSubmit);
  }, [existing, track]);

  const answer = (past: boolean) => {
    rebill.current!.value = past ? 'yes' : '';
    answered.current = true;
    setAsking(false);
    select.current!.form!.requestSubmit();
  };

  return (
    <>
      <label>
        מסלול תשלום
        <select ref={select} name="payment_track" value={current} onChange={(e) => setCurrent(e.target.value as PaymentTrack)}>
          {/* ערך ישן מלפני 0041 (מכבי / התחייבות): מוצג כמו שהוא כדי ששמירה לא תשנה אותו */}
          {!PAYMENT_TRACKS.includes(track) && <option value={track}>{track} (ישן)</option>}
          {PAYMENT_TRACKS.map((t) => <option key={t} value={t}>{PAYMENT_TRACK_LABELS[t]}</option>)}
        </select>
        <input ref={rebill} type="hidden" name="rebill_past" defaultValue="" />
      </label>
      {asking && (
        <div className="modal-backdrop" onClick={() => setAsking(false)}>
          <div className="card modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="שינוי מסלול תשלום">
            <strong>שינוי מסלול תשלום</strong>
            <p>
              {PAYMENT_TRACK_LABELS[track] ?? track} ← {PAYMENT_TRACK_LABELS[current]}
              <br />
              לחשב מחדש גם את החיובים של השיעורים שכבר היו?
            </p>
            <div className="modal-options">
              <button type="button" className="btn btn-primary" onClick={() => answer(true)} autoFocus>כן, לעדכן גם את העבר</button>
              <button type="button" className="btn" onClick={() => answer(false)}>לא, רק מעכשיו</button>
              <button type="button" className="btn btn-ghost" onClick={() => setAsking(false)}>ביטול</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
