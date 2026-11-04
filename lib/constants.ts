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

export type StudentStatus ='active' | 'undecided' | 'waiting' | 'inactive';
export const STUDENT_STATUSES: StudentStatus[] = ['active', 'undecided', 'waiting', 'inactive'];
export const STUDENT_STATUS_LABELS: Record<StudentStatus, string> = {
  active: 'פעיל/ה',
  undecided: 'מתלבט/ת',
  waiting: 'רשימת המתנה',
  inactive: 'לא פעיל/ה',
};

export type Status ='pending' | 'undecided' | 'confirmed';
export const STATUSES: Status[] = ['pending', 'undecided', 'confirmed'];
export const STATUS_LABELS: Record<Status, string> = {
  pending: 'ממתין לאישור הורים',
  undecided: 'בהתלבטות',
  confirmed: 'סופי',
};

// ---- טלפונים לבירורים ----
/** עמודות לוח הבירורים */
export type InquiryStatus = 'to_call' | 'no_answer' | 'undecided' | 'done';
export const INQUIRY_STATUSES: InquiryStatus[] = ['to_call', 'no_answer', 'undecided', 'done'];
export const INQUIRY_STATUS_LABELS: Record<InquiryStatus, string> = {
  to_call: 'צריך להתקשר',
  no_answer: 'לא ענו',
  undecided: 'ענו - מתלבטים',
  done: 'טופל',
};

export type Urgency = 'low' | 'normal' | 'high';
/** מהדחוף ביותר */
export const URGENCIES: Urgency[] = ['high', 'normal', 'low'];
export const URGENCY_LABELS: Record<Urgency, string> = { high: 'דחוף', normal: 'רגיל', low: 'לא דחוף' };

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
export type PaymentTrack = 'private' | 'maccabi_full' | 'maccabi_split' | 'fund_deposit' | 'trial' | 'unknown';
export const PAYMENT_TRACKS: PaymentTrack[] = ['private', 'maccabi_full', 'maccabi_split', 'fund_deposit', 'trial', 'unknown'];
export const PAYMENT_TRACK_LABELS: Record<PaymentTrack, string> = {
  private: 'פרטי',
  maccabi_full: 'מכבי: מחיר מלא מראש',
  maccabi_split: 'מכבי: חלק מראש + זיכוי מכבי',
  fund_deposit: 'קופה אחרת: פיקדון עד התחייבות',
  trial: 'שיעור ניסיון בלבד (לא ממשיך/ה)',
  unknown: 'לא ידוע / לבירור',
};

/** קופות שעובדות עם התחייבויות (פיקדון עד שההורים מביאים התחייבות) */
export type CommitmentFund = 'clalit' | 'leumit' | 'meuhedet';
export const COMMITMENT_FUNDS: CommitmentFund[] = ['clalit', 'leumit', 'meuhedet'];

export type PaymentMethod = 'cash' | 'credit' | 'transfer' | 'check' | 'standing_order';
export const PAYMENT_METHODS: PaymentMethod[] = ['cash', 'credit', 'transfer', 'check', 'standing_order'];
export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: 'מזומן',
  credit: 'אשראי',
  transfer: 'העברה בנקאית',
  check: "צ'ק",
  standing_order: 'הוראת קבע',
};

export type CheckStatus = 'pending' | 'deposited' | 'bounced';
export const CHECK_STATUS_LABELS: Record<CheckStatus, string> = {
  pending: 'ממתין להפקדה',
  deposited: 'הופקד',
  bounced: 'חזר',
};

/** התחום שכתוב באישור הקבלה לקופה ("... טיפולים בהבעה ויצירה" / "... טיפולים באומנות") */
export type ReceiptField = 'expression' | 'art';
export const RECEIPT_FIELD_LABELS: Record<ReceiptField, string> = {
  expression: 'הבעה ויצירה',
  art: 'אומנות',
};

/** סוג שורת חיוב: מחיר השיעור (או החלק שמשלמים מראש), החלק של מכבי שמשלמים אחר כך, פיקדון, ידני */
export type ChargeKind = 'lesson' | 'maccabi_later' | 'deposit' | 'manual';
export const CHARGE_KIND_LABELS: Record<ChargeKind, string> = {
  lesson: 'שיעור',
  maccabi_later: 'זיכוי מכבי',
  deposit: 'פיקדון',
  manual: 'ידני',
};
/** נוכחות שמחייבת: הגיע/ה, או לא הגיע/ה בלי הודעה */
export const BILLABLE: Attendance[] = ['present', 'absent'];

// ---- כספים: הכנסות והוצאות ----
export type TxKind = 'income' | 'expense';
export const TX_KIND_LABELS: Record<TxKind, string> = { income: 'הכנסה', expense: 'הוצאה' };

/** בנקים להצעה בטופס המורה (אפשר גם להקליד אחר) */
export const BANKS = [
  'בנק לאומי', 'בנק הפועלים', 'בנק דיסקונט', 'בנק מזרחי טפחות', 'הבנק הבינלאומי',
  'בנק מרכנתיל', 'בנק ירושלים', 'בנק הדואר', 'וואן זירו',
];

export type TxMethod ='bank_transfer' | 'credit' | 'cash' | 'check' | 'standing_order' | 'bit';
export const TX_METHODS: TxMethod[] = ['bank_transfer', 'credit', 'cash', 'check', 'standing_order', 'bit'];
export const TX_METHOD_LABELS: Record<TxMethod, string> = {
  bank_transfer: 'העברה בנקאית',
  credit: 'אשראי',
  cash: 'מזומן',
  check: "צ'ק",
  standing_order: 'הוראת קבע',
  bit: 'ביט / פייבוקס',
};

export const SALARY_CATEGORY = 'שכר מורים';
/** שכר מורים בנפרד. קבועות: חוזרות כל חודש. משתנות: כל חודש, בסכום לא קבוע. השקעה בעסק: חד-פעמי, לא נכנס לרווח מהפעילות */
export type ExpenseGroup = 'teachers' | 'fixed' | 'variable' | 'investment';
export const EXPENSE_GROUP_LABELS: Record<ExpenseGroup, string> = {
  teachers: SALARY_CATEGORY, fixed: 'הוצאה קבועה', variable: 'הוצאה משתנה', investment: 'השקעה בעסק',
};
export const FIXED_EXPENSES = [
  'שכירות', 'תשלום להודיה', 'חשמל ומים', 'ארנונה', 'ביטוח', 'הנהלת חשבונות', 'תוכנות ואינטרנט', 'טלפון', 'מיסים',
];
export const VARIABLE_EXPENSES = ['כיבוד', 'הדפסות', 'משרד', 'תיקונים ותחזוקה', 'פרסום', 'אירועים', 'עמלות בנק וסליקה', 'אחר'];
export const INVESTMENT_EXPENSES = ['ציוד וכלי נגינה', 'ריהוט', 'שיפוץ והתקנות', 'השקעה אחרת'];
/** הצעות לקטגוריה. אפשר גם להקליד ערך אחר */
export const EXPENSE_CATEGORIES = [SALARY_CATEGORY, ...FIXED_EXPENSES, ...VARIABLE_EXPENSES, ...INVESTMENT_EXPENSES];
export const INCOME_CATEGORIES = ['תרומה', 'מענק / תמיכה', 'הופעות ואירועים', 'השכרת חדרים', 'דמי רישום', 'מכירות', 'אחר'];
/** קטגוריות של הכנסות שנספרות אוטומטית */
export const PARENTS_INCOME = 'שכר לימוד - הורים';
export const PARENTS_REFUND = 'החזר להורים';
export const FUNDS_INCOME = 'קופות חולים';

// ---- סגירת יום (נוכחות) ----
export type Attendance = 'present' | 'absent' | 'excused' | 'cancelled';
export const ATTENDANCES: Attendance[] = ['present', 'absent', 'excused', 'cancelled'];
export const ATTENDANCE_LABELS: Record<Attendance, string> = {
  present: 'הגיע/ה',
  absent: 'לא הגיע/ה',
  excused: 'ביטל/ה מראש',
  cancelled: 'המורה ביטל/ה',
};
