export const LESSON_MINUTES = 30;
export const CHOIR_CAPACITY = 15;
export const CHOIR_INSTRUMENT = 'מקהלה';

export const DAYS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
/** ימים שמוצגים בלוח: ראשון עד שישי */
export const BOARD_DAYS = [0, 1, 2, 3, 4, 5];

export type Gender = 'boy' | 'girl';
export const GENDER_LABELS: Record<Gender, string> = { boy: 'בן', girl: 'בת' };

export type TeacherGender = 'male' | 'female';
export const TEACHER_GENDER_LABELS: Record<TeacherGender, string> = { male: 'גבר', female: 'אישה' };

export type Interest = 'yes' | 'no' | 'maybe' | 'follow_up';
export const INTEREST_LABELS: Record<Interest, string> = {
  yes: 'כן',
  maybe: 'אולי',
  follow_up: 'לחזור אליו/ה',
  no: 'לא',
};

export type HealthFund ='maccabi' | 'clalit' | 'leumit' | 'meuhedet' | 'private';
export const HEALTH_FUND_LABELS: Record<HealthFund, string> = {
  maccabi: 'מכבי',
  clalit: 'כללית',
  leumit: 'לאומית',
  meuhedet: 'מאוחדת',
  private: 'פרטי',
};
/** הצעות לסוג מנוי (ביטוח משלים) לפי קופה. אפשר גם להקליד ערך אחר */
export const HEALTH_PLANS: Record<HealthFund, string[]> = {
  maccabi: ['מכבי שלי', 'מכבי זהב', 'מכבי כסף'],
  clalit: ['כללית מושלם', 'מושלם זהב', 'מושלם פלטינום'],
  leumit: ['לאומית זהב', 'לאומית כסף'],
  meuhedet: ['מאוחדת שיא', 'מאוחדת עדיף'],
  private: [],
};

/** שפות נפוצות לבחירה. אפשר להוסיף גם שפה אחרת */
export const DEFAULT_LANGUAGE = 'עברית';
export const LANGUAGES = ['עברית', 'אידיש', 'אנגלית', 'צרפתית', 'רוסית', 'ספרדית', 'אמהרית', 'ערבית'];

export type StudentStatus ='active' | 'undecided' | 'inactive';
export const STUDENT_STATUSES: StudentStatus[] = ['active', 'undecided', 'inactive'];
export const STUDENT_STATUS_LABELS: Record<StudentStatus, string> = {
  active: 'פעיל/ה',
  undecided: 'מתלבט/ת',
  inactive: 'לא פעיל/ה',
};

export type Status ='pending' | 'undecided' | 'confirmed';
export const STATUSES: Status[] = ['pending', 'undecided', 'confirmed'];
export const STATUS_LABELS: Record<Status, string> = {
  pending: 'ממתין לאישור הורים',
  undecided: 'בהתלבטות',
  confirmed: 'סופי',
};

// ---- משימות ----
export type TaskStatus = 'todo' | 'doing' | 'done';
export const TASK_STATUSES: TaskStatus[] = ['todo', 'doing', 'done'];
export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  todo: 'ממתין',
  doing: 'כרגע עובדים על זה',
  done: 'הסתיים',
};

export type Assignee = 'yanky' | 'shevi' | 'both';
export const ASSIGNEES: Assignee[] = ['yanky', 'shevi', 'both'];
export const ASSIGNEE_LABELS: Record<Assignee, string> = { yanky: 'יענקי', shevi: 'שבי', both: 'שניהם' };

/** הצעות לאופי המשימה. אפשר גם להקליד ערך אחר */
export const TASK_KINDS = ['שיבוץ', 'טלפון להורים', 'מורים', 'תשלומים', 'קופות חולים', 'מנהלה', 'אחר'];

// ---- תשלומים ----
export type PaymentTrack = 'private' | 'maccabi' | 'commitment' | 'unknown';
export const PAYMENT_TRACKS: PaymentTrack[] = ['private', 'maccabi', 'commitment', 'unknown'];
export const PAYMENT_TRACK_LABELS: Record<PaymentTrack, string> = {
  private: 'פרטי',
  maccabi: 'מכבי (שני חלקים)',
  commitment: 'התחייבות דרך הקופה',
  unknown: 'לא ידוע / לבירור',
};

/** קופות שעובדות עם התחייבויות */
export type CommitmentFund = 'clalit' | 'leumit' | 'meuhedet';
export const COMMITMENT_FUNDS: CommitmentFund[] = ['clalit', 'leumit', 'meuhedet'];

export type PaymentMethod = 'cash' | 'credit' | 'check' | 'standing_order';
export const PAYMENT_METHODS: PaymentMethod[] = ['cash', 'credit', 'check', 'standing_order'];
export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: 'מזומן',
  credit: 'אשראי',
  check: "צ'ק",
  standing_order: 'הוראת קבע',
};

export type CheckStatus = 'pending' | 'deposited' | 'bounced';
export const CHECK_STATUS_LABELS: Record<CheckStatus, string> = {
  pending: 'ממתין להפקדה',
  deposited: 'הופקד',
  bounced: 'חזר',
};

export type ChargeState = 'due' | 'awaiting_refund' | 'to_submit' | 'submitted' | 'paid' | 'rejected' | 'cancelled';
export const CHARGE_STATE_LABELS: Record<ChargeState, string> = {
  due: 'לתשלום',
  awaiting_refund: 'ממתין להחזר ממכבי',
  to_submit: 'להגשה לקופה',
  submitted: 'הוגש לקופה',
  paid: 'שולם',
  rejected: 'נדחה',
  cancelled: 'בוטל',
};
