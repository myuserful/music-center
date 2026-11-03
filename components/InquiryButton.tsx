'use client';

import Link from 'next/link';
import { useRef, useState, useTransition } from 'react';
import { addInquiry } from '@/lib/actions/calls';
import { URGENCIES, URGENCY_LABELS, type Urgency } from '@/lib/constants';

/** כפתור בכרטיס התלמיד/ה: חלון עם הסיבה להתקשר ורמת הדחיפות, ומשם הטלפון נכנס לרשימת הבירורים */
export function InquiryButton({ studentId, name }: { studentId: number; name: string }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [reason, setReason] = useState('');
  const [urgency, setUrgency] = useState<Urgency>('normal');
  const [error, setError] = useState('');
  const [added, setAdded] = useState(false);
  const [pending, startTransition] = useTransition();

  function open() {
    setReason('');
    setUrgency('normal');
    setError('');
    setAdded(false);
    dialog.current?.showModal();
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    startTransition(async () => {
      const res = await addInquiry(studentId, reason, urgency);
      if (res.ok) setAdded(true);
      else setError(res.error);
    });
  }

  return (
    <>
      <button type="button" className="btn" onClick={open}>☎ טלפון לבירור</button>
      <dialog ref={dialog} className="receipt-dialog" onClick={(e) => e.target === dialog.current && dialog.current.close()}>
        <div className="dash-head">
          <h2>טלפון לבירור: {name}</h2>
          <button type="button" className="btn btn-ghost btn-xs" onClick={() => dialog.current?.close()}>סגירה</button>
        </div>
        {added ? (
          <>
            <p className="flash flash-ok" role="status">הטלפון נכנס לרשימת הבירורים</p>
            <div className="form-foot">
              <Link className="btn" href="/calls">לרשימת הבירורים</Link>
              <button type="button" className="btn btn-primary" onClick={() => dialog.current?.close()}>סיום</button>
            </div>
          </>
        ) : (
          <form className="receipt-form" onSubmit={submit}>
            <label>
              למה צריך להתקשר?
              <textarea rows={4} required autoFocus value={reason} onChange={(e) => setReason(e.target.value)} />
            </label>
            <fieldset className="inquiry-urgency">
              <legend>רמת דחיפות</legend>
              {URGENCIES.map((u) => (
                <label key={u} className="check">
                  <input type="radio" name="urgency" checked={urgency === u} onChange={() => setUrgency(u)} /> {URGENCY_LABELS[u]}
                </label>
              ))}
            </fieldset>
            {error && <p className="flash flash-error" role="alert">{error}</p>}
            <div className="form-foot">
              <button className="btn btn-primary" disabled={pending || !reason.trim()}>{pending ? 'שומר…' : 'אישור'}</button>
            </div>
          </form>
        )}
      </dialog>
    </>
  );
}
