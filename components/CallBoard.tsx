'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useTransition } from 'react';
import { moveCall } from '@/lib/actions/calls';
import { CALL_COLUMN_LABELS, CALL_COLUMNS, STATUS_LABELS, type CallColumn, type Status } from '@/lib/constants';

export type CallCard = {
  id: number; name: string; column: CallColumn; attempts: number; lastCall: string | null;
  items: { key: string; status: Status; text: string }[];
  contacts: { id: number; name: string; relation: string; phone: string }[];
};

const when = (iso: string) =>
  new Date(iso).toLocaleString('he-IL', {
    timeZone: 'Asia/Jerusalem', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  });

/** סדר בעמודה: לא ענו - מי שניסינו הכי מזמן למעלה. אושר - האחרונים למעלה. */
function sortColumn(column: CallColumn, cards: CallCard[]) {
  const t = (c: CallCard) => (c.lastCall ? Date.parse(c.lastCall) : 0);
  return [...cards].sort((a, b) =>
    column === 'confirmed' ? t(b) - t(a) :
    column === 'to_call' ? a.name.localeCompare(b.name, 'he') :
    t(a) - t(b));
}

export function CallBoard({ cards: initial }: { cards: CallCard[] }) {
  const router = useRouter();
  const [cards, setCards] = useState(initial);
  const [dragId, setDragId] = useState<number | null>(null);
  const [over, setOver] = useState<CallColumn | null>(null);
  const [q, setQ] = useState('');
  const [error, setError] = useState('');
  const [, startTransition] = useTransition();

  useEffect(() => setCards(initial), [initial]);

  const query = q.trim();
  const visible = cards.filter((c) =>
    !query || c.name.includes(query) || c.contacts.some((x) => x.phone.includes(query) || x.name.includes(query)));

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
      <div className="task-toolbar">
        <input
          type="search" className="call-search" placeholder="חיפוש לפי שם או טלפון"
          value={q} onChange={(e) => setQ(e.target.value)} aria-label="חיפוש"
        />
        {error && <span className="flash flash-error" role="alert">{error}</span>}
      </div>

      <div className="kanban kanban-calls">
        {CALL_COLUMNS.map((column) => {
          const list = sortColumn(column, visible.filter((c) => c.column === column));
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
