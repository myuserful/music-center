import { Flash, one, type SP } from '@/components/ui';
import { login } from '@/lib/actions/settings';

export default async function LoginPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const sent = !!one(sp.ok);
  return (
    <div className="login-wrap">
      <form action={login} className="card login-card">
        <div className="login-brand">
          <img src="/logo.png" alt="מקצב · קצב אחד קדימה" width={339} height={223} />
          <p className="muted">כניסת צוות</p>
        </div>
        <Flash sp={sp} />
        <label>
          מייל
          <input name="email" type="email" required autoComplete="email" dir="ltr" />
        </label>
        <button className="btn btn-primary btn-block">{sent ? 'שליחה מחדש' : 'שליחת קישור כניסה'}</button>
        <p className="muted" style={{ textAlign: 'center', fontSize: '0.85rem' }}>
          נשלח אלייך מייל עם קישור. לוחצים עליו ונכנסים, בלי סיסמה.
        </p>
      </form>
    </div>
  );
}
