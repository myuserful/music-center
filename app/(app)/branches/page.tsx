import { ConfirmButton } from '@/components/ConfirmButton';
import { Empty, Flash, PageHead, type SP } from '@/components/ui';
import { deleteBranch, deleteRoom, saveBranch, saveRoom } from '@/lib/actions/settings';
import { createClient } from '@/lib/supabase/server';
import type { Branch, Room } from '@/lib/types';

export default async function BranchesPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const db = await createClient();
  const [{ data: branches }, { data: rooms }] = await Promise.all([
    db.from('branches').select('*').order('name'),
    db.from('rooms').select('*').order('name'),
  ]);

  return (
    <>
      <PageHead title="סניפים וחדרים" />
      <Flash sp={sp} />

      {((branches ?? []) as Branch[]).map((b) => (
        <section key={b.id} className="card">
          <div className="form-foot" style={{ marginTop: 0, alignItems: 'flex-end' }}>
            <form action={saveBranch} className="row-form">
              <input type="hidden" name="id" value={b.id} />
              <label>שם הסניף<input name="name" defaultValue={b.name} required /></label>
              <label>כתובת<input name="address" defaultValue={b.address} /></label>
              <button className="btn btn-xs">שמירה</button>
            </form>
            <form action={deleteBranch}>
              <input type="hidden" name="id" value={b.id} />
              <ConfirmButton className="btn btn-xs btn-danger" message={`למחוק את הסניף "${b.name}" וכל החדרים שלו?`}>מחיקת סניף</ConfirmButton>
            </form>
          </div>

          <h3 style={{ margin: '18px 0 6px' }}>חדרים</h3>
          <ul className="list">
            {((rooms ?? []) as Room[]).filter((r) => r.branch_id === b.id).map((r) => (
              <li key={r.id}>
                <form action={saveRoom} className="row-form">
                  <input type="hidden" name="id" value={r.id} />
                  <input name="name" defaultValue={r.name} required aria-label="שם חדר" />
                  <button className="btn btn-xs">שמירה</button>
                </form>
                <form action={deleteRoom}>
                  <input type="hidden" name="id" value={r.id} />
                  <ConfirmButton className="btn btn-xs btn-danger" message={`למחוק את החדר "${r.name}"?`}>מחיקה</ConfirmButton>
                </form>
              </li>
            ))}
          </ul>
          <form action={saveRoom} className="row-form" style={{ marginTop: 10 }}>
            <input type="hidden" name="branch_id" value={b.id} />
            <input name="name" placeholder="חדר חדש" required aria-label="שם חדר חדש" />
            <button className="btn btn-xs btn-primary">+ הוספת חדר</button>
          </form>
        </section>
      ))}
      {!branches?.length && <Empty>אין סניפים עדיין</Empty>}

      <section className="card">
        <h2>סניף חדש</h2>
        <form action={saveBranch} className="row-form">
          <label>שם<input name="name" required /></label>
          <label>כתובת<input name="address" /></label>
          <button className="btn btn-primary">הוספה</button>
        </form>
      </section>
    </>
  );
}
