'use client';

import Link from 'next/link';
import { useRef } from 'react';

/** מה מוצג בחלון הפרטים לכל ילד/ה במשפחה */
export type FamilyInfoMember = {
  id: number; name: string; fund: string; plan: string;
  lessons: { key: string; text: string; status: string }[];
};

/** כפתור "פרטים" בכרטיס שיחה: קופה ושיעורים משובצים של כל האחים */
export function FamilyInfo({ title, members }: { title: string; members: FamilyInfoMember[] }) {
  const dialog = useRef<HTMLDialogElement>(null);
  return (
    <>
      <button type="button" className="btn btn-xs btn-ghost" draggable={false} onClick={() => dialog.current?.showModal()}>
        ⓘ פרטים
      </button>
      <dialog
        ref={dialog} className="receipt-dialog family-info"
        onClick={(e) => e.target === dialog.current && dialog.current.close()}
      >
        <div className="family-info-head">
          <h2>{title}</h2>
          <button type="button" className="btn btn-ghost btn-xs" onClick={() => dialog.current?.close()}>סגירה</button>
        </div>
        {members.map((m) => (
          <section key={m.id} className="family-info-member">
            <h3><Link href={`/students/${m.id}`}>{m.name}</Link></h3>
            <p>
              <span className="muted">קופת חולים: </span>
              {m.fund || 'לא ידוע'}{m.plan ? ` · ${m.plan}` : ''}
            </p>
            {m.lessons.length === 0 ? <p className="muted">אין שיעורים משובצים</p> : (
              <ul>
                {m.lessons.map((l) => (
                  <li key={l.key}>{l.text} <span className="muted">({l.status})</span></li>
                ))}
              </ul>
            )}
          </section>
        ))}
      </dialog>
    </>
  );
}
