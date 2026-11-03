import { HEALTH_FUND_LABELS, PAYMENT_TRACK_LABELS } from './constants';
import type { Student } from './types';

export type CheckItem = { key: string; text: string; ok: boolean };

type Fields = Pick<Student, 'health_fund' | 'payment_track' | 'id_number' | 'has_referral' | 'email' | 'no_email'>;

/**
 * מה מעודכן בכרטיס, להצגה בכרטיס הבירור: קופה, אופן תשלום ומייל.
 * במכבי גם תעודת זהות והפניה.
 */
export function inquiryChecklist(s: Fields): CheckItem[] {
  const paid = !!s.payment_track && s.payment_track !== 'unknown';
  const mail = !!s.email?.trim();
  return [
    { key: 'fund', ok: !!s.health_fund, text: s.health_fund ? `קופה: ${HEALTH_FUND_LABELS[s.health_fund]}` : 'קופה: לא מעודכנת' },
    { key: 'track', ok: paid, text: paid ? `אופן תשלום: ${PAYMENT_TRACK_LABELS[s.payment_track]}` : 'אופן תשלום: לא מעודכן' },
    ...(s.health_fund === 'maccabi' ? [
      { key: 'id', ok: !!s.id_number?.trim(), text: s.id_number?.trim() ? 'תעודת זהות: מעודכנת' : 'תעודת זהות: חסרה' },
      { key: 'referral', ok: !!s.has_referral, text: s.has_referral ? 'יש הפניה' : 'אין הפניה' },
    ] : []),
    { key: 'email', ok: mail, text: mail ? 'יש מייל' : s.no_email ? 'אין להם מייל' : 'מייל: חסר' },
  ];
}
