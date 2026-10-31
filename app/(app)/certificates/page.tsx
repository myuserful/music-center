import { CertificateList } from '@/components/CertificateList';
import { Flash, one, PageHead, type SP } from '@/components/ui';
import { loadCertificates } from '@/lib/data';
import { studentEmail } from '@/lib/mail';
import { createClient } from '@/lib/supabase/server';

export default async function CertificatesPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const q = one(sp.q).trim();
  const db = await createClient();
  const { certificates, missing } = await loadCertificates(db);
  // המייל התקין של כל תלמיד/ה ברשימה, לכפתור "שליחה במייל"
  const ids = [...new Set(certificates.map((c) => c.student_id).filter((x): x is number => x !== null))];
  const { data: students } = ids.length ? await db.from('students').select('id, email, no_email').in('id', ids) : { data: [] };
  const emails = Object.fromEntries((students ?? []).map((s) => [s.id, studentEmail(s)]));
  const shown = q ? certificates.filter((c) => c.name.includes(q) || c.number.includes(q) || c.id_number.includes(q)) : certificates;

  return (
    <>
      <PageHead title="אישורי קבלה" sub="כל אישורי הקבלה לקופות (מכבי וכו') שהופקו מכרטיסי התלמידים. אפשר להוריד כל אחד שוב או לשלוח אותו במייל." />
      <Flash sp={sp} />
      {missing && (
        <div className="flash flash-error" role="alert">
          חסרה טבלת אישורי הקבלה במסד הנתונים. יש להריץ את הקובץ supabase/migrations/0048_receipt_certificates.sql
        </div>
      )}
      <form className="row-form" method="get" style={{ marginBottom: 12 }}>
        <input name="q" defaultValue={q} placeholder="חיפוש לפי שם, ת״ז או מספר קבלה" aria-label="חיפוש" />
        <button className="btn btn-xs">חיפוש</button>
      </form>
      <section className="card table-wrap">
        <h2>{q ? `נמצאו ${shown.length}` : `${certificates.length} אישורים`}</h2>
        <CertificateList certificates={shown} back={q ? `/certificates?q=${encodeURIComponent(q)}` : '/certificates'} emails={emails} showStudent />
      </section>
    </>
  );
}
