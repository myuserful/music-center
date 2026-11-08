import Link from 'next/link';
import { notFound } from 'next/navigation';
import { CertificateList } from '@/components/CertificateList';
import { BirthDateFields } from '@/components/BirthDateFields';
import { ConfirmButton } from '@/components/ConfirmButton';
import { HealthFundFields } from '@/components/HealthFundFields';
import { InquiryButton } from '@/components/InquiryButton';
import { PaymentTrackField } from '@/components/PaymentTrackField';
import { StudentHistory } from '@/components/LessonHistory';
import { ReceiptButton } from '@/components/ReceiptButton';
import { StudentAccount } from '@/components/StudentAccount';
import { StudentStatusFields } from '@/components/StudentStatusFields';
import { BackLink, Empty, Flash, one, PageHead, StatusActions, StatusBadge, type SP } from '@/components/ui';
import { isoDate } from '@/lib/age';
import { SIBLING_CYCLE, SIBLING_DEFAULT_AMOUNT } from '@/lib/billing';
import { attendedDates, isClosed } from '@/lib/day';
import {
  addEnrollment, deleteEnrollment, deleteLesson, setEnrollmentStatus, setLessonStatus,
} from '@/lib/actions/assignments';
import { deleteContact, deleteStudent, saveContact, saveStudent } from '@/lib/actions/people';
import { linkFromForm, unlinkFromForm } from '@/lib/actions/siblings';
import {
  BILLABLE, CHOIR_CAPACITY, DAYS, DEFAULT_LANGUAGE, LANGUAGES, GENDER_LABELS, STATUS_LABELS, STATUSES,
  STUDENT_STATUS_LABELS, type Gender,
} from '@/lib/constants';
import { loadAll, loadBilling, loadCertificates, loadHistory, loadReceipts } from '@/lib/data';
import { studentEmail } from '@/lib/mail';
import { referralHolder } from '@/lib/receiptMail';
import { normalizePhone, siblingsOf } from '@/lib/siblings';
import { createClient } from '@/lib/supabase/server';
import { sumitConfigured } from '@/lib/sumit';
import { hhmm } from '@/lib/time';
import { fullName, isTimed, lessonWhen, type Student } from '@/lib/types';

export default async function StudentPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SP }) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const db = await createClient();
  const isNew = id === 'new';
  // שתי הטעינות במקביל (כל פנייה למסד לוקחת זמן ברשת)
  const month = one(sp.month) || isoDate(new Date()).slice(0, 7);
  const known = !isNew && !Number.isNaN(Number(id));
  const [all, loadedBilling, history, receipts, certificates] = await Promise.all([
    loadAll(db),
    known ? loadBilling(db, Number(id)) : null,
    // כל ההיסטוריה: גם לתצוגה לפי חודש וגם לאישור הקבלה
    known ? loadHistory(db, { student: Number(id) }) : null,
    known ? loadReceipts(db, Number(id)) : null,
    known ? loadCertificates(db, Number(id)) : null,
  ]);
  const { maps } = all;
  const s: Student | undefined = isNew
    ? {
      id: 0, first_name: '', last_name: '', school: '', birth_date: null, birth_date_approx: false, branch_id: null,
      requested_instrument_id: null, second_instrument_id: null, notes: '', status: 'active', waiting_reason: '', gender: null, health_fund: null, health_plan: '',
      id_number: '', three_digits: '', has_referral: false, referral_name: '', referral_id_number: '', hmo_reported: false, preferred_times: '', language: DEFAULT_LANGUAGE,
      contract_signed: false, card_on_file: false, email: '', no_email: false, family_id: null,
      payment_track: 'unknown', standing_order: false, needs_review: false,
    }
    : maps.student.get(Number(id));
  if (!s) notFound();
  const billing = loadedBilling;

  const here = `/students/${s.id}`;
  const contacts = all.contacts.filter((c) => c.student_id === s.id);
  const lessons = all.lessons.filter((l) => l.student_id === s.id);
  const enrollments = all.enrollments.filter((e) => e.student_id === s.id);
  const openChoirs = all.choirs.filter(
    (c) => !enrollments.some((e) => e.choir_id === c.id) &&
      all.enrollments.filter((e) => e.choir_id === c.id).length < CHOIR_CAPACITY,
  );
  // ברירת מחדל לקבלה: ימי השיעורים והמקהלות
  const receiptDays = [...new Set([
    ...lessons.filter(isTimed).map((l) => l.weekday),
    ...enrollments.map((e) => maps.choir.get(e.choir_id)?.weekday).filter((d) => d !== undefined),
  ])].sort();

  return (
    <>
      <BackLink href="/students">כל התלמידים</BackLink>
      <PageHead title={isNew ? 'תלמיד/ה חדש/ה' : fullName(s) || '(ללא שם)'} sub={isNew ? undefined : STUDENT_STATUS_LABELS[s.status]}>
        {!isNew && <InquiryButton studentId={s.id} name={fullName(s)} />}
        {!isNew && (
          <ReceiptButton
            studentId={s.id} name={fullName(s)} idNumber={s.id_number} referral={referralHolder(s)}
            email={studentEmail(s)} days={receiptDays} gender={s.gender}
            attended={attendedDates(history!.lessons, history!.closures)} price={Number(loadedBilling!.settings.price_maccabi_full)}
          />
        )}
        {!isNew && <Link className="btn btn-primary" href={`/lessons/new?student=${s.id}`}>+ שיבוץ שיעור</Link>}
      </PageHead>
      <Flash sp={sp} />

      <form action={saveStudent} className="card">
        {!isNew && <input type="hidden" name="id" value={s.id} />}
        <div className="form-grid">
          <label>שם פרטי<input name="first_name" defaultValue={s.first_name} required /></label>
          <label>שם משפחה<input name="last_name" defaultValue={s.last_name} required /></label>
          <StudentStatusFields status={s.status} reason={s.waiting_reason ?? ''} />
          <label>
            מין
            <select name="gender" defaultValue={s.gender ?? ''}>
              <option value="">לא נבחר</option>
              {(Object.keys(GENDER_LABELS) as Gender[]).map((g) => <option key={g} value={g}>{GENDER_LABELS[g]}</option>)}
            </select>
          </label>
          <label>ת&quot;ז<input name="id_number" defaultValue={s.id_number} dir="ltr" inputMode="numeric" /></label>
          <label>
            שלוש ספרות
            <input name="three_digits" defaultValue={s.three_digits} dir="ltr" inputMode="numeric" maxLength={3} pattern="\d{3}"
              title="3 ספרות" autoComplete="off" />
          </label>
          <label>מקום לימודים<input name="school" defaultValue={s.school} placeholder="בית ספר / גן" /></label>
          <label>
            שפה
            <input name="language" list="language-options" defaultValue={s.language} />
            <datalist id="language-options">
              {LANGUAGES.map((l) => <option key={l} value={l} />)}
            </datalist>
          </label>
          <BirthDateFields birthDate={s.birth_date} approx={s.birth_date_approx} />
          <label>
            סניף
            <select name="branch_id" defaultValue={s.branch_id ?? ''}>
              <option value="">לא נבחר</option>
              {all.branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </label>
          <label>
            כלי מבוקש
            <select name="requested_instrument_id" defaultValue={s.requested_instrument_id ?? ''}>
              <option value="">לא נבחר</option>
              {all.instruments.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
            </select>
          </label>
          <label>
            כלי נוסף
            <select name="second_instrument_id" defaultValue={s.second_instrument_id ?? ''}>
              <option value="">אין</option>
              {all.instruments.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
            </select>
          </label>
          <HealthFundFields fund={s.health_fund} plan={s.health_plan} />
          <label className="check"><input type="checkbox" name="has_referral" defaultChecked={s.has_referral} /> יש הפניה</label>
          <label>שם על ההפניה<input name="referral_name" defaultValue={s.referral_name ?? ''} placeholder="אם שונה מהשם של התלמיד/ה" /></label>
          <label>ת&quot;ז על ההפניה<input name="referral_id_number" defaultValue={s.referral_id_number ?? ''} dir="ltr" inputMode="numeric" /></label>
          <label className="check"><input type="checkbox" name="hmo_reported" defaultChecked={s.hmo_reported} /> עודכן/ה בקופה</label>
          <PaymentTrackField track={s.payment_track} existing={!isNew} />
          {all.students.length === 0 || 'sibling_discount' in all.students[0] ? (
            <>
              <input type="hidden" name="sibling_discount_field" value="1" />
              <label className="check" title="בפרטי ובמכבי בלבד. בפיקדון ובשיעור ניסיון אין הנחה">
                <input type="checkbox" name="sibling_discount" defaultChecked={!!s.sibling_discount} /> הנחת אחים
              </label>
              <label>
                סכום ההנחה לכל {SIBLING_CYCLE} שיעורים
                <input name="sibling_discount_amount" type="number" min="0" step="any" defaultValue={s.sibling_discount_amount ?? SIBLING_DEFAULT_AMOUNT} />
              </label>
              <label title="רק שיעורים מהתאריך הזה נספרים להנחה">
                סופרים שיעורים מתאריך
                <input name="sibling_discount_from" type="date" defaultValue={(s.sibling_discount && s.sibling_discount_from) || new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' })} />
              </label>
            </>
          ) : <span className="muted">הנחת אחים: צריך להריץ את 0059_sibling_discount.sql ב-Supabase</span>}
          <label className="check"><input type="checkbox" name="standing_order" defaultChecked={s.standing_order} /> הוראת קבע</label>
          <label className="check"><input type="checkbox" name="contract_signed" defaultChecked={s.contract_signed} /> חתמו על חוזה</label>
          <label className="check"><input type="checkbox" name="card_on_file" defaultChecked={s.card_on_file} /> נלקחו פרטי אשראי</label>
          <label>מייל<input name="email" type="email" dir="ltr" defaultValue={s.email ?? ''} /></label>
          <label className="check"><input type="checkbox" name="no_email" defaultChecked={!!s.no_email} /> אין מייל</label>
          <label className="wide">העדפות שעה<input name="preferred_times" defaultValue={s.preferred_times} placeholder="למשל: שני מ-4:00 עד 6:00, אחרי 5:30" /></label>
          {isNew && (
            <>
              <label className="wide" style={{ marginTop: 6 }}>איש קשר ראשי (אופציונלי)</label>
              <label>שם<input name="contact_name" /></label>
              <label>קרבה<input name="contact_relation" placeholder="אמא / אבא" /></label>
              <label>טלפון<input name="contact_phone" dir="ltr" /></label>
            </>
          )}
          <label className="wide">הערות<textarea name="notes" defaultValue={s.notes} /></label>
          <label className="check"><input type="checkbox" name="needs_review" defaultChecked={s.needs_review} /> לבדיקה (מולא עכשיו, צריך לעבור על הפרטים)</label>
        </div>
        <div className="form-foot"><button className="btn btn-primary">שמירה</button></div>
      </form>

      {!isNew && (
        <>
          <div className="grid grid-2">
            <section className="card">
              <h2>שיעורים פרטיים</h2>
              {lessons.length === 0 ? <Empty>אין שיעורים</Empty> : (
                <ul className="list">
                  {lessons.map((l) => (
                    <li key={l.id}>
                      <div>
                        <Link href={`/lessons/${l.id}`}><strong>{maps.instrument.get(l.instrument_id)?.name}</strong> · {lessonWhen(l)}</Link>
                        <div className="muted">{fullName(maps.teacher.get(l.teacher_id))} · {l.at_home ? 'בבית המורה' : all.roomLabel(l.room_id)}</div>
                      </div>
                      <StatusBadge status={l.status} />
                      <StatusActions id={l.id} status={l.status} back={here} setAction={setLessonStatus} deleteAction={deleteLesson} />
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="card">
              <h2>מקהלות</h2>
              {enrollments.length === 0 ? <Empty>לא רשום/ה למקהלה</Empty> : (
                <ul className="list">
                  {enrollments.map((e) => {
                    const c = maps.choir.get(e.choir_id)!;
                    return (
                      <li key={e.id}>
                        <div>
                          <Link href={`/choirs/${c.id}`}><strong>{c.name}</strong></Link>
                          <div className="muted">{DAYS[c.weekday]} {hhmm(c.start_time)}-{hhmm(c.end_time)}</div>
                        </div>
                        <StatusBadge status={e.status} />
                        <StatusActions id={e.id} status={e.status} back={here} setAction={setEnrollmentStatus} deleteAction={deleteEnrollment} />
                      </li>
                    );
                  })}
                </ul>
              )}
              {openChoirs.length > 0 && (
                <form action={addEnrollment} className="row-form" style={{ marginTop: 12 }}>
                  <input type="hidden" name="student_id" value={s.id} />
                  <input type="hidden" name="back" value={here} />
                  <select name="choir_id" required aria-label="מקהלה">
                    {openChoirs.map((c) => (
                      <option key={c.id} value={c.id}>{c.name} ({DAYS[c.weekday]} {hhmm(c.start_time)})</option>
                    ))}
                  </select>
                  <select name="status" aria-label="סטטוס">
                    {STATUSES.map((x) => <option key={x} value={x}>{STATUS_LABELS[x]}</option>)}
                  </select>
                  <button className="btn btn-xs btn-primary">+ רישום</button>
                </form>
              )}
            </section>
          </div>

          <StudentHistory
            all={all} month={month}
            history={{ ...history!, lessons: history!.lessons.filter((d) => month === 'all' || d.lesson_date.startsWith(month)) }}
          />

          <StudentAccount
            student={s} charges={billing!.charges} payments={billing!.payments} settings={billing!.settings}
            receipts={receipts!.receipts}
            teachers={all.teachers.filter((t) => t.active || lessons.some((l) => l.teacher_id === t.id))}
            defaultTeacherId={(lessons.find((l) => l.status === 'confirmed') ?? lessons[0])?.teacher_id ?? null}
            missing={billing!.missing} sumit={sumitConfigured()} hasEmail={contacts.some((c) => c.email)}
            weekdays={[...new Set(all.timedLessons.filter((l) => l.student_id === s.id && l.status === 'confirmed' && !l.pair).map((l) => l.weekday))]}
            pair={{
              weekdays: [...new Set(all.timedLessons.filter((l) => l.student_id === s.id && l.status === 'confirmed' && l.pair).map((l) => l.weekday))],
              // שיעורים בזוג שכבר חויבו (ימים סגורים): איפה התלמיד/ה בסבב של 4
              done: history!.lessons.filter((d) => d.pair && BILLABLE.includes(d.attendance) && isClosed(d, history!.closures)).length,
            }}
            today={new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' })}
          />

          {certificates && !certificates.missing && certificates.certificates.length > 0 && (
            <section className="card table-wrap" id="certificates">
              <h2>אישורי קבלה שהופקו</h2>
              <CertificateList certificates={certificates.certificates} back={here} emails={{ [s.id]: studentEmail(s) }} />
            </section>
          )}

          {'family_id' in s && (() => {
            const siblings = siblingsOf(s, all.students);
            // מי שחולקים טלפון - בראש הרשימה להוספה
            const phones = new Set(contacts.map((c) => normalizePhone(c.phone)).filter(Boolean));
            const samePhone = new Set(all.contacts.filter((c) => c.student_id !== s.id && phones.has(normalizePhone(c.phone)))
              .map((c) => c.student_id));
            const candidates = all.students.filter((x) => x.id !== s.id && !siblings.some((y) => y.id === x.id))
              .sort((a, b) => Number(samePhone.has(b.id)) - Number(samePhone.has(a.id)) ||
                a.last_name.localeCompare(b.last_name, 'he') || a.first_name.localeCompare(b.first_name, 'he'));
            return (
              <section className="card">
                <h2>אחים</h2>
                <div className="siblings-row">
                  {siblings.length === 0 && <span className="muted">לא סומנו אחים</span>}
                  {siblings.map((x) => (
                    <form key={x.id} action={unlinkFromForm}>
                      <input type="hidden" name="student_id" value={x.id} />
                      <Link href={`/students/${x.id}`}><strong>{fullName(x)}</strong></Link>
                      <ConfirmButton className="btn btn-xs btn-ghost" message={`להוציא את ${fullName(x)} מהמשפחה?`}>✗</ConfirmButton>
                    </form>
                  ))}
                </div>
                <form action={linkFromForm} className="row-form" style={{ marginTop: 12 }}>
                  <input type="hidden" name="student_id" value={s.id} />
                  <select name="sibling_id" required aria-label="אח/ות" defaultValue="">
                    <option value="" disabled>בחירת אח/ות…</option>
                    {candidates.map((x) => (
                      <option key={x.id} value={x.id}>{fullName(x)}{samePhone.has(x.id) ? ' (אותו טלפון)' : ''}</option>
                    ))}
                  </select>
                  <button className="btn btn-xs btn-primary">+ הוספת אח/ות</button>
                  {siblings.length > 0 && (
                    <span className="muted">מוסיפים את כל המשפחה</span>
                  )}
                </form>
              </section>
            );
          })()}

          <section className="card">
            <h2>אנשי קשר</h2>
            {contacts.length === 0 ? <Empty>אין אנשי קשר</Empty> : (
              <ul className="list">
                {contacts.map((c) => (
                  <li key={c.id}>
                    <span>
                      <strong>{c.name}</strong>{c.relation && ` (${c.relation})`}
                      {c.is_primary && <span className="chip">ראשי</span>}
                    </span>
                    <span>
                      {c.phone && <a href={`tel:${c.phone}`} dir="ltr">{c.phone}</a>}
                      {c.email && <> · <a href={`mailto:${c.email}`} dir="ltr">{c.email}</a></>}
                    </span>
                    <form action={deleteContact}>
                      <input type="hidden" name="id" value={c.id} />
                      <input type="hidden" name="student_id" value={s.id} />
                      <ConfirmButton className="btn btn-xs btn-danger" message={`למחוק את ${c.name}?`}>מחיקה</ConfirmButton>
                    </form>
                  </li>
                ))}
              </ul>
            )}
            <form action={saveContact} className="row-form" style={{ marginTop: 12 }}>
              <input type="hidden" name="student_id" value={s.id} />
              <label>שם<input name="name" required /></label>
              <label>קרבה<input name="relation" placeholder="אמא / אבא" /></label>
              <label>טלפון<input name="phone" dir="ltr" /></label>
              <label>אימייל<input name="email" type="email" dir="ltr" /></label>
              <label className="check"><input type="checkbox" name="is_primary" defaultChecked={contacts.length === 0} /> ראשי</label>
              <button className="btn btn-xs btn-primary">+ הוספה</button>
            </form>
          </section>

          <form action={deleteStudent}>
            <input type="hidden" name="id" value={s.id} />
            <ConfirmButton className="btn btn-danger" message={`למחוק את ${fullName(s)} וכל השיבוצים שלו/ה?`}>מחיקת תלמיד/ה</ConfirmButton>
          </form>
        </>
      )}
    </>
  );
}
