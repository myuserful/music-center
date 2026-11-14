import { Flash, PageHead, type SP } from '@/components/ui';
import { saveRolePermissions } from '@/lib/actions/permissions';
import { ACTIONS, DEFAULT_SECRETARY, EDITABLE_ROLES, SCREENS } from '@/lib/permissions';
import { ROLE_LABELS } from '@/lib/roles';
import { createClient } from '@/lib/supabase/server';

export default async function PermissionsPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const db = await createClient();
  const { data, error } = await db.from('role_permissions').select('role, perm');
  const missing = error && (error.code === '42P01' || error.code === 'PGRST205');
  const has = (role: string, perm: string) =>
    missing ? role === 'secretary' && DEFAULT_SECRETARY.includes(perm) : (data ?? []).some((r) => r.role === role && r.perm === perm);

  return (
    <>
      <PageHead title="הרשאות" sub="מה כל תפקיד רואה ומה מותר לו לעשות. מנהל תמיד רואה הכול." />
      <Flash sp={sp} />
      {missing && <div className="flash flash-error" role="alert">צריך להריץ את 0064_role_permissions.sql ב-Supabase. עד אז מוצגת ברירת המחדל, ואי אפשר לשמור.</div>}
      {error && !missing && <div className="flash flash-error" role="alert">{error.message}</div>}

      {EDITABLE_ROLES.map((role) => (
        <form key={role} action={saveRolePermissions} className="card">
          <input type="hidden" name="role" value={role} />
          <h2>{ROLE_LABELS[role]}</h2>

          <h3 style={{ margin: '12px 0 6px' }}>מסכים</h3>
          <div className="perm-grid">
            {SCREENS.map((s) => (
              <label key={s.perm} className="check">
                <input type="checkbox" name={`perm_${s.perm}`} defaultChecked={has(role, s.perm)} />
                <span aria-hidden>{s.icon}</span> {s.label}
              </label>
            ))}
          </div>

          <h3 style={{ margin: '18px 0 6px' }}>פעולות</h3>
          <div className="perm-grid perm-grid-wide">
            {ACTIONS.map((a) => (
              <label key={a.perm} className="check">
                <input type="checkbox" name={`perm_${a.perm}`} defaultChecked={has(role, a.perm)} />
                {a.label} <span className="muted">({a.hint})</span>
              </label>
            ))}
          </div>

          <p className="muted" style={{ marginTop: 14 }}>
            מסך שלא מסומן נעלם מהתפריט וגם כניסה ישירה אליו חסומה. שכר מורים, הכנסות והוצאות, מחיקות ומחירון חסומים גם במסד הנתונים.
            משתמשים והרשאות: למנהל בלבד.
          </p>
          <div className="form-foot"><button className="btn btn-primary" disabled={!!missing}>שמירה</button></div>
        </form>
      ))}
    </>
  );
}
