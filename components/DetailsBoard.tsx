'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useTransition } from 'react';
import { FamilyInfo, type FamilyInfoMember } from '@/components/FamilyInfo';
import { moveFollowup, receiveDetail, saveFollowupNote, type FollowupState } from '@/lib/actions/calls';
import { DAYS, HEALTH_FUND_LABELS, PAYMENT_TRACK_LABELS, PAYMENT_TRACKS, type HealthFund } from '@/lib/constants';
import { DETAILS_TOPIC, MISSING_KEYS, MISSING_LABELS, type MissingKey } from '@/lib/missingDetails';

/** כרטיס אחד למשפחה (או לתלמיד/ה בלי אחים), עם מה שחסר לכל ילד/ה */
export type DetailsCard = {
  key: string; title: string; lastName: string; firstName: string;
  state: FollowupState; attempts: number; lastCall: string | null; note: string;
  members: { id: number; name: string; firstName: string; fund: HealthFund | null; missing: MissingKey[] }[];
  /** עוד סיבות להתקשר לאותה משפחה, כדי לסגור הכול בשיחה אחת */
  alsoAbout: string[];
  contacts: { id: number; name: string; relation: string; phone: string }[];
  /** ימי הלימוד של כל המשפחה */
  days: number[];
  info: FamilyInfoMember[];
};

/** פרטים שבדרך כלל זהים לכל המשפחה: אפשר לסמן לכל האחים בלחיצה */
const FAMILY_WIDE: MissingKey[] = ['contract', 'card'];

const COLUMNS: FollowupState[] = ['to_call', 'no_answer', 'waiting'];
const COLUMN_LABELS: Record<FollowupState, string> = {
  to_call: 'צריך להתקשר',
  no_answer: 'לא ענו',
  waiting: 'ענו - מחכים לפרטים',
};

const when = (iso: string) =>
  new Date(iso).toLocaleString('he-IL', {
    timeZone: 'Asia/Jerusalem', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  });

const byLastName = (a: DetailsCard, b: DetailsCard) =>
  (a.lastName ?? '').localeCompare(b.lastName ?? '', 'he') || (a.firstName ?? '').localeCompare(b.firstName ?? '', 'he');

/** לא ענו / מחכים: מי שהתקשרנו אליו הכי מזמן למעלה */
const sortColumn = (column: FollowupState, cards: DetailsCard[]) => {
  const t = (c: DetailsCard) => (c.lastCall ? Date.parse(c.lastCall) : 0);
  return [...cards].sort((a, b) => (column === 'to_call' ? byLastName(a, b) : t(a) - t(b) || byLastName(a, b)));
};

const ids = (c: DetailsCard) => c.members.map((m) => m.id);

export function DetailsBoard({ cards: initial }: { cards: DetailsCard[] }) {
  const router = useRouter();
  const [cards, setCards] = useState(initial);
  const [dragKey, setDragKey] = useState<string | null>(null);
  const [over, setOver] = useState<FollowupState | null>(null);
  const [q, setQ] = useState('');
  const [fMissing, setFMissing] = useState('');
  const [fFund, setFFund] = useState('');
  const [fDay, setFDay] = useState('');
  const [error, setError] = useState('');
  const [, startTransition] = useTransition();

  useEffect(() => setCards(initial), [initial]);

  const query = q.trim();
  const days = [...new Set(cards.flatMap((c) => c.days))].sort();
  const visible = cards.filter((c) =>
    (!query || c.title.includes(query) || c.members.some((m) => m.name.includes(query)) ||
      c.contacts.some((x) => x.phone.includes(query) || x.name.includes(query))) &&
    (!fMissing || c.members.some((m) => m.missing.includes(fMissing as MissingKey))) &&
    (!fFund || c.members.some((m) => (fFund === 'none' ? !m.fund : m.fund === fFund))) &&
    // מספיק שאחד האחים לומד ביום הזה
    (!fDay || c.days.includes(Number(fDay))));

  function run(action: () => Promise<{ ok: true } | { ok: false; error: string }>, before: DetailsCard[]) {
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

  function place(key: string, state: FollowupState) {
    setDragKey(null);
    setOver(null);
    const card = cards.find((c) => c.key === key);
    if (!card || card.state === state) return;
    const now = new Date().toISOString();
    const before = cards;
    setCards(cards.map((c) => (c.key !== key ? c :
      state === 'to_call' ? { ...c, state, attempts: 0 } :
      state === 'no_answer' ? { ...c, state, attempts: c.attempts + 1, lastCall: now } :
      { ...c, state, lastCall: now })));
    run(() => moveFollowup(ids(card), DETAILS_TOPIC, state), before);
  }

  /** פרט שהתקבל, לילד/ה אחד/ת או לכמה אחים */
  function receive(cardKey: string, studentIds: number[], key: MissingKey, value = '') {
    const before = cards;
    setCards(cards.flatMap((c) => {
      if (c.key !== cardKey) return [c];
      const members = c.members.map((m) => (studentIds.includes(m.id) ? { ...m, missing: m.missing.filter((k) => k !== key) } : m));
      // קופה שנבחרה עכשיו (מכבי / כללית) מוסיפה ת"ז והפניה - יתעדכן מהשרת
      const left = members.some((m) => m.missing.length) || key === 'health_fund';
      return left ? [{ ...c, members }] : [];
    }));
    run(() => receiveDetail(studentIds, key, value), before);
  }

  function saveNote(key: string, note: string) {
    const card = cards.find((c) => c.key === key);
    if (!card || card.note === note.trim()) return;
    const before = cards;
    setCards(cards.map((c) => (c.key === key ? { ...c, note: note.trim() } : c)));
    run(() => saveFollowupNote(ids(card), DETAILS_TOPIC, note), before);
  }

  return (
    <>
      <div className="task-toolbar call-toolbar">
        <input
          type="search" className="call-search" placeholder="חיפוש לפי שם או טלפון"
          value={q} onChange={(e) => setQ(e.target.value)} aria-label="חיפוש"
        />
        <select value={fMissing} onChange={(e) => setFMissing(e.target.value)} aria-label="סינון לפי מה שחסר">
          <option value="">כל מה שחסר</option>
          {MISSING_KEYS.map((k) => <option key={k} value={k}>חסר: {MISSING_LABELS[k]}</option>)}
        </select>
        <select value={fFund} onChange={(e) => setFFund(e.target.value)} aria-label="סינון לפי קופה">
          <option value="">כל הקופות</option>
          {(Object.keys(HEALTH_FUND_LABELS) as HealthFund[]).map((f) => <option key={f} value={f}>{HEALTH_FUND_LABELS[f]}</option>)}
          <option value="none">קופה לא ידועה</option>
        </select>
        <select value={fDay} onChange={(e) => setFDay(e.target.value)} aria-label="סינון לפי יום">
          <option value="">כל הימים</option>
          {days.map((d) => <option key={d} value={d}>{DAYS[d]}</option>)}
        </select>
        {(fMissing || fFund || fDay || q) && (
          <button type="button" className="btn btn-xs btn-ghost" onClick={() => { setQ(''); setFMissing(''); setFFund(''); setFDay(''); }}>
            ניקוי סינון
          </button>
        )}
        {error && <span className="flash flash-error" role="alert">{error}</span>}
      </div>

      <div className="kanban kanban-details">
        {COLUMNS.map((column) => {
          const list = sortColumn(column, visible.filter((c) => c.state === column));
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
                <h2>{COLUMN_LABELS[column]}</h2>
                <span className="kanban-count">{list.length}</span>
              </header>
              <div className="kanban-cards">
                {list.length === 0 && <p className="empty">אין כאן תלמידים</p>}
                {list.map((c) => {
                  const family = c.members.length > 1;
                  // לכל האחים: רק כשחסר ליותר מאחד/ת
                  const wide = FAMILY_WIDE.filter((k) => c.members.filter((m) => m.missing.includes(k)).length > 1);
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
                        {!family && c.members[0].fund && <span className="chip chip-plain">{HEALTH_FUND_LABELS[c.members[0].fund]}</span>}
                        {c.state === 'no_answer' && c.attempts > 0 && (
                          <span className="badge badge-pending">לא ענו ×{c.attempts}</span>
                        )}
                      </div>

                      {wide.length > 0 && (
                        <ul className="missing-list">
                          {wide.map((k) => {
                            const who = c.members.filter((m) => m.missing.includes(k)).map((m) => m.id);
                            return (
                              <li key={k} className="missing-family">
                                <span>{MISSING_LABELS[k]} - לכל האחים</span>
                                <button type="button" className="btn btn-xs" onClick={() => receive(c.key, who, k)}>✓ לכולם</button>
                              </li>
                            );
                          })}
                        </ul>
                      )}

                      {c.members.map((m) => (
                        <div key={m.id} className={family ? 'family-member' : ''}>
                          {family && (
                            <Link href={`/students/${m.id}`} className="family-member-name" draggable={false}>
                              {m.firstName}{m.fund ? ` · ${HEALTH_FUND_LABELS[m.fund]}` : ''}
                            </Link>
                          )}
                          {m.missing.length > 0 ? (
                            <ul className="missing-list">
                              {m.missing.map((k) => (
                                <li key={k}>
                                  <span>{MISSING_LABELS[k]}</span>
                                  <MissingInput onReceive={(v) => receive(c.key, [m.id], k, v)} k={k} />
                                </li>
                              ))}
                            </ul>
                          ) : <p className="muted call-phone">✓ לא חסר כלום</p>}
                        </div>
                      ))}

                      {c.alsoAbout.length > 0 && (
                        <p className="call-also">גם בשיחה: {c.alsoAbout.join(' · ')}</p>
                      )}

                      {c.contacts.length === 0 ? <p className="call-phone muted">אין טלפון</p> : c.contacts.map((x) => (
                        <p key={x.id} className="call-phone">
                          {x.name}{x.relation ? ` (${x.relation})` : ''} ·{' '}
                          <a href={`tel:${x.phone}`} dir="ltr" draggable={false}>{x.phone}</a>
                        </p>
                      ))}

                      <input
                        key={c.note} className="call-note" defaultValue={c.note} placeholder="מה ענו / מתי לחזור"
                        aria-label="הערה לשיחה" draggable={false}
                        onBlur={(e) => saveNote(c.key, e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                      />

                      {c.lastCall && c.state !== 'to_call' && (
                        <p className="task-due">שיחה אחרונה: {when(c.lastCall)}</p>
                      )}

                      <div className="task-move">
                        <FamilyInfo title={c.title} members={c.info} />
                        {COLUMNS.filter((s) => s !== c.state).map((s) => (
                          <button key={s} type="button" className="btn btn-xs btn-ghost" onClick={() => place(c.key, s)}>
                            ← {COLUMN_LABELS[s]}
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

/** סימון פרט שהתקבל: כפתור, או שדה / בחירה כשצריך ערך */
function MissingInput({ k, onReceive }: { k: MissingKey; onReceive: (value?: string) => void }) {
  const [id, setId] = useState('');
  if (k === 'id_number' || k === 'email') {
    return (
      <form className="missing-id" onSubmit={(e) => { e.preventDefault(); if (id.trim()) onReceive(id); }}>
        <input
          value={id} onChange={(e) => setId(e.target.value)} dir="ltr" aria-label={MISSING_LABELS[k]}
          {...(k === 'email' ? { type: 'email', placeholder: 'כתובת' } : { inputMode: 'numeric' as const, placeholder: 'מספר' })}
        />
        <button type="submit" className="btn btn-xs" disabled={!id.trim()}>✓</button>
        {k === 'email' && <button type="button" className="btn btn-xs btn-ghost" onClick={() => onReceive('none')}>אין</button>}
      </form>
    );
  }
  if (k === 'payment_track' || k === 'health_fund') {
    const options = k === 'payment_track'
      ? PAYMENT_TRACKS.filter((t) => t !== 'unknown').map((t) => [t, PAYMENT_TRACK_LABELS[t]] as const)
      : (Object.keys(HEALTH_FUND_LABELS) as HealthFund[]).map((f) => [f, HEALTH_FUND_LABELS[f]] as const);
    return (
      <select defaultValue="" onChange={(e) => e.target.value && onReceive(e.target.value)} aria-label={MISSING_LABELS[k]}>
        <option value="">בחירה…</option>
        {options.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
      </select>
    );
  }
  return <button type="button" className="btn btn-xs" onClick={() => onReceive()}>✓ התקבל</button>;
}
