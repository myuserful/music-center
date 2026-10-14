import { EXPENSE_CATEGORIES, INCOME_CATEGORIES, TX_METHOD_LABELS, TX_METHODS, type TxKind } from '@/lib/constants';
import type { Teacher, Transaction } from '@/lib/types';
import { fullName } from '@/lib/types';

/** שדות טופס הכנסה / הוצאה (חדשה או עריכה) */
export function TransactionFields({
  kind, tx, teachers, today,
}: { kind: TxKind; tx?: Transaction; teachers: Teacher[]; today: string }) {
  const categories = kind === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
  const list = `tx-categories-${kind}`;
  return (
    <div className="form-grid">
      <input type="hidden" name="kind" value={kind} />
      <label>תאריך<input type="date" name="occurred_on" defaultValue={tx?.occurred_on ?? today} required /></label>
      <label>סכום (₪)<input type="number" name="amount" min="0.01" step="any" defaultValue={tx?.amount} required autoFocus={!tx} /></label>
      <label>
        קטגוריה
        <input name="category" list={list} defaultValue={tx?.category} placeholder="בחירה או הקלדה" required />
        <datalist id={list}>{categories.map((c) => <option key={c} value={c} />)}</datalist>
      </label>
      <label>
        {kind === 'income' ? 'ממי' : 'למי (ספק / נותן שירות)'}
        <input name="counterparty" defaultValue={tx?.counterparty} />
      </label>
      {kind === 'expense' && (
        <label>
          מורה (לשכר)
          <select name="teacher_id" defaultValue={tx?.teacher_id ?? ''}>
            <option value="">—</option>
            {teachers.map((t) => <option key={t.id} value={t.id}>{fullName(t)}</option>)}
          </select>
        </label>
      )}
      <label>
        אמצעי תשלום
        <select name="method" defaultValue={tx?.method ?? 'bank_transfer'}>
          {TX_METHODS.map((m) => <option key={m} value={m}>{TX_METHOD_LABELS[m]}</option>)}
        </select>
      </label>
      <label>אסמכתא (חשבונית / קבלה)<input name="reference" defaultValue={tx?.reference} /></label>
      <label className="check">
        <input type="checkbox" name="recurring" defaultChecked={tx?.recurring} /> קבוע כל חודש
      </label>
      <div className="wide fin-receipt">
        <label>
          {tx?.receipt_path ? 'החלפת קבלה' : 'קבלה / חשבונית (תמונה או מסמך)'}
          {/* בטלפון: אפשר לצלם ישירות או לבחור קובץ */}
          <input type="file" name="receipt" accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx" />
        </label>
        {tx?.receipt_path && (
          <div className="fin-receipt-current">
            <a href={`/finance/${tx.id}/receipt`} target="_blank" rel="noopener">📎 {tx.receipt_name || 'קבלה'}</a>
            <label className="check"><input type="checkbox" name="remove_receipt" /> הסרת הקבלה</label>
          </div>
        )}
        <small className="muted">עד 10MB: תמונה, PDF, Word או Excel</small>
      </div>
      <label className="wide">הערות<textarea name="notes" defaultValue={tx?.notes} /></label>
    </div>
  );
}
