'use client';

import { useState } from 'react';
import { STUDENT_STATUS_LABELS, STUDENT_STATUSES, type StudentStatus } from '@/lib/constants';

/** סטטוס התלמיד/ה. ברשימת המתנה נפתח שדה שבו כותבים בדיוק למה ממתינים */
export function StudentStatusFields({ status, reason }: { status: StudentStatus; reason: string }) {
  const [current, setCurrent] = useState(status);

  return (
    <>
      <label>
        סטטוס
        <select name="status" value={current} onChange={(e) => setCurrent(e.target.value as StudentStatus)}>
          {STUDENT_STATUSES.map((x) => <option key={x} value={x}>{STUDENT_STATUS_LABELS[x]}</option>)}
        </select>
      </label>
      {current === 'waiting' && (
        <label className="wide">
          ממתין/ה ל...
          <input name="waiting_reason" defaultValue={reason} placeholder='למשל: מורה לאורגן, רק ביום שני אחרי 5:00' autoFocus={status !== 'waiting'} />
        </label>
      )}
    </>
  );
}
