import { describe, expect, it } from 'vitest';
import {
  addDays, attendedDates, dayRows, dayStats, hoursLabel, mobilePhone, moveRow, overdueDates, parseRows, scheduledRows, shortName, teacherDays,
  unknownTrackStudents, weekdayOf,
  type DayRow,
} from './day';
import type { PaymentTrack } from './constants';
import type { Contact, DayLesson, Lesson } from './types';

const lesson = (id: number, weekday: number | null, start: string | null, extra: Partial<Lesson> = {}): Lesson => ({
  id, student_id: id * 10, teacher_id: 1, instrument_id: 5, room_id: weekday === null ? null : 3, weekday,
  start_time: start, status: 'confirmed', notes: '', at_home: weekday === null, home_slot: weekday === null ? 1 : null, pair: false, ...extra,
});
const contact = (phone: string, is_primary = false): Contact =>
  ({ id: 1, student_id: 1, name: '', relation: '', phone, email: '', is_primary });

describe('day', () => {
  it('weekday of a date (Sunday = 0)', () => {
    expect(weekdayOf('2026-10-18')).toBe(0);
    expect(weekdayOf('2026-10-20')).toBe(2);
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
  });

  it('short name: first name and last initial', () => {
    expect(shortName({ first_name: 'משה', last_name: 'כהן' })).toBe("משה כ'");
    expect(shortName({ first_name: 'רחל', last_name: '' })).toBe('רחל');
  });

  it('prefers a mobile number', () => {
    expect(mobilePhone([contact('02-5555555', true), contact('052-1234567')])).toBe('052-1234567');
    expect(mobilePhone([contact('02-5555555')])).toBe('02-5555555');
    expect(mobilePhone([])).toBe('');
  });

  it('defaults to the weekly schedule of that weekday, sorted, without home lessons', () => {
    const lessons = [lesson(1, 2, '17:00:00'), lesson(2, 2, '16:30:00'), lesson(3, 3, '16:00:00'), lesson(4, null, null),
      lesson(5, 2, '16:00:00', { teacher_id: 2 })];
    expect(scheduledRows(lessons, 1, '2026-10-20').map((r) => [r.lesson_id, r.start_time])).toEqual([[2, '16:30'], [1, '17:00']]);
  });

  it('saved rows replace the schedule, also when a closed day is empty', () => {
    const lessons = [lesson(1, 2, '17:00:00')];
    const saved: DayLesson[] = [{
      id: 9, lesson_date: '2026-10-20', teacher_id: 1, student_id: 77, lesson_id: null, instrument_id: 5,
      start_time: '18:00:00', room_id: 3, attendance: 'absent', notes: '', substitute_id: 4, teacher_paid: null, pair: false,
    }];
    expect(dayRows(saved, lessons, 1, '2026-10-20', false).rows.map((r) => [r.student_id, r.substitute_id])).toEqual([[77, 4]]);
    expect(dayRows([], lessons, 1, '2026-10-20', false)).toMatchObject({ saved: false, rows: [{ lesson_id: 1 }] });
    expect(dayRows([], lessons, 1, '2026-10-20', true)).toEqual({ saved: true, rows: [] });
  });

  it('parses form rows and rejects bad ones', () => {
    const ok = [{ lesson_id: null, student_id: 3, instrument_id: 5, start_time: '16:15', room_id: null, attendance: 'present', notes: ' x ', substitute_id: 4, teacher_paid: null, pair: false, moved_from: null, moved_from_teacher: null }];
    expect(parseRows(JSON.stringify(ok), 1)).toEqual([{ ...ok[0], notes: 'x' }]);
    // מילוי מקום של המורה עצמו/ה = בלי מילוי מקום
    expect(parseRows(JSON.stringify([{ ...ok[0], substitute_id: 1 }]), 1)?.[0].substitute_id).toBeNull();
    expect(parseRows(JSON.stringify([{ ...ok[0], attendance: 'maybe' }]), 1)).toBeNull();
    expect(parseRows(JSON.stringify([{ ...ok[0], start_time: '4pm' }]), 1)).toBeNull();
    expect(parseRows('nope', 1)).toBeNull();
  });
});

describe('teacherDays', () => {
  const row = (id: number, date: string, teacher: number, sub: number | null, attendance: DayLesson['attendance'], time = '16:00:00'): DayLesson => ({
    id, lesson_date: date, teacher_id: teacher, student_id: id, lesson_id: null, instrument_id: null,
    start_time: time, room_id: null, attendance, notes: '', substitute_id: sub, teacher_paid: null, pair: false,
  });
  const closures = [{ teacher_id: 1, lesson_date: '2026-10-20' }];

  it('counts held lessons and hours, own lessons and substitute lessons', () => {
    const rows = [
      row(1, '2026-10-20', 1, null, 'present'), row(2, '2026-10-20', 1, null, 'absent', '16:30:00'),
      row(3, '2026-10-20', 1, null, 'excused', '17:00:00'),
      row(4, '2026-10-21', 2, 1, 'present'), // מילוי מקום אצל מורה 2
      row(5, '2026-10-22', 1, 3, 'present'), // מורה 3 מילא/ה את מקומי
    ];
    const days = teacherDays(rows, 1, closures, 30);
    expect(days.map((d) => d.date)).toEqual(['2026-10-22', '2026-10-21', '2026-10-20']);
    const [replacedDay, subDay, own] = days;
    expect(own).toMatchObject({ held: 2, minutes: 60, closed: true, substituteFor: [] });
    expect(own.lessons).toHaveLength(3);
    expect(subDay).toMatchObject({ held: 1, closed: false, substituteFor: [2] });
    expect(replacedDay).toMatchObject({ held: 0, lessons: [], replaced: [{ id: 5 }] });
  });

  it('hours label', () => {
    expect(hoursLabel(90)).toBe('1:30');
    expect(hoursLabel(0)).toBe('0:00');
  });
});

describe('attendedDates', () => {
  it('only lessons the student came to, on closed days, once per date', () => {
    const base = { teacher_id: 1, student_id: 9, lesson_id: null, instrument_id: null, start_time: null, room_id: null, notes: '', substitute_id: null, teacher_paid: null, pair: false };
    const rows: DayLesson[] = [
      { ...base, id: 1, lesson_date: '2026-10-27', attendance: 'present' },
      { ...base, id: 2, lesson_date: '2026-10-20', attendance: 'present' },
      { ...base, id: 3, lesson_date: '2026-10-20', attendance: 'present', teacher_id: 2 },
      { ...base, id: 4, lesson_date: '2026-10-13', attendance: 'absent' },
      { ...base, id: 5, lesson_date: '2026-11-03', attendance: 'present' },
    ];
    const closures = ['2026-10-27', '2026-10-20', '2026-10-13'].map((d) => ({ teacher_id: 1, lesson_date: d }));
    expect(attendedDates(rows, closures)).toEqual(['2026-10-20', '2026-10-27']);
  });
});

describe('moveRow', () => {
  const r = (student: number, time: string, extra: Partial<DayRow> = {}): DayRow => ({
    lesson_id: student * 10, student_id: student, instrument_id: 5, start_time: time, room_id: 3, attendance: 'present',
    notes: '', substitute_id: null, teacher_paid: null, pair: false, moved_from: null, moved_from_teacher: null, ...extra,
  });
  // רביעי 04/11 -> שני 02/11
  const base = { fromDate: '2026-11-04', fromTeacher: 1, toDate: '2026-11-02', toTeacher: 1, toTime: '15:00', toRoom: 4 };

  it('moves a student to another day, once, remembering where from', () => {
    const moved = moveRow({ ...base, fromRows: [r(1, '16:00'), r(2, '16:30', { pair: true })], toRows: [r(3, '16:00')], studentId: 2 });
    if (typeof moved === 'string') throw new Error(moved);
    expect(moved.from.map((x) => x.student_id)).toEqual([1]);
    expect(moved.to.map((x) => [x.student_id, x.start_time])).toEqual([[2, '15:00'], [3, '16:00']]);
    expect(moved.to[0]).toMatchObject({ lesson_id: 20, room_id: 4, pair: false, moved_from: '2026-11-04', moved_from_teacher: 1 });
  });

  it('moving again keeps the original day, and moving back clears it', () => {
    const there = r(2, '15:00', { moved_from: '2026-11-04', moved_from_teacher: 1 });
    const again = moveRow({ ...base, fromDate: '2026-11-02', toDate: '2026-11-03', fromRows: [there], toRows: [], studentId: 2 });
    expect(typeof again !== 'string' && again.to[0].moved_from).toBe('2026-11-04');
    const back = moveRow({ ...base, fromDate: '2026-11-02', toDate: '2026-11-04', fromRows: [there], toRows: [], studentId: 2 });
    expect(typeof back !== 'string' && back.to[0].moved_from).toBeNull();
  });

  it('refuses the same day and a student who is already there', () => {
    expect(typeof moveRow({ ...base, toDate: base.fromDate, fromRows: [r(1, '16:00')], toRows: [], studentId: 1 })).toBe('string');
    expect(typeof moveRow({ ...base, fromRows: [r(1, '16:00')], toRows: [r(1, '17:00')], studentId: 1 })).toBe('string');
    expect(typeof moveRow({ ...base, fromRows: [], toRows: [], studentId: 1 })).toBe('string');
  });
});

describe('closing the whole day', () => {
  it('finds billable students without a payment track', () => {
    const rows = [
      { student_id: 1, attendance: 'present' as const }, { student_id: 2, attendance: 'excused' as const },
      { student_id: 3, attendance: 'absent' as const }, { student_id: 4, attendance: 'present' as const },
    ];
    const tracks: Record<number, PaymentTrack> = { 1: 'unknown', 2: 'unknown', 3: 'unknown', 4: 'private' };
    // ביטול מראש לא מחויב, ולכן לא חוסם
    expect(unknownTrackStudents(rows, (id) => tracks[id])).toEqual([1, 3]);
  });

  it('auto-closes days 24 hours after they ended, from the start date, not twice', () => {
    const candidates = ['2026-10-28', '2026-11-01', '2026-11-02', '2026-11-03', '2026-11-02'];
    // ביום רביעי 04/11: יום שני נגמר לפני יותר מ-24 שעות, יום שלישי עוד לא
    expect(overdueDates(candidates, new Set(), '2026-11-01', '2026-11-04')).toEqual(['2026-11-01', '2026-11-02']);
    expect(overdueDates(candidates, new Set(['2026-11-01']), '2026-11-01', '2026-11-04')).toEqual(['2026-11-02']);
  });

  it('summarises the day', () => {
    const row = (id: number, student: number, attendance: DayLesson['attendance'], extra: Partial<DayLesson> = {}): DayLesson => ({
      id, lesson_date: '2026-11-02', teacher_id: 1, student_id: student, lesson_id: id, instrument_id: null,
      start_time: `16:${String(id * 10).padStart(2, '0')}:00`, room_id: null, attendance, notes: '', substitute_id: null,
      teacher_paid: null, pair: false, ...extra,
    });
    const rows = [
      row(1, 1, 'present'), row(2, 2, 'absent'), row(3, 3, 'excused', { teacher_paid: true }),
      row(4, 4, 'present', { teacher_id: 2, substitute_id: 3, lesson_id: null }), row(5, 5, 'cancelled', { moved_from: '2026-11-04' }),
    ];
    expect(dayStats(rows, [{ minutes: 10 }, { minutes: null }], [{ amount: 75 }, { amount: 140 }], 1, 30)).toEqual({
      teachers: 2, students: 2, lessons: 5, present: 2, absent: 1, excused: 1, cancelled: 1,
      substitutes: 1, added: 1, moved: 1, teacherMinutes: 4 * 30 + 10, extraMinutes: 10, charged: 215, unbilled: 1,
    });
  });
});
