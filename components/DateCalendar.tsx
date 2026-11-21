'use client';

import { useState } from 'react';
import { DAYS } from '@/lib/constants';

const MONTHS = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];
const pad = (n: number) => String(n).padStart(2, '0');
const iso = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`;
const todayIso = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' });

/** "יום שני, 23/11/2026" */
export function longDate(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  return `יום ${DAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]}, ${pad(d)}/${pad(m)}/${y}`;
}

/**
 * לוח שנה פתוח לבחירת תאריך אחד (בלי לפתוח חלונית).
 * הערך נשלח בטופס בשדה name. mark: תאריך נוסף להדגשה (למשל "מיום" בלוח של "ליום").
 */
export function DateCalendar({ name, label, value, onChange, required, mark, markLabel }: {
  name: string; label: string; value: string; onChange: (v: string) => void;
  required?: boolean; mark?: string; markLabel?: string;
}) {
  const start = value || mark || todayIso();
  const [view, setView] = useState(() => ({ y: Number(start.slice(0, 4)), m: Number(start.slice(5, 7)) - 1 }));
  const today = todayIso();

  const first = new Date(Date.UTC(view.y, view.m, 1)).getUTCDay();
  const days = new Date(Date.UTC(view.y, view.m + 1, 0)).getUTCDate();
  const cells: (number | null)[] = [...Array(first).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];
  const move = (delta: number) => setView(({ y, m }) => {
    const d = new Date(Date.UTC(y, m + delta, 1));
    return { y: d.getUTCFullYear(), m: d.getUTCMonth() };
  });

  return (
    <div className="cal">
      <div className="cal-label">{label}{required ? '' : ' (לא חובה)'}</div>
      {/* שדה חובה "שקוף": כדי שהדפדפן יעצור את השליחה כשלא נבחר תאריך */}
      <input className="cal-value" name={name} value={value} required={required} onChange={() => {}}
        tabIndex={-1} aria-hidden="true" />
      <div className="cal-head">
        <button type="button" className="btn btn-xs btn-ghost" onClick={() => move(-1)} aria-label="חודש קודם">›</button>
        <b>{MONTHS[view.m]} {view.y}</b>
        <button type="button" className="btn btn-xs btn-ghost" onClick={() => move(1)} aria-label="חודש הבא">‹</button>
      </div>
      <div className="cal-grid" role="grid" aria-label={label}>
        {DAYS.map((d) => <span key={d} className="cal-dow">{d[0]}׳</span>)}
        {cells.map((d, i) => {
          if (d == null) return <span key={`e${i}`} />;
          const date = iso(view.y, view.m, d);
          const cls = [
            'cal-day',
            date === value ? 'selected' : '',
            date === mark ? 'marked' : '',
            date === today ? 'today' : '',
            date < today ? 'past' : '',
          ].join(' ');
          return (
            <button key={date} type="button" className={cls} aria-pressed={date === value}
              title={date === mark ? markLabel : undefined}
              onClick={() => onChange(date === value && !required ? '' : date)}>
              {d}
            </button>
          );
        })}
      </div>
      <div className="cal-foot">
        {value ? <>נבחר: <b>{longDate(value)}</b></> : <span className="muted">לא נבחר תאריך</span>}
        {value && !required && <button type="button" className="btn btn-xs btn-ghost" onClick={() => onChange('')}>ניקוי</button>}
      </div>
    </div>
  );
}
