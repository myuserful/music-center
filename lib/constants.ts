export const LESSON_MINUTES = 30;
export const CHOIR_CAPACITY = 15;
export const CHOIR_INSTRUMENT = 'מקהלה';

export const DAYS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
/** ימים שמוצגים בלוח: ראשון עד שישי */
export const BOARD_DAYS = [0, 1, 2, 3, 4, 5];

export type Status = 'pending' | 'undecided' | 'confirmed';
export const STATUSES: Status[] = ['pending', 'undecided', 'confirmed'];
export const STATUS_LABELS: Record<Status, string> = {
  pending: 'ממתין לאישור הורים',
  undecided: 'בהתלבטות',
  confirmed: 'סופי',
};
