import type { Student } from './types';

/** נושא השיחה בטבלת call_followups */
export const DETAILS_TOPIC = 'details';

/** פרט שצריך להשיג מההורים בטלפון */
export type MissingKey = 'contract' | 'card' | 'payment_track' | 'health_fund' | 'id_number' | 'referral' | 'email';
export const MISSING_KEYS: MissingKey[] = ['contract', 'card', 'payment_track', 'health_fund', 'email', 'id_number', 'referral'];
export const MISSING_LABELS: Record<MissingKey, string> = {
  contract: 'חתימה על חוזה',
  card: 'פרטי אשראי',
  payment_track: 'מסלול תשלום',
  health_fund: 'קופת חולים',
  id_number: 'תעודת זהות',
  referral: 'הפניה',
  email: 'מייל',
};

/** קופות שצריך בהן גם תעודת זהות והפניה */
const NEEDS_REFERRAL = new Set(['maccabi', 'clalit']);

type Fields = Pick<Student,
  'contract_signed' | 'card_on_file' | 'payment_track' | 'health_fund' | 'id_number' | 'has_referral' | 'email' | 'no_email'>;

/**
 * מה חסר לתלמיד/ה, לפי הסדר שמבקשים בשיחה.
 * לכולם: חוזה, אשראי, מסלול תשלום, קופה (או "פרטי") ומייל (או "אין מייל"). במכבי ובכללית גם ת"ז והפניה.
 */
export function missingDetails(s: Fields): MissingKey[] {
  const out: MissingKey[] = [];
  if (!s.contract_signed) out.push('contract');
  if (!s.card_on_file) out.push('card');
  if (!s.payment_track || s.payment_track === 'unknown') out.push('payment_track');
  if (!s.health_fund) out.push('health_fund');
  // לפני 0046 אין את השדות בכלל: לא מסמנים מייל כחסר
  if (s.email !== undefined && !s.email?.trim() && !s.no_email) out.push('email');
  if (s.health_fund && NEEDS_REFERRAL.has(s.health_fund)) {
    if (!s.id_number?.trim()) out.push('id_number');
    if (!s.has_referral) out.push('referral');
  }
  return out;
}
