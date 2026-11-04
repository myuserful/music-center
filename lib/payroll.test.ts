import { describe, expect, it } from 'vitest';
import { lessonCount, teacherPaidByRule, teacherPaidRows } from './day';
import { monthsMissingReceipt, monthWeeks, payrollRemaining, teacherPayroll } from './payroll';
import type { DayLesson, TeacherExtra } from './types';

describe('payrollRemaining', () => {
  it('סופר רק מי שעוד לא שולם', () => {
    expect(payrollRemaining([{ amount: 360, paid: null }, { amount: 1450, paid: 1450 }, { amount: 100, paid: null }]))
      .toEqual({ remaining: 460, unpaid: 2, noRate: 0, gap: 0 });
  });

  it('בלי תעריף לא נכנס לסכום אבל נספר בנפרד, ומי שיוצא לו 0 לא נספר', () => {
    expect(payrollRemaining([{ amount: null, paid: null }, { amount: 0, paid: null }]))
      .toEqual({ remaining: 0, unpaid: 0, noRate: 1, gap: 0 });
  });

  it('הפרש רק כשהחישוב גבוה ממה ששולם', () => {
    expect(payrollRemaining([{ amount: 1500, paid: 1450 }, { amount: 1000, paid: 1450 }]).gap).toBe(50);
  });
});

describe('monthsMissingReceipt', () => {
  const pay = (month: string, receipt: string | null, transaction_id: number | null = 1) => ({ month, transaction_id, transactions: { receipt_path: receipt } });

  it('סופר חודשים אחרים בלי קבלה, מהישן לחדש', () => {
    expect(monthsMissingReceipt([
      pay('2026-10-01', null), pay('2026-09-01', null), pay('2026-10-01', null), pay('2026-08-01', 'a.pdf'), pay('2026-11-01', null),
    ], '2026-11')).toEqual([{ month: '2026-09', count: 1 }, { month: '2026-10', count: 2 }]);
  });

  it('שכר שההוצאה שלו נמחקה לא נספר', () => {
    expect(monthsMissingReceipt([pay('2026-10-01', null, null)], '2026-11')).toEqual([]);
  });
});

let nextId = 1;
const row = (r: Partial<DayLesson>): DayLesson => ({
  id: nextId++, lesson_date: '2026-10-20', teacher_id: 1, student_id: nextId, lesson_id: null, instrument_id: null,
  start_time: '16:00:00', room_id: null, attendance: 'present', notes: '', substitute_id: null, teacher_paid: null, pair: false, ...r,
});
const closed = (dates: string[], teacher = 1) => dates.map((d) => ({ teacher_id: teacher, lesson_date: d }));

describe('teacher paid rule', () => {
  const day = [
    { attendance: 'present' as const, start_time: '16:00', who: 1 },
    { attendance: 'excused' as const, start_time: '16:30', who: 1 },
    { attendance: 'present' as const, start_time: '17:00', who: 1 },
    { attendance: 'excused' as const, start_time: '17:30', who: 1 },
  ];
  it('present / no-show paid, cancelled-in-advance only in the middle of the day, teacher cancelled never', () => {
    expect(teacherPaidByRule(day[0], day)).toBe(true);
    expect(teacherPaidByRule({ ...day[0], attendance: 'absent' }, day)).toBe(true);
    expect(teacherPaidByRule(day[1], day)).toBe(true); // באמצע: 16:00 לפני, 17:00 אחרי
    expect(teacherPaidByRule(day[3], day)).toBe(false); // בסוף היום
    expect(teacherPaidByRule({ ...day[1], attendance: 'cancelled' }, day)).toBe(false);
  });

  it('manual mark wins over the rule', () => {
    const rows = [row({ start_time: '16:00:00' }), row({ start_time: '16:30:00', attendance: 'excused', teacher_paid: false }), row({ start_time: '17:00:00' }),
      row({ start_time: '17:30:00', attendance: 'cancelled', teacher_paid: true })];
    expect(teacherPaidRows(rows).map((r) => r.start_time)).toEqual(['16:00:00', '17:00:00', '17:30:00']);
  });
});

describe('teacherPayroll', () => {
  const base = { month: '2026-10', extras: [] as TeacherExtra[], minWeeklyHours: null, rate: 100, today: '2026-11-15', lessonMinutes: 30, isActiveWeek: () => true };

  it('weeks of a month start on a Sunday inside it', () => {
    // אוקטובר 2026 מתחיל ביום חמישי: ראשון ראשון בחודש 4.10
    expect(monthWeeks('2026-10')).toEqual(['2026-10-04', '2026-10-11', '2026-10-18', '2026-10-25']);
  });

  it('own lessons, substitute lessons, extras and bonus; only closed days', () => {
    const rows = [
      row({ lesson_date: '2026-10-20' }), row({ lesson_date: '2026-10-20', start_time: '16:30:00', attendance: 'absent' }),
      row({ lesson_date: '2026-10-21', teacher_id: 2, substitute_id: 1 }), // מילוי מקום אצל מורה 2
      row({ lesson_date: '2026-10-22', teacher_id: 1, substitute_id: 3 }), // מורה 3 לימד/ה במקומי - לא אצלי
      row({ lesson_date: '2026-10-27' }), // היום לא נסגר
    ];
    const extras: TeacherExtra[] = [
      { id: 1, teacher_id: 1, extra_date: '2026-10-20', minutes: 30, amount: null, reason: 'חזרה' },
      { id: 2, teacher_id: 1, extra_date: '2026-10-25', minutes: null, amount: 200, reason: 'הביא מורה' },
    ];
    const p = teacherPayroll({
      ...base, teacherId: 1, rows, extras,
      closures: [...closed(['2026-10-20', '2026-10-22']), ...closed(['2026-10-21'], 2)],
    });
    expect(p).toMatchObject({ ownMinutes: 60, subMinutes: 30, extraMinutes: 30, bonus: 200, topupMinutes: 0, totalMinutes: 120, openDays: ['2026-10-27'] });
    expect(p.amount).toBe(200 + 200);
  });

  it('weekly minimum: top-up only for ended weeks with activity', () => {
    const rows = [row({ lesson_date: '2026-10-20' })]; // שבוע 18.10: חצי שעה
    const p = teacherPayroll({
      ...base, teacherId: 1, rows, closures: closed(['2026-10-20']), minWeeklyHours: 2, today: '2026-10-28',
      isActiveWeek: (s) => s !== '2026-10-04',
    });
    expect(p.weeks.map((w) => [w.start, w.status, w.topup])).toEqual([
      ['2026-10-04', 'no_activity', 0],
      ['2026-10-11', 'counted', 120],
      ['2026-10-18', 'counted', 90],
      ['2026-10-25', 'not_ended', 0],
    ]);
    expect(p.topupMinutes).toBe(210);
    expect(p.totalMinutes).toBe(240);
  });
});

describe('pair lessons for the teacher', () => {
  it('a pair (two students, same time) counts as one lesson', () => {
    const rows = [row({ pair: true }), row({ pair: true }), row({ start_time: '16:30:00' })];
    expect(lessonCount(rows)).toBe(2);
  });
});
