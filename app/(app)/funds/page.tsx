import Link from 'next/link';
import { ConfirmButton } from '@/components/ConfirmButton';
import { SendToFundButton } from '@/components/SendToFundButton';
import { Empty, Flash, PageHead, type SP } from '@/components/ui';
import { setFundFlag, setSentMany } from '@/lib/actions/funds';
import { ageLabel } from '@/lib/age';
import { HEALTH_FUND_LABELS, STUDENT_STATUS_LABELS, STUDENT_STATUSES, type HealthFund } from '@/lib/constants';
import { loadAll } from '@/lib/data';
import { queryString } from '@/lib/filters';
import { filterFundStudents, fundFilters, ID_STATE_LABELS, idState, readyToSend } from '@/lib/funds';
import { createClient } from '@/lib/supabase/server';
import { fullName, type Student } from '@/lib/types';

const FUNDS = Object.keys(HEALTH_FUND_LABELS) as HealthFund[];

/** קישור לרשימה המסוננת שבתחתית הדף */
const listHref = (p: Record<string, string>) => `/funds?${new URLSearchParams(p)}#list`;
/** מספר שהוא קישור לסינון, או 0 אפור */
function Num({ n, p, tone }: { n: number; p: Record<string, string>; tone?: 'warn' | 'ok' }) {
  if (n === 0) return <span className="muted">0</span>;
  return <Link href={listHref(p)} className={tone ? `fund-num fund-num-${tone}` : 'fund-num'}>{n}</Link>;
}

export default async function FundsPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const f = fundFilters(sp);
  const db = await createClient();
  const all = await loadAll(db);
  const { maps } = all;

  const current = filterFundStudents(all, fundFilters({})); // פעילים + מתלבטים
  const learning = new Set([...all.lessons.map((l) => l.student_id), ...all.enrollments.map((e) => e.student_id)]);
  const students = filterFundStudents(all, f);
  const here = `/funds${queryString(sp)}`;

  const summarize = (list: Student[]) => {
    const plans = new Map<string, number>();
    for (const s of list) plans.set(s.health_plan, (plans.get(s.health_plan) ?? 0) + 1);
    return {
      count: list.length,
      learning: list.filter((s) => learning.has(s.id)).length,
      referral: list.filter((s) => s.has_referral).length,
      sent: list.filter((s) => s.hmo_reported).length,
      idOk: list.filter((s) => idState(s) === 'ok').length,
      ready: list.filter(readyToSend).length,
      plans: [...plans].sort((a, b) => (a[0] === '' ? 1 : b[0] === '' ? -1 : b[1] - a[1])),
    };
  };
  const funds = FUNDS.map((fund) => ({ fund, ...summarize(current.filter((s) => s.health_fund === fund)) }));
  const noFund = current.filter((s) => !s.health_fund).length;
  const insured = current.filter((s) => s.health_fund && s.health_fund !== 'private');
  const total = summarize(insured);

  // סוגי מנוי לבחירה בסינון: רק של הקופה שנבחרה (אם נבחרה)
  const planOptions = [...new Set(current
    .filter((s) => s.health_plan && (!f.fund || s.health_fund === f.fund))
    .map((s) => s.health_plan))].sort((a, b) => a.localeCompare(b, 'he'));

  const maccabi = funds.find((x) => x.fund === 'maccabi');
  const macReady = maccabi?.ready ?? 0;

  return (
    <>
      <PageHead title="קופות חולים" sub={`${insured.length} תלמידים דרך הקופות · ${total.ready} מוכנים לשליחה`}>
        <a className="btn btn-primary" href="/funds/ids?fund=maccabi&idn=ok" download>הורדת כל הת"ז של מכבי - PDF ({maccabi?.idOk ?? 0})</a>
        <SendToFundButton query="?fund=maccabi&ready=1" count={macReady}
          confirmText={`להוריד את תעודות הזהות של ${macReady} התלמידים המוכנים לשליחה ולסמן את כולם כנשלחו למכבי?`}>
          הורדת ת"ז וסימון כנשלח למכבי ({macReady})
        </SendToFundButton>
      </PageHead>
      <Flash sp={sp} />

      <div className="grid grid-4 dash-tiles">
        {funds.filter((x) => x.count > 0).map((x) => (
          <Link key={x.fund} href={listHref({ fund: x.fund })} className={`stat fund-tile fund-${x.fund}`}>
            <div className="stat-num">{x.count}</div>
            <div className="stat-label">{HEALTH_FUND_LABELS[x.fund]} · {x.learning} לומדים</div>
          </Link>
        ))}
        {noFund > 0 && (
          <Link href={listHref({ fund: 'none' })} className="stat stat-none">
            <div className="stat-num">{noFund}</div>
            <div className="stat-label">לא צוינה קופה</div>
          </Link>
        )}
      </div>

      <section className="card">
        <h2>מצב מול הקופות</h2>
        <p className="muted dash-sub">תלמידים פעילים ומתלבטים. לחיצה על מספר מציגה את התלמידים ברשימה למטה</p>
        <div className="table-wrap">
          <table className="dash-table fund-table">
            <thead>
              <tr>
                <th>קופה</th><th>תלמידים</th><th>לומדים בפועל</th>
                <th>יש הפניה</th><th>חסרה הפניה</th><th>נשלח לקופה</th><th>לא נשלח</th>
                <th>ת"ז תקינה</th><th>ת"ז חסרה / שגויה</th><th>מוכנים לשליחה</th>
              </tr>
            </thead>
            <tbody>
              {funds.filter((x) => x.count > 0).map((x) => {
                const fund = x.fund;
                const isPrivate = fund === 'private';
                return (
                  <tr key={fund}>
                    <td>
                      <strong>{HEALTH_FUND_LABELS[fund]}</strong>
                      {x.plans.length > 0 && !isPrivate && (
                        <div className="fund-plans">
                          {x.plans.map(([plan, n]) => (
                            <Link key={plan} href={listHref({ fund, plan: plan || '-' })} className="chip">
                              {plan || 'סוג מנוי לא ידוע'} {n}
                            </Link>
                          ))}
                        </div>
                      )}
                    </td>
                    <td><Num n={x.count} p={{ fund }} /></td>
                    <td><Num n={x.learning} p={{ fund, assigned: 'yes' }} /></td>
                    {isPrivate ? <td colSpan={7} className="muted">לא רלוונטי לפרטיים</td> : <>
                      <td><Num n={x.referral} p={{ fund, referral: 'yes' }} tone="ok" /></td>
                      <td><Num n={x.count - x.referral} p={{ fund, referral: 'no' }} tone="warn" /></td>
                      <td><Num n={x.sent} p={{ fund, sent: 'yes' }} tone="ok" /></td>
                      <td><Num n={x.count - x.sent} p={{ fund, sent: 'no' }} tone="warn" /></td>
                      <td><Num n={x.idOk} p={{ fund, idn: 'ok' }} tone="ok" /></td>
                      <td><Num n={x.count - x.idOk} p={{ fund, idn: 'not_ok' }} tone="warn" /></td>
                      <td><Num n={x.ready} p={{ fund, ready: '1' }} /></td>
                    </>}
                  </tr>
                );
              })}
              {insured.length > 0 && (
                <tr className="fund-total">
                  <td><strong>סה"כ דרך הקופות</strong></td>
                  <td>{total.count}</td><td>{total.learning}</td>
                  <td>{total.referral}</td><td>{total.count - total.referral}</td>
                  <td>{total.sent}</td><td>{total.count - total.sent}</td>
                  <td>{total.idOk}</td><td>{total.count - total.idOk}</td>
                  <td>{total.ready}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <p className="muted dash-sub">"מוכנים לשליחה" = יש הפניה, ת"ז תקינה ועוד לא נשלח לקופה</p>
      </section>

      <form className="filters card" id="list" action="/funds#list">
        <label>חיפוש (שם, ת"ז, הורה או טלפון)<input name="q" defaultValue={f.q} /></label>
        <label>
          קופה
          <select name="fund" defaultValue={f.fund}>
            <option value="">הכל</option>
            {FUNDS.map((x) => <option key={x} value={x}>{HEALTH_FUND_LABELS[x]}</option>)}
            <option value="none">לא צוינה</option>
          </select>
        </label>
        <label>
          סוג מנוי
          <select name="plan" defaultValue={f.plan}>
            <option value="">הכל</option>
            {planOptions.map((p) => <option key={p} value={p}>{p}</option>)}
            <option value="-">לא ידוע</option>
          </select>
        </label>
        <label>
          הפניה
          <select name="referral" defaultValue={f.referral}>
            <option value="">הכל</option><option value="yes">יש הפניה</option><option value="no">אין הפניה</option>
          </select>
        </label>
        <label>
          נשלח לקופה
          <select name="sent" defaultValue={f.sent}>
            <option value="">הכל</option><option value="yes">נשלח</option><option value="no">לא נשלח</option>
          </select>
        </label>
        <label>
          תעודת זהות
          <select name="idn" defaultValue={f.idn}>
            <option value="">הכל</option>
            <option value="ok">{ID_STATE_LABELS.ok}</option>
            <option value="not_ok">חסרה או לא תקינה</option>
            <option value="missing">{ID_STATE_LABELS.missing}</option>
            <option value="invalid">{ID_STATE_LABELS.invalid}</option>
          </select>
        </label>
        <label>
          שיבוץ
          <select name="assigned" defaultValue={f.assigned}>
            <option value="">הכל</option><option value="yes">לומדים בפועל</option><option value="no">ללא שיבוץ</option>
          </select>
        </label>
        <label>
          סניף
          <select name="branch" defaultValue={f.branch ?? ''}>
            <option value="">הכל</option>
            {all.branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </label>
        <label>
          סטטוס
          <select name="status" defaultValue={f.status}>
            <option value="">פעילים, מתלבטים וממתינים</option>
            {STUDENT_STATUSES.map((x) => <option key={x} value={x}>{STUDENT_STATUS_LABELS[x]}</option>)}
            <option value="all">הכל</option>
          </select>
        </label>
        <label className="check"><input type="checkbox" name="ready" value="1" defaultChecked={f.ready} /> רק מוכנים לשליחה</label>
        <button className="btn">סינון</button>
        <Link href="/funds#list" className="btn btn-ghost">ניקוי</Link>
      </form>

      <section className="card">
        <div className="dash-head">
          <h2>{students.length} תלמידים ברשימה</h2>
          {students.length > 0 && (
            <div className="fund-bulk">
              <a className="btn btn-primary" href={`/funds/export${queryString(sp)}`} download>הורדת הרשימה לאקסל</a>
              <a className="btn" href={`/funds/ids${queryString(sp)}`} download>הורדת הת"ז ל-PDF</a>
              <SendToFundButton query={queryString(sp)} count={students.length}
                confirmText={`להוריד את תעודות הזהות של ${students.length} התלמידים ברשימה ולסמן את כולם כנשלחו לקופה?`}>
                הורדת ת"ז וסימון כל הרשימה כנשלחה
              </SendToFundButton>
              <form action={setSentMany}>
                <input type="hidden" name="ids" value={students.map((s) => s.id).join(',')} />
                <input type="hidden" name="value" value="0" />
                <input type="hidden" name="back" value={here} />
                <ConfirmButton className="btn btn-ghost" message={`לבטל את הסימון "נשלח לקופה" לכל ${students.length} התלמידים ברשימה?`}>
                  ביטול סימון
                </ConfirmButton>
              </form>
            </div>
          )}
        </div>
        <div className="table-wrap">
          {students.length === 0 ? <Empty>לא נמצאו תלמידים</Empty> : (
            <table>
              <thead>
                <tr><th>שם</th><th>ת"ז</th><th>גיל</th><th>קופה</th><th>סוג מנוי</th><th>הפניה</th><th>נשלח לקופה</th><th>הורה</th><th>סניף</th><th>לומד/ת</th></tr>
              </thead>
              <tbody>
                {students.map((s) => {
                  const c = all.primaryContact(s.id);
                  const ids = idState(s);
                  const lessons = all.lessons.filter((l) => l.student_id === s.id);
                  const choirs = all.enrollments.filter((e) => e.student_id === s.id);
                  const flag = (name: 'has_referral' | 'hmo_reported', on: boolean, yes: string, no: string) => (
                    <form action={setFundFlag}>
                      <input type="hidden" name="id" value={s.id} />
                      <input type="hidden" name="flag" value={name} />
                      <input type="hidden" name="value" value={on ? '0' : '1'} />
                      <input type="hidden" name="back" value={here} />
                      <button className={`btn btn-xs ${on ? 'btn-confirmed fund-on' : 'btn-ghost'}`} title="לחיצה משנה">
                        {on ? `✓ ${yes}` : no}
                      </button>
                    </form>
                  );
                  return (
                    <tr key={s.id} className={s.status === 'inactive' ? 'inactive' : ''}>
                      <td><Link href={`/students/${s.id}`}><strong>{fullName(s) || '(ללא שם)'}</strong></Link></td>
                      <td>
                        {s.id_number && <span dir="ltr">{s.id_number}</span>}
                        {ids !== 'ok' && <> <span className={`badge ${ids === 'missing' ? 'badge-muted' : 'badge-pending'}`}>{ID_STATE_LABELS[ids]}</span></>}
                      </td>
                      <td title={s.birth_date_approx ? 'גיל משוער' : undefined}>{ageLabel(s.birth_date, s.birth_date_approx)}</td>
                      <td>{s.health_fund ? HEALTH_FUND_LABELS[s.health_fund] : <span className="muted">לא צוינה</span>}</td>
                      <td>{s.health_plan}</td>
                      <td>{flag('has_referral', s.has_referral, 'יש', 'אין')}</td>
                      <td>{flag('hmo_reported', s.hmo_reported, 'נשלח', 'לא נשלח')}</td>
                      <td>{c ? <>{c.name}{c.phone && <div className="muted" dir="ltr">{c.phone}</div>}</> : ''}</td>
                      <td>{s.branch_id ? maps.branch.get(s.branch_id)?.name : ''}</td>
                      <td>
                        {lessons.length + choirs.length === 0 && <span className="badge badge-muted">ללא שיבוץ</span>}
                        {lessons.map((l) => <div key={l.id}>{maps.instrument.get(l.instrument_id)?.name}</div>)}
                        {choirs.map((e) => <div key={`e${e.id}`}>{maps.choir.get(e.choir_id)?.name}</div>)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </>
  );
}
