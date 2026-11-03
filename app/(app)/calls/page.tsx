import Link from 'next/link';
import { DetailsBoard, type DetailsCard } from '@/components/DetailsBoard';
import { InquiryBoard, type InquiryCard } from '@/components/InquiryBoard';
import { one, PageHead, type SP } from '@/components/ui';
import type { FollowupState } from '@/lib/actions/calls';
import type { FamilyInfoMember } from '@/components/FamilyInfo';
import { DAYS, HEALTH_FUND_LABELS, STATUS_LABELS, URGENCIES, type InquiryStatus, type Urgency } from '@/lib/constants';
import { loadAll } from '@/lib/data';
import { inquiryChecklist } from '@/lib/inquiries';
import { DETAILS_TOPIC, missingDetails } from '@/lib/missingDetails';
import { familyKey, normalizePhone } from '@/lib/siblings';
import { createClient } from '@/lib/supabase/server';
import { hhmm } from '@/lib/time';
import { fullName, lessonWhen, type Student } from '@/lib/types';

type Followup = { student_id: number; state: FollowupState; attempts: number; last_call_at: string | null; note: string };
type Inquiry = {
  id: number; student_id: number; reason: string; urgency: Urgency; status: InquiryStatus; attempts: number; last_call_at: string | null;
};

export default async function CallsPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const tab = one(sp.tab) === 'details' ? 'details' : 'inquiries';
  const db = await createClient();
  const [all, followupsRes, inquiriesRes] = await Promise.all([
    loadAll(db),
    db.from('call_followups').select('student_id,state,attempts,last_call_at,note').eq('topic', DETAILS_TOPIC),
    db.from('inquiries').select('id,student_id,reason,urgency,status,attempts,last_call_at').order('created_at'),
  ]);
  const { maps } = all;
  const inquiries = (inquiriesRes.data ?? []) as Inquiry[];
  const followups = new Map(((followupsRes.data ?? []) as Followup[]).map((f) => [f.student_id, f]));

  // פרטים חסרים: רק תלמידים פעילים
  const missingOf = new Map(all.students.filter((s) => s.status === 'active')
    .map((s) => [s.id, missingDetails(s)] as const).filter(([, m]) => m.length > 0));
  const pendingPlacement = new Set([...all.lessons, ...all.enrollments]
    .filter((x) => x.status === 'pending').map((x) => x.student_id));

  // אחים: כל מי שבאותה משפחה. בלי משפחה - התלמיד/ה לבד
  const family = new Map<string, Student[]>();
  for (const s of all.students) {
    const k = familyKey(s);
    if (!family.has(k)) family.set(k, []);
    family.get(k)!.push(s);
  }
  const familyOf = (s: Student) => family.get(familyKey(s))!;
  /** טלפונים של כל האחים, בלי כפילויות */
  const contactsOf = (ids: number[]) => {
    const seen = new Set<string>();
    return all.contacts.filter((c) => ids.includes(c.student_id) && c.phone).filter((c) => {
      const p = normalizePhone(c.phone) || c.phone;
      if (seen.has(p)) return false;
      seen.add(p);
      return true;
    }).map((c) => ({ id: c.id, name: c.name, relation: c.relation, phone: c.phone }));
  };
  /** כותרת לכרטיס: שם מלא, או "משפחת כהן" לאחים */
  const titleOf = (members: Student[]) => {
    if (members.length === 1) return fullName(members[0]);
    const names = [...new Set(members.map((m) => m.last_name.trim()).filter(Boolean))];
    return names.length ? `משפחת ${names.join(' / ')}` : members.map((m) => m.first_name).join(', ');
  };
  const byName = (a: Student, b: Student) => a.first_name.localeCompare(b.first_name, 'he');

  /** ימי השיעורים והמקהלות של כל המשפחה (לסינון לפי יום: מספיק שאחד האחים לומד באותו יום) */
  const daysOf = (members: Student[]) => {
    const ids = new Set(members.map((m) => m.id));
    return [...new Set([
      ...all.lessons.filter((l) => ids.has(l.student_id) && l.weekday != null).map((l) => l.weekday!),
      ...all.enrollments.filter((e) => ids.has(e.student_id)).map((e) => maps.choir.get(e.choir_id)?.weekday ?? -1),
    ])].filter((d) => d >= 0).sort();
  };
  /** לחלון הפרטים: קופה ושיעורים של כל ילד/ה במשפחה */
  const infoOf = (members: Student[]): FamilyInfoMember[] => [...members].sort(byName).map((m) => ({
    id: m.id, name: fullName(m), fund: m.health_fund ? HEALTH_FUND_LABELS[m.health_fund] : '', plan: m.health_plan ?? '',
    lessons: [
      ...all.lessons.filter((l) => l.student_id === m.id).map((l) => ({
        key: `l${l.id}`, status: STATUS_LABELS[l.status],
        text: `${lessonWhen(l)} · ${maps.instrument.get(l.instrument_id)?.name ?? ''} · ${fullName(maps.teacher.get(l.teacher_id))}`,
      })),
      ...all.enrollments.filter((e) => e.student_id === m.id).map((e) => {
        const c = maps.choir.get(e.choir_id);
        return {
          key: `e${e.id}`, status: STATUS_LABELS[e.status],
          text: c ? `${DAYS[c.weekday]} ${hhmm(c.start_time)} · מקהלה: ${c.name}` : 'מקהלה',
        };
      }),
    ],
  }));

  // בירורים: אחים באותה עמודה = כרטיס אחד
  const inquiryGroups = new Map<string, { row: Inquiry; s: Student }[]>();
  for (const row of inquiries) {
    const s = maps.student.get(row.student_id);
    if (!s) continue;
    const k = `${familyKey(s)}|${row.status}`;
    if (!inquiryGroups.has(k)) inquiryGroups.set(k, []);
    inquiryGroups.get(k)!.push({ row, s });
  }
  const cards: InquiryCard[] = [...inquiryGroups].map(([key, group]) => {
    const members = [...new Map(group.map((g) => [g.s.id, g.s])).values()].sort(byName);
    const ids = new Set(members.map((m) => m.id));
    const fam = familyOf(members[0]);
    const rows = group.map((g) => g.row);
    const lastCalls = rows.map((r) => r.last_call_at).filter((t): t is string => !!t).sort();
    return {
      key,
      ids: rows.map((r) => r.id),
      title: titleOf(members),
      lastName: members[0].last_name,
      firstName: members[0].first_name,
      status: rows[0].status,
      // הדחוף ביותר בכרטיס קובע את המקום בעמודה
      urgency: URGENCIES.find((u) => rows.some((r) => r.urgency === u)) ?? 'normal',
      attempts: Math.max(...rows.map((r) => r.attempts)),
      lastCall: lastCalls.at(-1) ?? null,
      entries: group.map(({ row, s }) => ({ id: row.id, firstName: s.first_name, reason: row.reason, urgency: row.urgency })),
      members: members.map((m) => ({ id: m.id, firstName: m.first_name, checklist: inquiryChecklist(m) })),
      contacts: contactsOf(fam.map((m) => m.id)),
      items: [
        ...all.lessons.filter((l) => ids.has(l.student_id)).map((l) => ({
          instrument: maps.instrument.get(l.instrument_id)?.name ?? '', weekday: l.weekday ?? -1,
        })),
        ...all.enrollments.filter((e) => ids.has(e.student_id)).map((e) => ({
          instrument: 'מקהלה', weekday: maps.choir.get(e.choir_id)?.weekday ?? -1,
        })),
      ],
      familyDays: daysOf(fam),
      info: infoOf(fam),
    };
  });

  // פרטים חסרים: כרטיס אחד למשפחה, עם מה שחסר לכל ילד/ה
  const detailGroups = new Map<string, Student[]>();
  for (const s of all.students.filter((x) => missingOf.has(x.id))) {
    const k = familyKey(s);
    if (!detailGroups.has(k)) detailGroups.set(k, []);
    detailGroups.get(k)!.push(s);
  }
  const detailCards: DetailsCard[] = [...detailGroups].map(([key, members]) => {
    members.sort(byName);
    const fam = familyOf(members[0]);
    // מצב השיחה של המשפחה: לפי השיחה האחרונה עם אחד מהאחים
    const fs = members.map((m) => followups.get(m.id)).filter((f): f is Followup => !!f)
      .sort((a, b) => (b.last_call_at ?? '').localeCompare(a.last_call_at ?? ''));
    const pending = fam.filter((m) => pendingPlacement.has(m.id));
    const famIds = new Set(fam.map((m) => m.id));
    const openInquiries = inquiries.filter((i) => i.status !== 'done' && famIds.has(i.student_id));
    return {
      key, title: titleOf(members), lastName: members[0].last_name, firstName: members[0].first_name,
      state: fs[0]?.state ?? 'to_call', attempts: Math.max(0, ...fs.map((f) => f.attempts)),
      lastCall: fs[0]?.last_call_at ?? null, note: fs.find((f) => f.note)?.note ?? '',
      members: members.map((m) => ({
        id: m.id, name: fullName(m), firstName: m.first_name, fund: m.health_fund, missing: missingOf.get(m.id)!,
      })),
      alsoAbout: [
        ...(pending.length === 0 ? [] :
          [fam.length > 1 ? `לאשר שיבוץ של ${pending.map((m) => m.first_name).join(', ')}` : 'לאשר שיבוץ']),
        ...openInquiries.map((i) => `בירור: ${i.reason}`),
      ],
      contacts: contactsOf(fam.map((m) => m.id)),
      days: daysOf(fam),
      info: infoOf(fam),
    };
  });

  return (
    <>
      <PageHead
        title="טלפונים להורים"
        sub={tab === 'details'
          ? 'כל מה שחסר לתלמיד/ה בכרטיס אחד, לבקש הכול בשיחה אחת. מה שמסמנים כאן מתעדכן ישר בכרטיס התלמיד/ה, וכשלא חסר כלום הכרטיס יורד מהלוח.'
          : 'טלפונים נכנסים לכאן מכרטיס התלמיד/ה (כפתור "טלפון לבירור"). גוררים כרטיס לפי תוצאת השיחה. לא ענו = נספר ניסיון.'}
      />
      <nav className="tabs">
        <Link href="/calls" className={tab === 'inquiries' ? 'active' : ''}>בירורים <span className="tab-count">{cards.filter((c) => c.status !== 'done').length}</span></Link>
        <Link href="/calls?tab=details" className={tab === 'details' ? 'active' : ''}>פרטים חסרים <span className="tab-count">{detailCards.length}</span></Link>
      </nav>
      {tab === 'details' && followupsRes.error && (
        <div className="flash flash-error" role="alert">
          חסרות טבלאות שיחות במסד הנתונים. יש להריץ את הקובץ supabase/migrations/0045_detail_calls.sql
        </div>
      )}
      {tab === 'inquiries' && inquiriesRes.error && (
        <div className="flash flash-error" role="alert">
          חסרה טבלת הבירורים במסד הנתונים. יש להריץ את הקובץ supabase/migrations/0055_inquiries.sql
        </div>
      )}
      {tab === 'details' ? <DetailsBoard cards={detailCards} /> : <InquiryBoard cards={cards} />}
    </>
  );
}
