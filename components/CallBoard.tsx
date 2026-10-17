'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useTransition } from 'react';
import { moveCall } from '@/lib/actions/calls';
import { CALL_COLUMN_LABELS, CALL_COLUMNS, DAYS, STATUS_LABELS, type CallColumn, type Status } from '@/lib/constants';

export type CallCard = {
  id: number; name: string; lastName: string; firstName: string; column: CallColumn; attempts: number; lastCall: string | null;
  items: { key: string; status: Status; text: string; instrument: string; weekday: number }[];
  contacts: { id: number; name: string; relation: string; phone: string }[];
};

const when = (iso: string) =>
  new Date(iso).toLocaleString('he-IL', {
    timeZone: 'Asia/Jerusalem', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  });

/** סדר בעמודה: לא ענו - מי שניסינו הכי מזמן למעלה. אושר - האחרונים למעלה. */
type SortBy = 'last_name' | 'last_call';

/** שם משפחה ואז שם פרטי (אחים יוצאים אחד אחרי השני) */
const byLastName = (a: CallCard, b: CallCard) =>
  (a.lastName ?? '').localeCompare(b.lastName ?? '', 'he') || (a.firstName ?? '').localeCompare(b.firstName ?? '', 'he');

/**
 * לפי שם משפחה, או לפי שיחה אחרונה: לא ענו / מתלבטים - מי שהתקשרנו אליו הכי מזמן למעלה, אושר - האחרונים למעלה.
 * "צריך להתקשר" תמיד לפי שם משפחה (עוד לא התקשרו).
 */
function sortColumn(column: CallColumn, cards: CallCard[], sortBy: SortBy) {
  const t = (c: CallCard) => (c.lastCall ? Date.parse(c.lastCall) : 0);
  return [...cards].sort((a, b) =>
    sortBy === 'last_name' || column === 'to_call' ? byLastName(a, b) :
    column === 'confirmed' ? t(b) - t(a) || byLastName(a, b) :
    t(a) - t(b) || byLastName(a, b));
}

export function CallBoard({ cards: initial }: { cards: CallCard[] }) {
  const router = useRouter();
  const [cards, setCards] = useState(initial);
  const [dragId, setDragId] = useState<number | null>(null);
  const [over, setOver] = useState<CallColumn | null>(null);
  const [q, setQ] = useState('');
  const [fInstrument, setFInstrument] = useState('');
  const [fDay, setFDay] = useState('');
  const [sortBy, setSortBy] = useState<SortBy>('last_name');
  const [error, setError] = useState('');
  const [, startTransition] = useTransition();

  useEffect(() => setCards(initial), [initial]);

  const query = q.trim();
  // אפשרויות הסינון מתוך השיבוצים שבלוח
  const instruments = [...new Set(cards.flatMap((c) => c.items.map((i) => i.instrument)).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, 'he'));
  const days = [...new Set(cards.flatMap((c) => c.items.map((i) => i.weekday)))].filter((d) => d >= 0).sort();
  const visible = cards.filter((c) =>
    (!query || c.name.includes(query) || c.contacts.some((x) => x.phone.includes(query) || x.name.includes(query))) &&
    // כלי ויום: שניהם באותו שיבוץ
    (!fInstrument && !fDay || c.items.some((i) =>
      (!fInstrument || i.instrument === fInstrument) && (!fDay || i.weekday === Number(fDay)))));

  function place(id: number, column: CallColumn) {
    setDragId(null);
    setOver(null);
    const card = cards.find((c) => c.id === id);
    if (!card || card.column === column) return;

    const before = cards;
    const now = new Date().toISOString();
    setCards(cards.map((c) => (c.id !== id ? c :
      column === 'to_call' ? { ...c, column } :
      column === 'no_answer' ? { ...c, column, attempts: c.attempts + 1, lastCall: now } :
      { ...c, column, attempts: 0, lastCall: now })));
    setError('');
    startTransition(async () => {
      const res = await moveCall(id, column);
      if (!res.ok) {
        setCards(before);
        setError(res.error);
      } else {
        router.refresh();
      }
    });
  }

  return (
    <>
      <div className="task-toolbar call-toolbar">
        <input
          type="search" className="call-search" placeholder="חיפוש לפי שם או טלפון"
          value={q} onChange={(e) => setQ(e.target.value)} aria-label="חיפוש"
        />
        <select value={fInstrument} onChange={(e) => setFInstrument(e.target.value)} aria-label="סינון לפי כלי">
          <option value="">כל הכלים</option>
          {instruments.map((i) => <option key={i} value={i}>{i}</option>)}
        </select>
        <select value={sortBy} onChange={(e) => setSortBy(e.target.value as SortBy)} aria-label="מיון">
          <option value="last_name">מיון: שם משפחה</option>
          <option value="last_call">מיון: שיחה אחרונה</option>
        </select>
        <select value={fDay} onChange={(e) => setFDay(e.target.value)} aria-label="סינון לפי יום">
          <option value="">כל הימים</option>
          {days.map((d) => <option key={d} value={d}>{DAYS[d]}</option>)}
        </select>
        {(fInstrument || fDay || q) && (
          <button type="button" className="btn btn-xs btn-ghost" onClick={() => { setQ(''); setFInstrument(''); setFDay(''); }}>
            ניקוי סינון
          </button>
        )}
        {error && <span className="flash flash-error" role="alert">{error}</span>}
      </div>

      <div className="kanban kanban-calls">
        {CALL_COLUMNS.map((column) => {
          const list = sortColumn(column, visible.filter((c) => c.column === column), sortBy);
          return (
            <section
              key={column}
              className={`kanban-col kanban-call-${column} ${over === column ? 'over' : ''}`}
              onDragOver={(e) => {
                if (dragId == null) return;
                e.preventDefault();
                if (over !== column) setOver(column);
              }}
              onDragLeave={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node)) setOver(null);
              }}
              onDrop={(e) => {
                e.preventDefault();
                if (dragId != null) place(dragId, column);
              }}
            >
              <header className="kanban-head">
                <h2>{CALL_COLUMN_LABELS[column]}</h2>
                <span className="kanban-count">{list.length}</span>
              </header>
              <div className="kanban-cards">
                {list.length === 0 && <p className="empty">גוררים לכאן תלמידים</p>}
                {list.map((c) => (
                  <article
                    key={c.id}
                    className={`task-card call-card ${dragId === c.id ? 'dragging' : ''}`}
                    draggable
                    onDragStart={(e) => { setDragId(c.id); e.dataTransfer.effectAllowed = 'move'; }}
                    onDragEnd={() => { setDragId(null); setOver(null); }}
                  >
                    <div className="task-card-top">
                      <Link href={`/students/${c.id}`} className="task-title" draggable={false}>{c.name}</Link>
                      {c.column === 'no_answer' && c.attempts > 0 && (
                        <span className="badge badge-pending">לא ענו ×{c.attempts}</span>
                      )}
                    </div>

                    <ul className="call-items">
                      {c.items.map((i) => (
                        <li key={i.key}>
                          <span className={`call-dot dot-${i.status}`} title={STATUS_LABELS[i.status]} aria-label={STATUS_LABELS[i.status]} />
                          {i.text}
                        </li>
                      ))}
                    </ul>

                    {c.contacts.length === 0 ? <p className="call-phone muted">אין טלפון</p> : c.contacts.map((x) => (
                      <p key={x.id} className="call-phone">
                        {x.name}{x.relation ? ` (${x.relation})` : ''} ·{' '}
                        <a href={`tel:${x.phone}`} dir="ltr" draggable={false}>{x.phone}</a>
                      </p>
                    ))}

                    {c.lastCall && c.column !== 'to_call' && (
                      <p className="task-due">שיחה אחרונה: {when(c.lastCall)}</p>
                    )}

                    {/* העברה בלחיצה (גם בטלפון, בלי גרירה) */}
                    <div className="task-move">
                      {CALL_COLUMNS.filter((s) => s !== c.column).map((s) => (
                        <button key={s} type="button" className="btn btn-xs btn-ghost" onClick={() => place(c.id, s)}>
                          ← {CALL_COLUMN_LABELS[s]}
                        </button>
                      ))}
                    </div>
                  </article>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </>
  );
}
