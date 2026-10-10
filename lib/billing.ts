import { COMMITMENT_FUNDS, type CommitmentFund } from './constants';
import type { BillingSettings, Charge, Choir, Payment, Student } from './types';

/** מחיר פעילות לחודש לפי מסלול. null = עדיין לא נקבע */
export type Price = {
  private: number | null; maccabi1: number | null; maccabi2: number | null; commitments: number | null;
};

export type Activity = { lesson_id: number | null; choir_id: number | null; label: string; price: Price };

export type NewCharge = Omit<Charge, 'id'>;

export const lessonPrice = (s: BillingSettings): Price => ({
  private: s.lesson_private, maccabi1: s.lesson_maccabi_1, maccabi2: s.lesson_maccabi_2, commitments: s.lesson_commitments,
});

export const choirPrice = (c: Choir): Price => ({
  private: c.price_private, maccabi1: c.price_maccabi_1, maccabi2: c.price_maccabi_2, commitments: c.commitments,
});

/** "2026-10-17" -> "2026-10-01" */
export const monthStart = (date: string) => `${date.slice(0, 7)}-01`;

export const monthLabel = (month: string) => {
  const [y, m] = month.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('he-IL', { month: 'long', year: 'numeric' });
};

const isCommitmentFund = (f: string | null): f is CommitmentFund => COMMITMENT_FUNDS.includes(f as CommitmentFund);

/**
 * החיובים של תלמיד לחודש אחד, לפי המסלול שלו והפעילויות המאושרות.
 * missing: פעילויות שלא חויבו ולמה (מחיר חסר, מסלול לא ידוע...)
 */
export function planCharges(
  student: Student, activities: Activity[], month: string, rates: Map<string, number | null>,
): { rows: NewCharge[]; missing: string[] } {
  const rows: NewCharge[] = [];
  const missing: string[] = [];
  const base = { student_id: student.id, month, fund: null, commitments: null };

  for (const a of activities) {
    const ref = { lesson_id: a.lesson_id, choir_id: a.choir_id, description: a.label };
    switch (student.payment_track) {
      case 'private':
        if (a.price.private == null) { missing.push(`${a.label}: אין מחיר פרטי`); break; }
        rows.push({ ...base, ...ref, part: 1, payer: 'parents', amount: a.price.private, state: 'due' });
        break;
      case 'maccabi':
        if (a.price.maccabi1 == null) { missing.push(`${a.label}: אין מחיר מכבי`); break; }
        rows.push({ ...base, ...ref, part: 1, payer: 'parents', amount: a.price.maccabi1, state: 'due' });
        if (a.price.maccabi2) {
          rows.push({
            ...base, ...ref, description: `${a.label} (חלק 2)`, part: 2, payer: 'parents',
            amount: a.price.maccabi2, state: 'awaiting_refund',
          });
        }
        break;
      case 'commitment': {
        if (!isCommitmentFund(student.health_fund)) { missing.push(`${a.label}: הקופה לא עובדת עם התחייבויות`); break; }
        if (a.price.commitments == null) { missing.push(`${a.label}: לא נקבע מספר התחייבויות`); break; }
        const rate = rates.get(student.health_fund) ?? null;
        rows.push({
          ...base, ...ref, part: 1, payer: 'fund', fund: student.health_fund, commitments: a.price.commitments,
          amount: rate == null ? null : rate * a.price.commitments, state: 'to_submit',
        });
        break;
      }
      case 'unknown':
        missing.push(`${a.label}: מסלול תשלום לא ידוע`);
        break;
    }
  }
  return { rows, missing };
}

/** כמה ההורים חייבים: חיובים לתשלום פחות תשלומים (צ'ק שחזר לא נחשב). שלילי = זכות */
export function parentBalance(charges: Charge[], payments: Payment[]): number {
  const owed = charges
    .filter((c) => c.payer === 'parents' && c.state === 'due')
    .reduce((n, c) => n + Number(c.amount ?? 0), 0);
  const paid = payments
    .filter((p) => p.check_status !== 'bounced')
    .reduce((n, p) => n + Number(p.amount), 0);
  return owed - paid;
}

export const shekel = (n: number | null) => (n == null ? '—' : `${n.toLocaleString('he-IL')} ₪`);
