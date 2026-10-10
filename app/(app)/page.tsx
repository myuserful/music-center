import Link from 'next/link';
import { Empty, Flash, one, PageHead, type SP } from '@/components/ui';
import { ageFrom } from '@/lib/age';
import {
  BOARD_DAYS, CHOIR_INSTRUMENT, DAYS, GENDER_LABELS, HEALTH_FUND_LABELS, LESSON_MINUTES, STATUS_LABELS, STATUSES,
  STUDENT_STATUS_LABELS, STUDENT_STATUSES, type Gender, type HealthFund,
} from '@/lib/constants';
import { loadAll } from '@/lib/data';
import { createClient } from '@/lib/supabase/server';
import { toMin } from '@/lib/time';
import { fullName, type Student } from '@/lib/types';

type Bar = { label: string; value: number; href?: string; note?: string };

/** עמודות אופקיות פשוטות: תווית, פס, מספר */
function Bars({ rows, total }: { rows: Bar[]; total?: number }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  if (rows.every((r) => r.value === 0)) return <Empty>אין נתונים</Empty>;
  return (
    <ul className="bars">
      {rows.map((r) => {
        const pct = total ? ` (${Math.round((r.value / total) * 100)}%)` : '';
        return (
          <li key={r.label} className="bar-row" title={`${r.label}: ${r.value}${pct}`}>
            <span className="bar-label">{r.href ? <Link href={r.href}>{r.label}</Link> : r.label}</span>
            <span className="bar-track">
              {r.value > 0 && <span className="bar-fill" style={{ width: `${(r.value / max) * 100}%` }} />}
            </span>
            <span className="bar-value">{r.value}{r.note && <span className="muted"> {r.note}</span>}</span>
          </li>
        );
      })}
    </ul>
  );
}

const hours = (minutes: number) => (minutes / 60).toLocaleString('he-IL', { maximumFractionDigits: 1 });

export default async function Dashboard({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const db = await createClient();
  const all = await loadAll(db);
  const { maps } = all;

  const current = all.students.filter((s) => s.status !== 'inactive'); // פעילים + מתלבטים
  const activeTeachers = all.teachers.filter((t) => t.active);
  const choirInstrumentId = all.instruments.find((i) => i.name === CHOIR_INSTRUMENT)?.id;
  const lessons = all.lessons;
  const confirmed = lessons.filter((l) => l.status === 'confirmed');
  const learning = new Set(lessons.map((l) => l.student_id));

  // ---- כלים (עם סינון לפי מין וסניף של התלמיד/ה) ----
  const fGender = one(sp.ig) as Gender | '';
  const fBranch = Number(one(sp.ib)) || null;
  const inFilter = (s: Student | undefined) =>
    !!s && (!fGender || s.gender === fGender) && (!fBranch || s.branch_id === fBranch);
  const fLessons = lessons.filter((l) => inFilter(maps.student.get(l.student_id)));
  const fStudents = current.filter(inFilter);
  const fTeachers = fBranch ? activeTeachers.filter((t) => all.teacherBranchIds(t.id).includes(fBranch)) : activeTeachers;
  const instruments = all.instruments
    .filter((i) => i.id !== choirInstrumentId)
    .map((i) => {
      const its = fLessons.filter((l) => l.instrument_id === i.id);
      const students = new Set(its.map((l) => l.student_id));
      const requested = fStudents.filter((s) => s.requested_instrument_id === i.id);
      return {
        instrument: i,
        requested: requested.length,
        waiting: requested.filter((s) => !students.has(s.id)).length,
        students: students.size,
        confirmed: its.filter((l) => l.status === 'confirmed').length,
        lessons: its.length,
        teachers: fTeachers.filter((t) => all.teacherInstrumentIds(t.id).includes(i.id)).length,
      };
    })
    .filter((x) => x.requested || x.lessons || x.teachers)
    .sort((a, b) => b.students - a.students || b.requested - a.requested);
  const maxStudents = Math.max(1, ...instruments.map((x) => x.students));

  // ---- קופות חולים ----
  const funds = (Object.keys(HEALTH_FUND_LABELS) as HealthFund[]).map((f) => {
    const list = current.filter((s) => s.health_fund === f);
    const plans = new Map<string, number>();
    for (const s of list) if (s.health_plan) plans.set(s.health_plan, (plans.get(s.health_plan) ?? 0) + 1);
    return {
      fund: f,
      count: list.length,
      learning: list.filter((s) => learning.has(s.id)).length,
      referral: list.filter((s) => s.has_referral).length,
      reported: list.filter((s) => s.hmo_reported).length,
      plans: [...plans].sort((a, b) => b[1] - a[1]),
    };
  });
  const noFund = current.filter((s) => !s.health_fund).length;

  // ---- תלמידים ----
  const countBy = <T,>(items: T[], key: (x: T) => string) => {
    const m = new Map<string, number>();
    for (const x of items) m.set(key(x), (m.get(key(x)) ?? 0) + 1);
    return [...m].sort((a, b) => b[1] - a[1]).map(([label, value]) => ({ label, value }));
  };
  const ageGroup = (birth: string | null) => {
    if (!birth) return 'לא ידוע';
    const a = ageFrom(birth);
    return a <= 6 ? 'עד 6' : a <= 9 ? '7-9' : a <= 12 ? '10-12' : a <= 15 ? '13-15' : '16+';
  };
  const AGE_ORDER = ['עד 6', '7-9', '10-12', '13-15', '16+', 'לא ידוע'];
  const ages = countBy(current, (s) => ageGroup(s.birth_date))
    .sort((a, b) => AGE_ORDER.indexOf(a.label) - AGE_ORDER.indexOf(b.label));

  // ---- מורים ----
  const teacherRows = activeTeachers.map((t) => {
    const its = lessons.filter((l) => l.teacher_id === t.id);
    const available = all.hours.filter((h) => h.teacher_id === t.id)
      .reduce((n, h) => n + toMin(h.end_time) - toMin(h.start_time), 0);
    const choirMinutes = all.choirs.filter((c) => c.teacher_id === t.id)
      .reduce((n, c) => n + toMin(c.end_time) - toMin(c.start_time), 0);
    const busy = its.length * LESSON_MINUTES + choirMinutes;
    return {
      teacher: t,
      lessons: its.length,
      confirmed: its.filter((l) => l.status === 'confirmed').length,
      students: new Set(its.map((l) => l.student_id)).size,
      busy, available,
      usage: available ? Math.round((busy / available) * 100) : null,
      instruments: all.teacherInstrumentIds(t.id).filter((i) => i !== choirInstrumentId)
        .map((i) => maps.instrument.get(i)?.name).filter(Boolean).join(', '),
    };
  }).sort((a, b) => b.lessons - a.lessons || fullName(a.teacher).localeCompare(fullName(b.teacher), 'he'));
  const totalBusy = teacherRows.reduce((n, r) => n + r.busy, 0);
  const totalAvailable = teacherRows.reduce((n, r) => n + r.available, 0);
  const idleTeachers = teacherRows.filter((r) => r.lessons === 0).length;

  const enrolled = all.enrollments.length;

  return (
    <>
      <PageHead title="מסך ראשי" sub="תמונת מצב: תלמידים, מורים, כלים וקופות" />
      <Flash sp={sp} />

      <div className="grid grid-4 dash-tiles">
        <Link href="/students" className="stat stat-undecided">
          <div className="stat-num">{current.length}</div>
          <div className="stat-label">תלמידים ({learning.size} לומדים בפועל)</div>
        </Link>
        <Link href="/teachers" className="stat stat-free">
          <div className="stat-num">{activeTeachers.length}</div>
          <div className="stat-label">מורים פעילים ({idleTeachers} בלי שיעורים)</div>
        </Link>
        <Link href="/schedule" className="stat stat-pending">
          <div className="stat-num">{lessons.length}</div>
          <div className="stat-label">שיעורים בשבוע ({confirmed.length} סופיים)</div>
        </Link>
        <Link href="/schedule" className="stat stat-undecided">
          <div className="stat-num">{hours(totalBusy)}</div>
          <div className="stat-label">
            שעות הוראה בשבוע{totalAvailable ? ` (${Math.round((totalBusy / totalAvailable) * 100)}% מהזמינות)` : ''}
          </div>
        </Link>
        <Link href="/tracking?tab=none" className="stat stat-none">
          <div className="stat-num">{all.unassigned.length}</div>
          <div className="stat-label">תלמידים פעילים ללא שיבוץ</div>
        </Link>
        <Link href="/choirs" className="stat stat-free">
          <div className="stat-num">{enrolled}</div>
          <div className="stat-label">רשומים ל-{all.choirs.length} מקהלות</div>
        </Link>
      </div>

      <div className="grid grid-2">
        <section className="card" id="instruments" style={{ gridColumn: '1 / -1' }}>
          <div className="dash-head">
            <h2>כלי נגינה</h2>
            <form className="dash-filter" action="/#instruments">
              <select name="ig" defaultValue={fGender} aria-label="מין">
                <option value="">בנים ובנות</option>
                {(Object.keys(GENDER_LABELS) as Gender[]).map((g) => <option key={g} value={g}>{GENDER_LABELS[g]}</option>)}
              </select>
              <select name="ib" defaultValue={fBranch ?? ''} aria-label="סניף">
                <option value="">כל הסניפים</option>
                {all.branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
              <button className="btn btn-xs">סינון</button>
              {(fGender || fBranch) && <Link href="/#instruments" className="btn btn-xs btn-ghost">ניקוי</Link>}
            </form>
          </div>
          {instruments.length === 0 ? <Empty>אין נתונים</Empty> : (
            <div className="table-wrap">
              <table className="dash-table">
                <thead>
                  <tr>
                    <th>כלי</th><th>לומדים בפועל</th><th>שיעורים (סופיים)</th>
                    <th>ביקשו</th><th>ממתינים לשיבוץ</th><th>מורים</th>
                  </tr>
                </thead>
                <tbody>
                  {instruments.map((x) => (
                    <tr key={x.instrument.id}>
                      <td><strong>{x.instrument.name}</strong></td>
                      <td>
                        <span className="cell-bar" title={`${x.students} תלמידים`}>
                          <span className="bar-track">
                            {x.students > 0 && <span className="bar-fill" style={{ width: `${(x.students / maxStudents) * 100}%` }} />}
                          </span>
                          <strong>{x.students}</strong>
                        </span>
                      </td>
                      <td>{x.lessons} <span className="muted">({x.confirmed})</span></td>
                      <td>{x.requested}</td>
                      <td>{x.waiting > 0 ? <span className="badge badge-pending">{x.waiting}</span> : <span className="muted">0</span>}</td>
                      <td>{x.teachers || <span className="badge badge-muted">אין מורה</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="card">
          <h2>קופות חולים</h2>
          <div className="table-wrap">
            <table className="dash-table">
              <thead><tr><th>קופה</th><th>תלמידים</th><th>לומדים</th><th>הפניה</th><th>דווח</th></tr></thead>
              <tbody>
                {funds.filter((f) => f.count > 0).map((f) => (
                  <tr key={f.fund}>
                    <td>
                      <strong>{HEALTH_FUND_LABELS[f.fund]}</strong>
                      {f.plans.length > 0 && (
                        <div className="muted dash-sub">{f.plans.map(([p, n]) => `${p} ${n}`).join(' · ')}</div>
                      )}
                    </td>
                    <td><strong>{f.count}</strong></td>
                    <td>{f.learning}</td>
                    <td>{f.referral}</td>
                    <td>{f.reported}</td>
                  </tr>
                ))}
                {noFund > 0 && (
                  <tr><td className="muted">לא צוינה קופה</td><td><strong>{noFund}</strong></td><td /><td /><td /></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="card">
          <h2>שיעורים לפי יום</h2>
          <Bars rows={BOARD_DAYS.map((d) => ({ label: DAYS[d], value: lessons.filter((l) => l.weekday === d).length }))} />
          <h3 className="dash-h3">סטטוס שיעורים</h3>
          {lessons.length === 0 ? <Empty>אין שיעורים</Empty> : (
            <>
              <div className="stack-bar" role="img"
                aria-label={STATUSES.map((s) => `${STATUS_LABELS[s]}: ${lessons.filter((l) => l.status === s).length}`).join(', ')}>
                {STATUSES.map((s) => {
                  const n = lessons.filter((l) => l.status === s).length;
                  return n > 0 && (
                    <span key={s} className={`stack-seg seg-${s}`} style={{ flexGrow: n }} title={`${STATUS_LABELS[s]}: ${n}`} />
                  );
                })}
              </div>
              <div className="legend">
                {STATUSES.map((s) => (
                  <span key={s}><i className={`seg-${s}`} />{STATUS_LABELS[s]} <strong>{lessons.filter((l) => l.status === s).length}</strong></span>
                ))}
              </div>
            </>
          )}
        </section>

        <section className="card" style={{ gridColumn: '1 / -1' }}>
          <h2>תלמידים</h2>
          <div className="dash-split">
            <div>
              <h3 className="dash-h3">סטטוס</h3>
              <Bars total={all.students.length} rows={STUDENT_STATUSES.map((s) => ({
                label: STUDENT_STATUS_LABELS[s], value: all.students.filter((x) => x.status === s).length,
              }))} />
            </div>
            <div>
              <h3 className="dash-h3">בנים ובנות</h3>
              <Bars total={current.length} rows={[
                ...(['boy', 'girl'] as const).map((g) => ({ label: GENDER_LABELS[g], value: current.filter((s) => s.gender === g).length })),
                { label: 'לא צוין', value: current.filter((s) => !s.gender).length },
              ].filter((r) => r.value > 0)} />
            </div>
            <div>
              <h3 className="dash-h3">גילאים</h3>
              <Bars total={current.length} rows={ages} />
            </div>
            <div>
              <h3 className="dash-h3">סניפים</h3>
              <Bars total={current.length} rows={countBy(current, (s) => (s.branch_id ? maps.branch.get(s.branch_id)?.name ?? '' : 'לא צוין'))} />
            </div>
            <div>
              <h3 className="dash-h3">שפה</h3>
              <Bars total={current.length} rows={countBy(current, (s) => s.language || 'לא צוין')} />
            </div>
          </div>
        </section>

        <section className="card" style={{ gridColumn: '1 / -1' }}>
          <h2>מורים</h2>
          <p className="muted dash-sub">ניצול = זמן שיעורים ומקהלות מתוך שעות הזמינות שהוגדרו</p>
          <div className="table-wrap">
            <table className="dash-table">
              <thead><tr><th>מורה</th><th>שיעורים</th><th>תלמידים</th><th>שעות</th><th>ניצול</th></tr></thead>
              <tbody>
                {teacherRows.map((r) => (
                  <tr key={r.teacher.id}>
                    <td>
                      <Link href={`/teachers/${r.teacher.id}`}>{fullName(r.teacher)}</Link>
                      {r.instruments && <div className="muted dash-sub">{r.instruments}</div>}
                    </td>
                    <td>{r.lessons} {r.lessons > 0 && <span className="muted">({r.confirmed})</span>}</td>
                    <td>{r.students}</td>
                    <td>{hours(r.busy)}{r.available > 0 && <span className="muted"> / {hours(r.available)}</span>}</td>
                    <td>
                      {r.usage == null ? <span className="muted">אין זמינות</span> : (
                        <span className="cell-bar" title={`${r.usage}%`}>
                          <span className="bar-track">
                            {r.usage > 0 && <span className="bar-fill" style={{ width: `${Math.min(100, r.usage)}%` }} />}
                          </span>
                          {r.usage}%
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </>
  );
}
