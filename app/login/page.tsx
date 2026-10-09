import { Flash, type SP } from '@/components/ui';
import { login } from '@/lib/actions/settings';

export default async function LoginPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  return (
    <div className="login-wrap">
      <form action={login} className="card login-card">
        <div className="login-brand">
          <svg viewBox="0 0 64 64" width="56" height="56" aria-hidden><rect width="64" height="64" rx="16" fill="var(--brand)" /><path d="M14 40h8l5-16 8 26 6-18 3 8h6" fill="none" stroke="#fff" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" /></svg>
          <h1>מקצב</h1>
          <p className="muted">קצב אחד קדימה · כניסת צוות</p>
        </div>
        <Flash sp={sp} />
        <label>
          שם משתמש
          <input name="username" required autoComplete="username" dir="ltr" />
        </label>
        <label>
          סיסמה
          <input name="password" type="password" required autoComplete="current-password" dir="ltr" />
        </label>
        <button className="btn btn-primary btn-block">כניסה</button>
      </form>
    </div>
  );
}
