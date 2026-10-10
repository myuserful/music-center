import { Nav } from '@/components/Nav';
import { logout } from '@/lib/actions/settings';
import { LOCAL_NO_AUTH } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  let username = '';
  if (!LOCAL_NO_AUTH) {
    const db = await createClient();
    const { data } = await db.auth.getClaims();
    username = data?.claims.email ?? '';
  }

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <img src="/logo.png" alt="מקצב · קצב אחד קדימה" width={339} height={223} />
        </div>
        <div className="eq-strip" aria-hidden />
        <Nav />
        {LOCAL_NO_AUTH ? (
          <div className="user-box"><span>מצב מקומי, בלי התחברות</span></div>
        ) : (
          <form action={logout} className="user-box">
            <span>{username}</span>
            <button className="btn btn-ghost btn-xs">יציאה</button>
          </form>
        )}
      </aside>
      <main className="main">{children}</main>
    </div>
  );
}
