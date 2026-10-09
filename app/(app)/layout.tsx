import { Nav } from '@/components/Nav';
import { logout } from '@/lib/actions/settings';
import { createClient } from '@/lib/supabase/server';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  const username = user?.email?.split('@')[0] ?? '';

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark" aria-hidden>
            <svg viewBox="0 0 64 64" width="36" height="36"><rect width="64" height="64" rx="16" fill="currentColor" /><path d="M14 40h8l5-16 8 26 6-18 3 8h6" fill="none" stroke="#fff" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </span>
          <div>
            <div className="brand-name">מקצב</div>
            <div className="brand-slogan">קצב אחד קדימה</div>
          </div>
        </div>
        <Nav />
        <form action={logout} className="user-box">
          <span>{username}</span>
          <button className="btn btn-ghost btn-xs">יציאה</button>
        </form>
      </aside>
      <main className="main">{children}</main>
    </div>
  );
}
