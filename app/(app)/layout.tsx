import { Nav } from '@/components/Nav';
import { logout } from '@/lib/actions/settings';
import { LOCAL_NO_AUTH } from '@/lib/auth';
import { getRole, isStaff, ROLE_LABELS } from '@/lib/roles';
import { createClient } from '@/lib/supabase/server';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  let username = '';
  if (!LOCAL_NO_AUTH) {
    const db = await createClient();
    const { data } = await db.auth.getClaims();
    username = data?.claims.email ?? '';
  }

  const role = await getRole();
  if (!isStaff(role)) {
    return (
      <main className="main" style={{ maxWidth: 520, margin: '60px auto' }}>
        <section className="card">
          <h2>אין עדיין גישה למערכת</h2>
          <p>{role ? `לתפקיד ${ROLE_LABELS[role]} עוד אין מסכים במערכת.` : `למשתמש ${username} עוד לא הוגדר תפקיד. צריך לבקש מהמנהל להגדיר אותו.`}</p>
          <form action={logout}><button className="btn">יציאה</button></form>
        </section>
      </main>
    );
  }

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <img src="/logo.png" alt="מקצב · קצב אחד קדימה" width={339} height={223} />
        </div>
        <div className="eq-strip" aria-hidden />
        <Nav admin={role === 'admin'} />
        {LOCAL_NO_AUTH ? (
          <div className="user-box"><span>מצב מקומי, בלי התחברות</span></div>
        ) : (
          <form action={logout} className="user-box">
            <span>{username} · {ROLE_LABELS[role!]}</span>
            <button className="btn btn-ghost btn-xs">יציאה</button>
          </form>
        )}
      </aside>
      <main className="main">{children}</main>
    </div>
  );
}
