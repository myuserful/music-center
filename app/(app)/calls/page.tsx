import Link from 'next/link';
import { CallBoard, type CallCard } from '@/components/CallBoard';
import { DetailsBoard, type DetailsCard } from '@/components/DetailsBoard';
import { one, PageHead, type SP } from '@/components/ui';
import type { FollowupState } from '@/lib/actions/calls';
import type { FamilyInfoMember } from '@/components/FamilyInfo';
import { DAYS, HEALTH_FUND_LABELS, STATUS_LABELS, type CallColumn } from '@/lib/constants';
import { loadAll } from '@/lib/data';
import { DETAILS_TOPIC, MISSING_LABELS, missingDetails } from '@/lib/missingDetails';
import { familyKey, normalizePhone } from '@/lib/siblings';
import { createClient } from '@/lib/supabase/server';
import { hhmm } from '@/lib/time';
import { fullName, lessonWhen, type Student } from '@/lib/types';

type Followup = { student_id: number; state: FollowupState; attempts: number; last_call_at: string | null; note: string };

export default async function CallsPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const tab = one(sp.tab) === 'details' ? 'details' : 'placement';
  const db = await createClient();
  const [all, followupsRes] = await Promise.all([
    loadAll(db),
    db.from('call_followups').select('student_id,state,attempts,last_call_at,note').eq('topic', DETAILS_TOPIC),
  ]);
  const { maps } = all;
  const migrated = all.students.length === 0 || 'call_state' in all.students[0];
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
  /** "נועה: חסר חוזה, חסר אשראי" לכל אח/ות במשפחה שחסר לו/ה משהו */
  const missingText = (members: Student[], many: boolean) => members.filter((m) => missingOf.has(m.id)).map((m) => {
    const list = missingOf.get(m.id)!.map((k) => MISSING_LABELS[k]).join(', ');
    return many ? `${m.first_name}: חסר ${list}` : `חסר ${list}`;
  });

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

  // אישור שיבוץ: אחים באותה עמודה = כרטיס אחד
  type Entry = { s: Student; column: CallColumn; items: CallCard['items'] };
  const entries: Entry[] = [];
  for (const s of all.students) {
    const lessons = all.lessons.filter((l) => l.student_id === s.id);
    const enrollments = all.enrollments.filter((e) => e.student_id === s.id);
    const statuses = [...lessons, ...enrollments].map((x) => x.status);
    if (statuses.length === 0) continue;

    // יש שיבוץ שממתין לאישור -> צריך להתקשר / לא ענו. אחרת לפי הסטטוס הנמוך ביותר
    const column: CallColumn =
      statuses.includes('pending') ? (s.call_state ?? 'to_call') :
      statuses.includes('undecided') ? 'undecided' : 'confirmed';
    entries.push({
      s, column,
      items: [
        ...lessons.map((l) => ({
          key: `l${l.id}`, status: l.status, weekday: l.weekday ?? -1,
          instrument: maps.instrument.get(l.instrument_id)?.name ?? '',
          text: `${maps.instrument.get(l.instrument_id)?.name ?? ''} · ${fullName(maps.teacher.get(l.teacher_id))} · ${lessonWhen(l)}`,
        })),
        ...enrollments.map((e) => {
          const c = maps.choir.get(e.choir_id);
          return {
            key: `e${e.id}`, status: e.status, weekday: c?.weekday ?? -1, instrument: 'מקהלה',
            text: c ? `מקהלה: ${c.name} · ${DAYS[c.weekday]} ${hhmm(c.start_time)}` : 'מקהלה',
          };
        }),
      ],
    });
  }
  const placementGroups = new Map<string, Entry[]>();
  for (const e of entries) {
    const k = `${familyKey(e.s)}|${e.column}`;
    if (!placementGroups.has(k)) placementGroups.set(k, []);
    placementGroups.get(k)!.push(e);
  }
  const cards: CallCard[] = [...placementGroups].map(([key, group]) => {
    group.sort((a, b) => byName(a.s, b.s));
    const members = group.map((e) => e.s);
    const many = members.length > 1;
    const fam = familyOf(members[0]);
    const column = group[0].column;
    const lastCalls = members.map((m) => m.last_call_at).filter((t): t is string => !!t).sort();
    return {
      key,
      members: members.map((m) => ({ id: m.id, firstName: m.first_name })),
      name: titleOf(members),
      lastName: members[0].last_name,
      firstName: members[0].first_name,
      column,
      attempts: Math.max(...members.map((m) => m.call_attempts ?? 0)),
      lastCall: lastCalls.at(-1) ?? null,
      items: group.flatMap((e) => e.items.map((i) => (many ? { ...i, text: `${e.s.first_name}: ${i.text}` } : i))),
      contacts: contactsOf(fam.map((m) => m.id)),
      familyDays: daysOf(fam),
      info: infoOf(fam),
      // גם מה שחסר לאחים שלא בכרטיס הזה
      alsoAbout: column === 'confirmed' ? [] : missingText(fam, fam.length > 1),
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
    return {
      key, title: titleOf(members), lastName: members[0].last_name, firstName: members[0].first_name,
      state: fs[0]?.state ?? 'to_call', attempts: Math.max(0, ...fs.map((f) => f.attempts)),
      lastCall: fs[0]?.last_call_at ?? null, note: fs.find((f) => f.note)?.note ?? '',
      members: members.map((m) => ({
        id: m.id, name: fullName(m), firstName: m.first_name, fund: m.health_fund, missing: missingOf.get(m.id)!,
      })),
      alsoAbout: pending.length === 0 ? [] :
        [fam.length > 1 ? `לאשר שיבוץ של ${pending.map((m) => m.first_name).join(', ')}` : 'לאשר שיבוץ'],
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
          : 'גוררים כרטיס לפי תוצאת השיחה. לא ענו = נספר ניסיון. אושר = כל השיבוצים של התלמיד/ה הופכים לסופיים.'}
      />
      <nav className="tabs">
        <Link href="/calls" className={tab === 'placement' ? 'active' : ''}>אישור שיבוץ <span className="tab-count">{cards.filter((c) => c.column !== 'confirmed').length}</span></Link>
        <Link href="/calls?tab=details" className={tab === 'details' ? 'active' : ''}>פרטים חסרים <span className="tab-count">{detailCards.length}</span></Link>
      </nav>
      {tab === 'details' && followupsRes.error && (
        <div className="flash flash-error" role="alert">
          חסרות טבלאות שיחות במסד הנתונים. יש להריץ את הקובץ supabase/migrations/0045_detail_calls.sql
        </div>
      )}
      {tab === 'placement' && !migrated && (
        <div className="flash flash-error" role="alert">
          חסר שדה מצב שיחה במסד הנתונים. יש להריץ את הקובץ supabase/migrations/0023_parent_calls.sql
        </div>
      )}
      {tab === 'details' ? <DetailsBoard cards={detailCards} /> : <CallBoard cards={cards} />}
    </>
  );
}
