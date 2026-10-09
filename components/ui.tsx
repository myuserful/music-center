import Link from 'next/link';
import { STATUS_LABELS, STATUSES, type Status } from '@/lib/constants';
import type { Branch, Room } from '@/lib/types';
import { ConfirmButton } from './ConfirmButton';

export type SP = Promise<Record<string, string | string[] | undefined>>;

export const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? '';

export function Flash({ sp }: { sp: Record<string, string | string[] | undefined> }) {
  const error = one(sp.error);
  const ok = one(sp.ok);
  if (error) return <div className="flash flash-error" role="alert">{error}</div>;
  if (ok) return <div className="flash flash-ok" role="status">{ok}</div>;
  return null;
}

export function PageHead({ title, sub, children }: { title: string; sub?: string; children?: React.ReactNode }) {
  return (
    <header className="page-head">
      <div>
        <h1>{title}</h1>
        {sub && <p className="muted">{sub}</p>}
      </div>
      {children && <div className="actions">{children}</div>}
    </header>
  );
}

export function StatusBadge({ status }: { status: Status }) {
  return <span className={`badge badge-${status}`}>{STATUS_LABELS[status]}</span>;
}

/** כפתורי סטטוס + סירוב (מחיקה) לשיבוץ */
export function StatusActions({
  id, status, back, setAction, deleteAction,
}: {
  id: number; status: Status; back: string;
  setAction: (fd: FormData) => Promise<void>; deleteAction: (fd: FormData) => Promise<void>;
}) {
  return (
    <div className="status-actions">
      {STATUSES.filter((s) => s !== status).map((s) => (
        <form key={s} action={setAction}>
          <input type="hidden" name="id" value={id} />
          <input type="hidden" name="status" value={s} />
          <input type="hidden" name="back" value={back} />
          <button className={`btn btn-xs btn-${s}`}>{s === 'confirmed' ? 'אישור הורים ✓' : STATUS_LABELS[s]}</button>
        </form>
      ))}
      <form action={deleteAction}>
        <input type="hidden" name="id" value={id} />
        <input type="hidden" name="back" value={back} />
        <ConfirmButton className="btn btn-xs btn-danger" message="לבטל את השיבוץ? (סירוב הורים)">סירוב</ConfirmButton>
      </form>
    </div>
  );
}

export function RoomOptions({ branches, rooms }: { branches: Branch[]; rooms: Room[] }) {
  return (
    <>
      {branches.map((b) => (
        <optgroup key={b.id} label={b.name}>
          {rooms.filter((r) => r.branch_id === b.id).map((r) => (
            <option key={r.id} value={r.id}>{r.name} ({b.name})</option>
          ))}
        </optgroup>
      ))}
    </>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <p className="empty">{children}</p>;
}

export function BackLink({ href, children }: { href: string; children: React.ReactNode }) {
  return <Link href={href} className="back-link">→ {children}</Link>;
}
