import { describe, expect, it } from 'vitest';
import { teacherGrid } from './grid';
import { fmt, toMin } from './time';

const kinds = (g: ReturnType<typeof teacherGrid>, di = 0) => g.cells.map((r) => r[di].kind);

describe('teacherGrid', () => {
  const hours = [{ weekday: 0, start: toMin('16:15'), end: toMin('17:45') }];

  it('slots follow the teacher start time: 16:15, 16:45, 17:15', () => {
    const g = teacherGrid(hours, [], []);
    expect(g.days).toEqual([0]);
    expect(g.rows.map(fmt)).toEqual(['16:15', '16:30', '16:45', '17:00', '17:15', '17:30']);
    expect(kinds(g)).toEqual(['free', 'covered', 'free', 'covered', 'free', 'covered']);
    expect([...g.slotRows].map(fmt)).toEqual(['16:15', '16:45', '17:15']);
  });

  it('a lesson takes its slot', () => {
    const g = teacherGrid(hours, [{ weekday: 0, start: toMin('16:45') }], []);
    expect(kinds(g)).toEqual(['free', 'covered', 'lesson', 'covered', 'free', 'covered']);
    expect(g.cells[2][0]).toEqual({ kind: 'lesson', index: 0, span: 2 });
  });

  it('days with different start times keep their own sequence', () => {
    const g = teacherGrid(
      [...hours, { weekday: 3, start: toMin('16:00'), end: toMin('17:00') }], [], [],
    );
    expect(g.days).toEqual([0, 3]);
    expect(g.rows.map(fmt)[0]).toBe('16:00');
    // רביעי: 16:00, 16:30
    expect(kinds(g, 1)).toEqual(['free', 'covered', 'free', 'covered', 'off', 'off', 'off']);
    // ראשון: מתחיל ב-16:15
    expect(kinds(g, 0)).toEqual(['off', 'free', 'covered', 'free', 'covered', 'free', 'covered']);
  });

  it('a choir blocks the slots it overlaps', () => {
    const g = teacherGrid(hours, [], [{ weekday: 0, start: toMin('16:15'), end: toMin('17:15') }]);
    expect(g.cells[0][0]).toEqual({ kind: 'choir', index: 0, span: 4 });
    expect(kinds(g)).toEqual(['choir', 'covered', 'covered', 'covered', 'free', 'covered']);
  });

  it('no hours means no days', () => {
    expect(teacherGrid([], [], []).days).toEqual([]);
  });
});
