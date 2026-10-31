import { SiblingSuggestions, type SuggestionView } from '@/components/SiblingSuggestions';
import { PageHead } from '@/components/ui';
import { STUDENT_STATUS_LABELS } from '@/lib/constants';
import { loadAll } from '@/lib/data';
import { pairKey, suggestSiblings } from '@/lib/siblings';
import { createClient } from '@/lib/supabase/server';
import { fullName } from '@/lib/types';

export default async function SiblingsPage() {
  const db = await createClient();
  const [all, rejectedRes] = await Promise.all([
    loadAll(db),
    db.from('sibling_rejections').select('student_a,student_b'),
  ]);
  const migrated = !rejectedRes.error && (all.students.length === 0 || 'family_id' in all.students[0]);
  const rejected = new Set((rejectedRes.data ?? []).map((r) => pairKey(r.student_a, r.student_b)));
  const { maps } = all;

  const suggestions: SuggestionView[] = migrated ? suggestSiblings(all.students, all.contacts, rejected).map((g) => ({
    key: g.studentIds.join('-'),
    sure: g.sure,
    phones: g.phones,
    students: g.studentIds.map((id) => {
      const s = maps.student.get(id)!;
      return {
        id, name: fullName(s), status: STUDENT_STATUS_LABELS[s.status], familyId: s.family_id,
        contacts: all.contacts.filter((c) => c.student_id === id && c.phone)
          .map((c) => `${c.name}${c.relation ? ` (${c.relation})` : ''} ${c.phone}`),
      };
    }),
  })) : [];
  const families = new Set(all.students.map((s) => s.family_id).filter((f) => f != null)).size;

  return (
    <>
      <PageHead
        title="אחים"
        sub={`הצעות לפי טלפון משותף של ההורים. כרגע מסומנות ${families} משפחות. אותו שם משפחה = כמעט בטוח אחים; שם משפחה שונה = צריך לבדוק.`}
      />
      {!migrated && (
        <div className="flash flash-error" role="alert">
          חסרות טבלאות משפחות במסד הנתונים. יש להריץ את הקובץ supabase/migrations/0047_families.sql
        </div>
      )}
      {migrated && <SiblingSuggestions suggestions={suggestions} />}
    </>
  );
}
