import { ConfirmButton } from '@/components/ConfirmButton';
import { Flash, PageHead, type SP } from '@/components/ui';
import { deleteInstrument, saveInstrument } from '@/lib/actions/settings';
import { CHOIR_INSTRUMENT } from '@/lib/constants';
import { createClient } from '@/lib/supabase/server';
import type { Instrument } from '@/lib/types';

export default async function InstrumentsPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const db = await createClient();
  const { data } = await db.from('instruments').select('*').order('name');

  return (
    <>
      <PageHead title="כלי נגינה" sub={`הכלי "${CHOIR_INSTRUMENT}" מסמן מורים שיכולים להעביר מקהלה`} />
      <Flash sp={sp} />
      <section className="card">
        <ul className="list">
          {((data ?? []) as Instrument[]).map((i) => (
            <li key={i.id}>
              {i.name === CHOIR_INSTRUMENT ? (
                <strong>{i.name} <span className="badge badge-muted">כלי מערכת</span></strong>
              ) : (
                <form action={saveInstrument} className="row-form">
                  <input type="hidden" name="id" value={i.id} />
                  <input name="name" defaultValue={i.name} required aria-label="שם כלי" />
                  <button className="btn btn-xs">שמירה</button>
                </form>
              )}
              {i.name !== CHOIR_INSTRUMENT && (
                <form action={deleteInstrument}>
                  <input type="hidden" name="id" value={i.id} />
                  <ConfirmButton className="btn btn-xs btn-danger" message={`למחוק את "${i.name}"?`}>מחיקה</ConfirmButton>
                </form>
              )}
            </li>
          ))}
        </ul>
        <form action={saveInstrument} className="row-form" style={{ marginTop: 14 }}>
          <input name="name" placeholder="כלי חדש" required aria-label="שם כלי חדש" />
          <button className="btn btn-primary">+ הוספה</button>
        </form>
      </section>
    </>
  );
}
