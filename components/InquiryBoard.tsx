'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useTransition } from 'react';
import { FamilyInfo, type FamilyInfoMember } from '@/components/FamilyInfo';
import { deleteInquiry, moveInquiries } from '@/lib/actions/calls';
import {
  DAYS, INQUIRY_STATUS_LABELS, INQUIRY_STATUSES, URGENCIES, URGENCY_LABELS, type InquiryStatus, type Urgency,
} from '@/lib/constants';
import type { CheckItem } from '@/lib/inquiries';

/** כרטיס אחד למשפחה בכל עמודה (אחים = אותה שיחה), עם כל הבירורים שלה */
export type InquiryCard = {
  key: string; ids: number[]; title: string; lastName: string; firstName: string;
  status: InquiryStatus; urgency: Urgency; attempts: number; lastCall: string | null;
  entries: { id: number; firstName: string; reason: string; urgency: Urgency }[];
  /** מי שיש לו/ה בירור בכרטיס: מה מעודכן אצלו/ה */
  members: { id: number; firstName: string; checklist: CheckItem[] }[];
  contacts: { id: number; name: string; relation: string; phone: string }[];
  /** השיבוצים של מי שבכרטיס, לסינון לפי כלי ויום */
  items: { instrument: string; weekday: number }[];
  /** ימי הלימוד של כל המשפחה */
  familyDays: number[];
  info: FamilyInfoMember[];
};

type SortBy = 'last_name' | 'last_call';

const when = (iso: string) =>
  new Date(iso).toLocaleString('he-IL', {
    timeZone: 'Asia/Jerusalem', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  });

const byLastName = (a: InquiryCard, b: InquiryCard) =>
  (a.lastName ?? '').localeCompare(b.lastName ?? '', 'he') || (a.firstName ?? '').localeCompare(b.firstName ?? '', 'he');

/**
 * הדחופים למעלה, ובתוך כל רמה לפי שם משפחה או שיחה אחרונה (מי שהתקשרנו אליו הכי מזמן למעלה).
 * "צריך להתקשר" בלי שיחה אחרונה: תמיד לפי שם. "טופל": בלי דחיפות, האחרונים למעלה.
 */
function sortColumn(column: InquiryStatus, cards: InquiryCard[], sortBy: SortBy) {
  const t = (c: InquiryCard) => (c.lastCall ? Date.parse(c.lastCall) : 0);
  const rank = (c: InquiryCard) => URGENCIES.indexOf(c.urgency);
  return [...cards].sort((a, b) => {
    if (column === 'done') return sortBy === 'last_name' ? byLastName(a, b) : t(b) - t(a) || byLastName(a, b);
    return rank(a) - rank(b) ||
      (sortBy === 'last_name' || column === 'to_call' ? byLastName(a, b) : t(a) - t(b) || byLastName(a, b));
  });
}

export function InquiryBoard({ cards: initial }: { cards: InquiryCard[] }) {
  const router = useRouter();
  const [cards, setCards] = useState(initial);
  const [dragKey, setDragKey] = useState<string | null>(null);
  const [over, setOver] = useState<InquiryStatus | null>(null);
  const [q, setQ] = useState('');
  const [fInstrument, setFInstrument] = useState('');
  const [fDay, setFDay] = useState('');
  const [fUrgency, setFUrgency] = useState('');
  const [sortBy, setSortBy] = useState<SortBy>('last_name');
  const [error, setError] = useState('');
  const [, startTransition] = useTransition();

  useEffect(() => setCards(initial), [initial]);

  const query = q.trim();
  const instruments = [...new Set(cards.flatMap((c) => c.items.map((i) => i.instrument)).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, 'he'));
  const days = [...new Set(cards.flatMap((c) => c.familyDays))].sort();
  const visible = cards.filter((c) =>
    (!query || c.title.includes(query) || c.entries.some((e) => e.reason.includes(query)) ||
      c.contacts.some((x) => x.phone.includes(query) || x.name.includes(query))) &&
    (!fUrgency || c.entries.some((e) => e.urgency === fUrgency)) &&
    // כלי ויום יחד: באותו שיבוץ. יום לבד: מספיק שאחד האחים לומד ביום הזה
    (!fInstrument ? !fDay || c.familyDays.includes(Number(fDay)) : c.items.some((i) =>
      i.instrument === fInstrument && (!fDay || i.weekday === Number(fDay)))));

  function run(action: () => Promise<{ ok: true } | { ok: false; error: string }>, before: InquiryCard[]) {
    setError('');
    startTransition(async () => {
      const res = await action();
      if (!res.ok) {
        setCards(before);
        setError(res.error);
      } else {
        router.refresh();
      }
    });
  }

  function place(key: string, status: InquiryStatus) {
    setDragKey(null);
    setOver(null);
    const card = cards.find((c) => c.key === key);
    if (!card || card.status === status) return;
    const before = cards;
    const now = new Date().toISOString();
    setCards(cards.map((c) => (c.key !== key ? c :
      status === 'to_call' ? { ...c, status } :
      status === 'no_answer' ? { ...c, status, attempts: c.attempts + 1, lastCall: now } :
      { ...c, status, attempts: 0, lastCall: now })));
    run(() => moveInquiries(card.ids, status), before);
  }

  function remove(key: string, id: number) {
    if (!window.confirm('למחוק את הבירור הזה מהרשימה?')) return;
    const before = cards;
    setCards(cards.flatMap((c) => {
      if (c.key !== key) return [c];
      const entries = c.entries.filter((e) => e.id !== id);
      return entries.length ? [{ ...c, entries, ids: c.ids.filter((x) => x !== id) }] : [];
    }));
    run(() => deleteInquiry(id), before);
  }

  return (
    <>
      <div className="task-toolbar call-toolbar">
        <input
          type="search" className="call-search" placeholder="חיפוש לפי שם, טלפון או סיבה"
          value={q} onChange={(e) => setQ(e.target.value)} aria-label="חיפוש"
        />
        <select value={fUrgency} onChange={(e) => setFUrgency(e.target.value)} aria-label="סינון לפי דחיפות">
          <option value="">כל רמות הדחיפות</option>
          {URGENCIES.map((u) => <option key={u} value={u}>{URGENCY_LABELS[u]}</option>)}
        </select>
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
        {(fInstrument || fDay || fUrgency || q) && (
          <button type="button" className="btn btn-xs btn-ghost" onClick={() => { setQ(''); setFInstrument(''); setFDay(''); setFUrgency(''); }}>
            ניקוי סינון
          </button>
        )}
        {error && <span className="flash flash-error" role="alert">{error}</span>}
      </div>

      <div className="kanban kanban-calls">
        {INQUIRY_STATUSES.map((column) => {
          const list = sortColumn(column, visible.filter((c) => c.status === column), sortBy);
          return (
            <section
              key={column}
              className={`kanban-col kanban-call-${column} ${over === column ? 'over' : ''}`}
              onDragOver={(e) => {
                if (dragKey == null) return;
                e.preventDefault();
                if (over !== column) setOver(column);
              }}
              onDragLeave={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node)) setOver(null);
              }}
              onDrop={(e) => {
                e.preventDefault();
                if (dragKey != null) place(dragKey, column);
              }}
            >
              <header className="kanban-head">
                <h2>{INQUIRY_STATUS_LABELS[column]}</h2>
                <span className="kanban-count">{list.length}</span>
              </header>
              <div className="kanban-cards">
                {list.length === 0 && (
                  <p className="empty">{column === 'to_call' ? 'מוסיפים מכרטיס התלמיד/ה: ☎ טלפון לבירור' : 'אין כאן בירורים'}</p>
                )}
                {list.map((c) => {
                  const family = c.members.length > 1;
                  return (
                    <article
                      key={c.key}
                      className={`task-card call-card ${dragKey === c.key ? 'dragging' : ''}`}
                      draggable
                      onDragStart={(e) => { setDragKey(c.key); e.dataTransfer.effectAllowed = 'move'; }}
                      onDragEnd={() => { setDragKey(null); setOver(null); }}
                    >
                      <div className="task-card-top">
                        {family
                          ? <span className="task-title">{c.title}</span>
                          : <Link href={`/students/${c.members[0].id}`} className="task-title" draggable={false}>{c.title}</Link>}
                        {c.status === 'no_answer' && c.attempts > 0 && (
                          <span className="badge badge-pending">לא ענו ×{c.attempts}</span>
                        )}
                      </div>

                      <ul className="inquiry-reasons">
                        {c.entries.map((e) => (
                          <li key={e.id}>
                            <span className={`inquiry-urgency-tag urgency-${e.urgency}`}>{URGENCY_LABELS[e.urgency]}</span>
                            <span className="inquiry-reason">{family ? `${e.firstName}: ` : ''}{e.reason}</span>
                            <button
                              type="button" className="chip-x" draggable={false}
                              aria-label={`מחיקת הבירור: ${e.reason}`} onClick={() => remove(c.key, e.id)}
                            >✕</button>
                          </li>
                        ))}
                      </ul>

                      {c.members.map((m) => (
                        <div key={m.id} className={family ? 'family-member' : ''}>
                          {family && <Link href={`/students/${m.id}`} className="family-member-name" draggable={false}>{m.firstName}</Link>}
                          <ul className="inquiry-checks">
                            {m.checklist.map((i) => (
                              <li key={i.key} className={i.ok ? 'ok' : 'no'}>{i.ok ? '✓' : '✗'} {i.text}</li>
                            ))}
                          </ul>
                        </div>
                      ))}

                      {c.contacts.length === 0 ? <p className="call-phone muted">אין טלפון</p> : c.contacts.map((x) => (
                        <p key={x.id} className="call-phone">
                          {x.name}{x.relation ? ` (${x.relation})` : ''} ·{' '}
                          <a href={`tel:${x.phone}`} dir="ltr" draggable={false}>{x.phone}</a>
                        </p>
                      ))}

                      {c.lastCall && c.status !== 'to_call' && (
                        <p className="task-due">שיחה אחרונה: {when(c.lastCall)}</p>
                      )}

                      {/* העברה בלחיצה (גם בטלפון, בלי גרירה) */}
                      <div className="task-move">
                        <FamilyInfo title={c.title} members={c.info} />
                        {INQUIRY_STATUSES.filter((s) => s !== c.status).map((s) => (
                          <button key={s} type="button" className="btn btn-xs btn-ghost" onClick={() => place(c.key, s)}>
                            ← {INQUIRY_STATUS_LABELS[s]}
                          </button>
                        ))}
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
    </>
  );
}
