import { describe, expect, it } from 'vitest';
import {
  byPriority, canDeleteTask, canSeeTask, daysUntil, dueLabel, inDateRange, isHot, matchesAssignee, missingField, priorityScore, taskDate,
} from './tasks';
import type { Task } from './types';

const TODAY = '2026-11-21';
let nextId = 1;
const task = (t: Partial<Task> = {}): Task => ({
  id: nextId++, title: 'משימה', due_date: null, kind: '', description: '', assignee: 'management', status: 'todo',
  position: 0, created_at: '', task_type: 'admin', urgency: 'normal', ...t,
});
const order = (tasks: Task[]) => [...tasks].sort(byPriority(TODAY)).map((t) => t.title);

describe('daysUntil / taskDate', () => {
  it('ימים בין תאריכים', () => {
    expect(daysUntil('2026-11-21', TODAY)).toBe(0);
    expect(daysUntil('2026-11-22', TODAY)).toBe(1);
    expect(daysUntil('2026-11-19', TODAY)).toBe(-2);
    expect(daysUntil('2026-12-01', TODAY)).toBe(10);
  });
  it('התאריך הקובע הוא המוקדם מבין הדד ליין והתאריכים', () => {
    expect(taskDate(task())).toBeNull();
    expect(taskDate(task({ due_date: '2026-11-30', date_from: '2026-11-25' }))).toBe('2026-11-25');
    expect(taskDate(task({ date_from: '2026-11-28', date_to: '2026-11-24' }))).toBe('2026-11-24');
  });
});

describe('priorityScore / byPriority', () => {
  it('ככל שהתאריך קרוב יותר, גבוה יותר', () => {
    expect(order([
      task({ title: 'בלי תאריך' }),
      task({ title: 'בעוד חודש', due_date: '2026-12-21' }),
      task({ title: 'בעוד שבוע', due_date: '2026-11-28' }),
      task({ title: 'מחר', due_date: '2026-11-22' }),
      task({ title: 'היום', due_date: TODAY }),
      task({ title: 'באיחור', due_date: '2026-11-18' }),
    ])).toEqual(['באיחור', 'היום', 'מחר', 'בעוד שבוע', 'בעוד חודש', 'בלי תאריך']);
  });

  it('משימה של היום מעל משימה דחופה בלי תאריך', () => {
    expect(order([
      task({ title: 'דחוף בלי תאריך', urgency: 'high' }),
      task({ title: 'היום', due_date: TODAY }),
    ])).toEqual(['היום', 'דחוף בלי תאריך']);
  });

  it('באותו תאריך: דחוף לפני רגיל לפני לא דחוף', () => {
    expect(order([
      task({ title: 'לא דחוף', due_date: '2026-11-24', urgency: 'low' }),
      task({ title: 'דחוף', due_date: '2026-11-24', urgency: 'high' }),
      task({ title: 'רגיל', due_date: '2026-11-24' }),
    ])).toEqual(['דחוף', 'רגיל', 'לא דחוף']);
  });

  it('משימות שיבוץ לפני משימות כלליות באותו תאריך ובאותה דחיפות', () => {
    expect(order([
      task({ title: 'מנהלית', due_date: '2026-11-23', position: 1 }),
      task({ title: 'להודיע להורים', task_type: 'notify_parents', due_date: '2026-11-23', position: 2 }),
      task({ title: 'מורה לא מגיע', task_type: 'teacher_absent', date_from: '2026-11-23', position: 3 }),
      task({ title: 'שינוי מערכת', task_type: 'schedule_change', date_from: '2026-11-23', position: 4 }),
      task({ title: 'העברת שיעור', task_type: 'student_move', date_from: '2026-11-25', date_to: '2026-11-23', position: 5 }),
    ])).toEqual(['מורה לא מגיע', 'שינוי מערכת', 'העברת שיעור', 'מנהלית', 'להודיע להורים']);
  });

  it('דחוף בלי תאריך לפני רגיל בלי תאריך', () => {
    expect(order([task({ title: 'רגיל' }), task({ title: 'דחוף', urgency: 'high' })])).toEqual(['דחוף', 'רגיל']);
  });

  it('משימה שהסתיימה בתחתית', () => {
    expect(priorityScore(task({ status: 'done', due_date: TODAY }), TODAY)).toBeLessThan(priorityScore(task(), TODAY));
  });

  it('משימה ישנה בלי סוג ודחיפות (לפני 0065) נחשבת מנהלית רגילה', () => {
    const old = task({ due_date: TODAY, task_type: undefined, urgency: undefined });
    expect(priorityScore(old, TODAY)).toBe(priorityScore(task({ due_date: TODAY }), TODAY));
  });
});

describe('isHot', () => {
  it('קופצת: באיחור, היום, עד יומיים, או דחופה בלי תאריך', () => {
    expect(isHot(task({ due_date: '2026-11-15' }), TODAY)).toBe(true);
    expect(isHot(task({ due_date: TODAY }), TODAY)).toBe(true);
    expect(isHot(task({ date_from: '2026-11-23', task_type: 'teacher_absent' }), TODAY)).toBe(true);
    expect(isHot(task({ due_date: '2026-11-24' }), TODAY)).toBe(false);
    expect(isHot(task({ urgency: 'high' }), TODAY)).toBe(true);
    expect(isHot(task(), TODAY)).toBe(false);
    expect(isHot(task({ due_date: TODAY, status: 'done' }), TODAY)).toBe(false);
  });
});

describe('dueLabel', () => {
  it('טקסט לפי המרחק', () => {
    expect(dueLabel(null, TODAY)).toBeNull();
    expect(dueLabel('2026-11-20', TODAY)?.cls).toBe('late');
    expect(dueLabel(TODAY, TODAY)?.text).toBe('היום · 21/11/26');
    expect(dueLabel('2026-11-22', TODAY)?.text).toBe('מחר · 22/11/26');
    expect(dueLabel('2026-11-25', TODAY)?.text).toBe('בעוד 4 ימים · 25/11/26');
  });
});

describe('הרשאות', () => {
  const me = 'user-1';
  it('מנהל רואה הכול, מזכירה רק של מזכירה ומה שפתחה', () => {
    expect(canSeeTask({ assignee: 'manager', created_by: null }, 'admin', 'x')).toBe(true);
    expect(canSeeTask({ assignee: 'secretary', created_by: null }, 'secretary', me)).toBe(true);
    expect(canSeeTask({ assignee: 'manager', created_by: me }, 'secretary', me)).toBe(true);
    expect(canSeeTask({ assignee: 'management', created_by: 'other' }, 'secretary', me)).toBe(false);
    expect(canSeeTask({ assignee: 'management', created_by: null }, 'secretary', null)).toBe(false);
    expect(canSeeTask({ assignee: 'secretary', created_by: null }, 'teacher', me)).toBe(false);
  });
  it('מזכירה מוחקת רק מה שפתחה', () => {
    expect(canDeleteTask({ created_by: 'other' }, 'admin', me)).toBe(true);
    expect(canDeleteTask({ created_by: me }, 'secretary', me)).toBe(true);
    expect(canDeleteTask({ created_by: 'other' }, 'secretary', me)).toBe(false);
  });
});

describe('missingField', () => {
  const empty = { teacher_id: null, student_id: null, date_from: null, date_to: null, time_from: null, time_to: null };
  it('שדות חובה לפי הסוג', () => {
    expect(missingField('admin', empty)).toBeNull();
    expect(missingField('teacher_absent', empty)).toBe('צריך לבחור מורה');
    expect(missingField('teacher_absent', { ...empty, teacher_id: 3 })).toMatch(/חסר תאריך/);
    expect(missingField('teacher_absent', { ...empty, teacher_id: 3, date_from: TODAY })).toBeNull();
    expect(missingField('student_move', { ...empty, student_id: 1, date_from: TODAY })).toMatch(/ליום/);
    expect(missingField('student_absent', { ...empty, student_id: 1, date_from: TODAY })).toBeNull();
    expect(missingField('student_absent', { ...empty, student_id: 1, date_from: TODAY, time_from: '16:00', time_to: '15:00' }))
      .toMatch(/שעת הסיום/);
  });
});

describe('סינון', () => {
  it('מנהל ומנהלת רואים גם משימות של ההנהלה', () => {
    expect(matchesAssignee({ assignee: 'management' }, 'manager')).toBe(true);
    expect(matchesAssignee({ assignee: 'management' }, 'manageress')).toBe(true);
    expect(matchesAssignee({ assignee: 'management' }, 'secretary')).toBe(false);
    expect(matchesAssignee({ assignee: 'manager' }, 'manageress')).toBe(false);
    expect(matchesAssignee({ assignee: 'secretary' }, '')).toBe(true);
  });
  it('טווח תאריכים: אחד מהתאריכים בטווח', () => {
    const move = task({ date_from: '2026-11-23', date_to: '2026-11-25' });
    expect(inDateRange(move, '', '')).toBe(true);
    expect(inDateRange(move, '2026-11-25', '2026-11-30')).toBe(true);
    expect(inDateRange(move, '2026-11-24', '2026-11-24')).toBe(false);
    expect(inDateRange(move, '', '2026-11-23')).toBe(true);
    expect(inDateRange(task({ due_date: '2026-12-01' }), '2026-11-21', '2026-11-27')).toBe(false);
    expect(inDateRange(task(), TODAY, TODAY)).toBe(false);
  });
});
