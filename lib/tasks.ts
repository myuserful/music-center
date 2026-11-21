/**
 * משימות: השדות של כל סוג, סדר העדיפויות ומי רואה מה.
 * קובץ בלי קוד שרת, כדי שגם הלוח והטופס (בדפדפן) ישתמשו בו.
 */
import type { Assignee, TaskType, Urgency } from './constants';
import type { Role } from './roles';
import type { Task } from './types';

type Need = 'required' | 'optional';
export type TaskTypeFields = {
  teacher?: Need;
  student?: Need;
  /** התאריך של האירוע (או "מיום") */
  dateFrom?: { label: string; need: Need };
  /** "ליום" */
  dateTo?: { label: string; need: Need };
  /** שעות (מ- עד), אופציונלי */
  times?: boolean;
  amount?: boolean;
  /** טקסט עזר מתחת לבחירת הסוג */
  hint?: string;
};

export const TASK_TYPE_FIELDS: Record<TaskType, TaskTypeFields> = {
  admin: { hint: 'משימה כללית. אפשר לתת דד ליין.' },
  schedule_change: {
    teacher: 'optional', student: 'optional',
    dateFrom: { label: 'מתאריך', need: 'required' },
    hint: 'שינוי בלוח השיעורים הקבוע. הכי דחוף: עולה לראש הרשימה.',
  },
  teacher_absent: { teacher: 'required', dateFrom: { label: 'תאריך', need: 'required' } },
  student_move: {
    student: 'required',
    dateFrom: { label: 'מיום', need: 'required' },
    dateTo: { label: 'ליום', need: 'required' },
  },
  student_absent: { student: 'required', dateFrom: { label: 'תאריך', need: 'required' }, times: true },
  makeup_lesson: { student: 'required', teacher: 'optional', dateFrom: { label: 'תאריך ההשלמה', need: 'optional' } },
  notify_parents: { student: 'required' },
  call_teacher: { teacher: 'required' },
  payment: { student: 'required', amount: true },
  health_fund: { student: 'required', hint: 'להשיג התחייבות או הפניה מקופת החולים.' },
};

/** משימה ישנה (לפני 0065) היא מנהלית */
export const typeOf = (t: Pick<Task, 'task_type'>): TaskType => t.task_type ?? 'admin';
export const urgencyOf = (t: Pick<Task, 'urgency'>): Urgency => t.urgency ?? 'normal';

/** מספר הימים מהיום עד התאריך (שלילי = עבר). שני התאריכים YYYY-MM-DD */
export function daysUntil(date: string, today: string): number {
  return Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
}

/** התאריך שקובע את העדיפות: המוקדם מבין הדד ליין ותאריכי המשימה */
export function taskDate(t: Pick<Task, 'due_date' | 'date_from' | 'date_to'>): string | null {
  const dates = [t.due_date, t.date_from, t.date_to].filter((d): d is string => !!d).sort();
  return dates[0] ?? null;
}

type Prioritized = Pick<Task, 'due_date' | 'date_from' | 'date_to' | 'task_type' | 'urgency' | 'status'>;

/** ניקוד לפי התאריך: כמה שקרוב יותר, גבוה יותר. באיחור: הכי גבוה */
function dateScore(days: number | null): number {
  if (days == null) return 0;
  if (days < 0) return 220 + Math.min(-days, 10) * 3;
  if (days === 0) return 200;
  if (days === 1) return 160;
  if (days === 2) return 130;
  if (days <= 7) return 100 - (days - 3) * 10;
  if (days <= 14) return 40;
  return 20;
}

const URGENCY_SCORE: Record<Urgency, number> = { high: 60, normal: 0, low: -30 };

/** שינוי במערכת השעות הכי דחוף, ואחריו משימות שקשורות לשיעור ביום מסוים */
const TYPE_SCORE: Record<TaskType, number> = {
  schedule_change: 40,
  teacher_absent: 20, student_move: 20, student_absent: 20, makeup_lesson: 20,
  notify_parents: 0, call_teacher: 0, payment: 0, health_fund: 0, admin: 0,
};

/**
 * ניקוד עדיפות: התאריך (הכי חשוב), הדחיפות והסוג.
 * משימה של היום תמיד מעל משימה רגילה בלי תאריך, גם אם היא דחופה.
 */
export function priorityScore(t: Prioritized, today: string): number {
  if (t.status === 'done') return -1000;
  const d = taskDate(t);
  return dateScore(d == null ? null : daysUntil(d, today)) + URGENCY_SCORE[urgencyOf(t)] + TYPE_SCORE[typeOf(t)];
}

/** מיון לפי עדיפות: ניקוד, ואז התאריך המוקדם, ואז הסדר הידני */
export function byPriority(today: string) {
  return (a: Task, b: Task) =>
    priorityScore(b, today) - priorityScore(a, today) ||
    (taskDate(a) ?? '9999').localeCompare(taskDate(b) ?? '9999') ||
    a.position - b.position || a.id - b.id;
}

/** משימה ש"קופצת" במסך הראשי: עד יומיים מהיום (או באיחור), או דחופה בלי תאריך */
export function isHot(t: Prioritized, today: string): boolean {
  if (t.status === 'done') return false;
  const d = taskDate(t);
  return d != null ? daysUntil(d, today) <= 2 : urgencyOf(t) === 'high';
}

/** "היום", "מחר", "באיחור"... לתצוגה */
export function dueLabel(date: string | null, today: string): { text: string; cls: string } | null {
  if (!date) return null;
  const [y, m, d] = date.split('-');
  const short = `${d}/${m}/${y.slice(2)}`;
  const n = daysUntil(date, today);
  if (n < 0) return { text: `באיחור · ${short}`, cls: 'late' };
  if (n === 0) return { text: `היום · ${short}`, cls: 'today' };
  if (n === 1) return { text: `מחר · ${short}`, cls: 'soon' };
  if (n <= 6) return { text: `בעוד ${n} ימים · ${short}`, cls: n <= 2 ? 'soon' : '' };
  return { text: short, cls: '' };
}

/**
 * מי רואה את המשימה (כמו ה-RLS ב-0065): מנהל הכול,
 * מזכירה משימות של מזכירה ומשימות שהיא פתחה.
 */
export function canSeeTask(t: Pick<Task, 'assignee' | 'created_by'>, role: Role | null, userId: string | null): boolean {
  if (role === 'admin') return true;
  if (role !== 'secretary') return false;
  return t.assignee === 'secretary' || (!!userId && t.created_by === userId);
}

/** מזכירה מוחקת רק מה שפתחה */
export function canDeleteTask(t: Pick<Task, 'created_by'>, role: Role | null, userId: string | null): boolean {
  return role === 'admin' || (role === 'secretary' && !!userId && t.created_by === userId);
}

/** האחראים שמופיעים בסינון בלוח */
export const FILTER_ASSIGNEES: Assignee[] = ['yanky', 'shevi', 'secretary'];

/** בדיקת שדות חובה לפי הסוג. מחזיר הודעת שגיאה או null */
export function missingField(
  type: TaskType,
  v: { teacher_id: number | null; student_id: number | null; date_from: string | null; date_to: string | null; time_from: string | null; time_to: string | null },
): string | null {
  const f = TASK_TYPE_FIELDS[type];
  if (f.teacher === 'required' && !v.teacher_id) return 'צריך לבחור מורה';
  if (f.student === 'required' && !v.student_id) return 'צריך לבחור תלמיד/ה';
  if (f.dateFrom?.need === 'required' && !v.date_from) return `חסר תאריך (${f.dateFrom.label})`;
  if (f.dateTo?.need === 'required' && !v.date_to) return `חסר תאריך (${f.dateTo.label})`;
  if (v.time_from && v.time_to && v.time_to <= v.time_from) return 'שעת הסיום צריכה להיות אחרי שעת ההתחלה';
  return null;
}
