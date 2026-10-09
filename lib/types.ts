import type { Status } from './constants';

export type Branch = { id: number; name: string; address: string };
export type Room = { id: number; branch_id: number; name: string };
export type Instrument = { id: number; name: string };
export type Teacher = {
  id: number; first_name: string; last_name: string; phone: string; email: string;
  room_id: number | null; notes: string; active: boolean;
};
export type TeacherHours = { id: number; teacher_id: number; weekday: number; start_time: string; end_time: string };
export type Student = {
  id: number; first_name: string; last_name: string; grade: string; birth_date: string | null;
  branch_id: number | null; requested_instrument_id: number | null; notes: string; active: boolean;
};
export type Contact = {
  id: number; student_id: number; name: string; relation: string; phone: string; email: string; is_primary: boolean;
};
export type Lesson = {
  id: number; student_id: number; teacher_id: number; instrument_id: number; room_id: number;
  weekday: number; start_time: string; status: Status; notes: string;
};
export type Choir = {
  id: number; name: string; teacher_id: number; room_id: number; weekday: number;
  start_time: string; end_time: string; notes: string;
};
export type Enrollment = { id: number; choir_id: number; student_id: number; status: Status };

type Named = { first_name: string; last_name: string };
export const fullName = (p: Named | null | undefined) => (p ? `${p.first_name} ${p.last_name}` : '');
