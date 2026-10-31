'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useTransition } from 'react';
import { linkSiblings, rejectSiblings } from '@/lib/actions/siblings';

export type SuggestionView = {
  key: string; sure: boolean; phones: string[];
  students: { id: number; name: string; status: string; familyId: number | null; contacts: string[] }[];
};

type Result = { ok: true } | { ok: false; error: string };

export function SiblingSuggestions({ suggestions: initial }: { suggestions: SuggestionView[] }) {
  const router = useRouter();
  const [list, setList] = useState(initial);
  // מי לא מסומן בכל הצעה (ברירת מחדל: כולם מסומנים)
  const [off, setOff] = useState<Set<string>>(new Set());
  const [error, setError] = useState('');
  const [busy, startTransition] = useTransition();

  useEffect(() => setList(initial), [initial]);

  const chosen = (g: SuggestionView) => g.students.filter((s) => !off.has(`${g.key}:${s.id}`)).map((s) => s.id);

  function act(keys: string[], action: () => Promise<Result>) {
    const before = list;
    setList(list.filter((g) => !keys.includes(g.key)));
    setError('');
    startTransition(async () => {
      const res = await action();
      if (!res.ok) {
        setList(before);
        setError(res.error);
      } else {
        router.refresh();
      }
    });
  }

  async function linkAll(groups: SuggestionView[]): Promise<Result> {
    for (const g of groups) {
      const res = await linkSiblings(g.students.map((s) => s.id));
      if (!res.ok) return res;
    }
    return { ok: true };
  }

  function toggle(k: string) {
    setOff((o) => {
      const n = new Set(o);
      if (n.has(k)) n.delete(k); else n.add(k);
      return n;
    });
  }

  const sure = list.filter((g) => g.sure);
  const doubt = list.filter((g) => !g.sure);

  const group = (g: SuggestionView) => {
    const ids = chosen(g);
    return (
      <article key={g.key} className="card sibling-group">
        <ul className="sibling-students">
          {g.students.map((s) => {
            const k = `${g.key}:${s.id}`;
            return (
              <li key={s.id}>
                <label className="check">
                  <input type="checkbox" checked={!off.has(k)} onChange={() => toggle(k)} />
                  <Link href={`/students/${s.id}`}><strong>{s.name}</strong></Link>
                </label>
                <span className="chip chip-plain">{s.status}</span>
                {s.familyId != null && <span className="chip">כבר במשפחה</span>}
                <span className="muted sibling-contacts" dir="auto">{s.contacts.join(' · ')}</span>
              </li>
            );
          })}
        </ul>
        <div className="sibling-actions">
          <button
            type="button" className="btn btn-xs btn-primary" disabled={busy || ids.length < 2}
            onClick={() => act([g.key], () => linkSiblings(ids))}
          >
            ✓ אחים{ids.length < g.students.length ? ` (${ids.length} המסומנים)` : ''}
          </button>
          <button
            type="button" className="btn btn-xs btn-ghost" disabled={busy}
            onClick={() => act([g.key], () => rejectSiblings(g.students.map((s) => s.id)))}
          >
            ✗ לא אחים
          </button>
        </div>
      </article>
    );
  };

  return (
    <>
      {error && <div className="flash flash-error" role="alert">{error}</div>}
      {list.length === 0 && <p className="empty">אין הצעות חדשות. כל מי שחולקים טלפון כבר סומנו.</p>}

      {sure.length > 0 && (
        <section className="sibling-section">
          <header className="sibling-head">
            <h2>אותו שם משפחה ({sure.length})</h2>
            <button
              type="button" className="btn btn-sm btn-primary" disabled={busy}
              onClick={() => act(sure.map((g) => g.key), () => linkAll(sure))}
            >
              ✓ לאשר את כולם
            </button>
          </header>
          <div className="sibling-grid">{sure.map(group)}</div>
        </section>
      )}

      {doubt.length > 0 && (
        <section className="sibling-section">
          <header className="sibling-head">
            <h2>לבדיקה: שם משפחה שונה ({doubt.length})</h2>
          </header>
          <p className="muted">אפשר להוריד סימון ממי שלא שייך/ת (למשל טלפון של סבתא) ולאשר רק את השאר.</p>
          <div className="sibling-grid">{doubt.map(group)}</div>
        </section>
      )}
    </>
  );
}
