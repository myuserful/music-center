import { notFound } from 'next/navigation';
import { ConfirmButton } from '@/components/ConfirmButton';
import { TransactionFields } from '@/components/TransactionFields';
import { BackLink, Flash, PageHead, type SP } from '@/components/ui';
import { deleteTransaction, saveTransaction } from '@/lib/actions/finance';
import { shekel } from '@/lib/billing';
import { TX_KIND_LABELS } from '@/lib/constants';
import { createClient } from '@/lib/supabase/server';
import type { Teacher, Transaction } from '@/lib/types';

export default async function TransactionPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SP }) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const db = await createClient();
  const [{ data }, { data: teachers }] = await Promise.all([
    db.from('transactions').select('*').eq('id', Number(id)).maybeSingle(),
    db.from('teachers').select('*').order('first_name'),
  ]);
  const tx = data as Transaction | null;
  if (!tx) notFound();
  const back = `/finance?month=${tx.occurred_on.slice(0, 7)}`;

  return (
    <>
      <BackLink href={back}>הכנסות והוצאות</BackLink>
      <PageHead title={`${TX_KIND_LABELS[tx.kind]}: ${tx.category}`} sub={shekel(Number(tx.amount))} />
      <Flash sp={sp} />
      <form action={saveTransaction} className="card">
        <input type="hidden" name="id" value={tx.id} />
        <input type="hidden" name="back" value={`/finance/${tx.id}`} />
        <TransactionFields kind={tx.kind} tx={tx} teachers={(teachers ?? []) as Teacher[]} today={tx.occurred_on} />
        <div className="form-foot"><button className="btn btn-primary">שמירה</button></div>
      </form>
      <form action={deleteTransaction}>
        <input type="hidden" name="id" value={tx.id} />
        <input type="hidden" name="back" value={back} />
        <ConfirmButton className="btn btn-danger" message="למחוק את הרישום?">מחיקה</ConfirmButton>
      </form>
    </>
  );
}
