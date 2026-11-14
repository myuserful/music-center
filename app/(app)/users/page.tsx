import { ConfirmButton } from '@/components/ConfirmButton';
import { Empty, Flash, PageHead, type SP } from '@/components/ui';
import { addUser, removeUserAccess, setUserRole } from '@/lib/actions/users';
import { LOCAL_NO_AUTH } from '@/lib/auth';
import { ROLE_LABELS, type Role } from '@/lib/roles';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

const dmy = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleDateString('he-IL', { timeZone: 'Asia/Jerusalem' }) : '—';

export default async function UsersPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const admin = createAdminClient();

  let me = '';
  if (!LOCAL_NO_AUTH) {
    const { data } = await (await createClient()).auth.getClaims();
    me = data?.claims.sub ?? '';
  }

  if (!admin) {
    return (
      <>
        <PageHead title="משתמשים והרשאות" />
        <section className="card">
          <p>כדי לנהל משתמשים צריך להגדיר בשרת את <code>SUPABASE_SECRET_KEY</code>.</p>
          <p className="muted">ב-Vercel: Settings › Environment Variables. המפתח נמצא ב-Supabase: Project Settings › API Keys › Secret keys.</p>
        </section>
      </>
    );
  }

  const [{ data: list, error }, { data: roles, error: re }] = await Promise.all([
    admin.auth.admin.listUsers({ perPage: 1000 }),
    admin.from('user_roles').select('user_id, role'),
  ]);
  const roleOf = new Map(((roles ?? []) as { user_id: string; role: Role }[]).map((r) => [r.user_id, r.role]));
  const users = (list?.users ?? [])
    .map((u) => ({ id: u.id, email: u.email ?? '', lastSignIn: u.last_sign_in_at, role: roleOf.get(u.id) ?? null }))
    .sort((a, b) => Number(!a.role) - Number(!b.role) || a.email.localeCompare(b.email));

  return (
    <>
      <PageHead title="משתמשים והרשאות" sub="מי יכול להיכנס למערכת ומה כל אחד רואה" />
      <Flash sp={sp} />
      {(error || re) && (
        <div className="flash flash-error" role="alert">
          {re?.code === '42P01' || re?.code === 'PGRST205'
            ? 'צריך להריץ את 0063_roles.sql ב-Supabase'
            : (error ?? re)!.message}
        </div>
      )}

      <section className="card">
        <h2>הוספת משתמש</h2>
        <form action={addUser} className="row-form">
          <label>מייל<input name="email" type="email" required dir="ltr" /></label>
          <label>
            תפקיד
            <select name="role" defaultValue="secretary">
              <option value="secretary">{ROLE_LABELS.secretary}</option>
              <option value="admin">{ROLE_LABELS.admin}</option>
            </select>
          </label>
          <button className="btn btn-primary">הוספה</button>
        </form>
        <p className="muted">לא נשלח מייל. המשתמש נכנס במסך הכניסה הרגיל עם המייל הזה, ומקבל שם קישור כניסה.</p>
      </section>

      <section className="card table-wrap">
        <h2>משתמשים ({users.length})</h2>
        {users.length === 0 ? <Empty>אין משתמשים</Empty> : (
          <table className="day-table">
            <thead><tr><th>מייל</th><th>תפקיד</th><th>כניסה אחרונה</th><th /></tr></thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td dir="ltr" style={{ textAlign: 'right' }}>
                    {u.email}
                    {u.id === me && <span className="muted"> (את/ה)</span>}
                  </td>
                  <td>
                    {u.id === me ? ROLE_LABELS[u.role ?? 'admin'] : (
                      <form action={setUserRole} className="row-form">
                        <input type="hidden" name="user_id" value={u.id} />
                        <select name="role" defaultValue={u.role ?? ''}>
                          {!u.role && <option value="" disabled>אין גישה</option>}
                          {u.role && !['admin', 'secretary'].includes(u.role) && <option value={u.role} disabled>{ROLE_LABELS[u.role]}</option>}
                          <option value="secretary">{ROLE_LABELS.secretary}</option>
                          <option value="admin">{ROLE_LABELS.admin}</option>
                        </select>
                        <button className="btn btn-xs">{u.role ? 'עדכון' : 'מתן גישה'}</button>
                      </form>
                    )}
                  </td>
                  <td className="nowrap">{dmy(u.lastSignIn)}</td>
                  <td>
                    {u.role && u.id !== me && (
                      <form action={removeUserAccess}>
                        <input type="hidden" name="user_id" value={u.id} />
                        <ConfirmButton className="btn btn-xs btn-danger" message={`להסיר את הגישה של ${u.email}? אפשר להחזיר אותה בהמשך`}>הסרת גישה</ConfirmButton>
                      </form>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="card">
        <h2>מה כל תפקיד רואה</h2>
        <ul className="list">
          <li><strong>{ROLE_LABELS.admin}:</strong> הכול, כולל שכר מורים, הכנסות והוצאות, מחירון, מחיקת תשלומים וקבלות, וניהול משתמשים.</li>
          <li><strong>{ROLE_LABELS.secretary}:</strong> כל השאר. רושמת תשלומים ומפיקה קבלות, בלי למחוק.</li>
        </ul>
      </section>
    </>
  );
}
