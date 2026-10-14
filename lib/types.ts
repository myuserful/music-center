import type {
  Assignee, CallState, ChargeState, CheckStatus, Gender, HealthFund, Interest, PaymentMethod, PaymentTrack, Status, StudentStatus,
  TaskStatus, TeacherGender, TxKind, TxMethod,
} from './constants';

export type Branch = { id: number; name: string; address: string };
export type Room = { id: number; branch_id: number; name: string };
export type Instrument = { id: number; name: string };
export type Teacher = {
  id: number; first_name: string; last_name: string; phone: string; email: string;
  room_id: number | null; notes: string; active: boolean;
  gender: TeacherGender | null; teaches_young_boys: boolean; hourly_rate: number | null;
  interest: Interest | null; days_per_week: number | null; languages: string[];
};
export type TeacherHours = { id: number; teacher_id: number; weekday: number; start_time: string; end_time: string };
export type Student = {
  id: number; first_name: string; last_name: string; school: string; birth_date: string | null; birth_date_approx: boolean;
  branch_id: number | null; requested_instrument_id: number | null; notes: string; status: StudentStatus;
  gender: Gender | null; health_fund: HealthFund | null; health_plan: string; id_number: string;
  has_referral: boolean; hmo_reported: boolean; preferred_times: string; language: string;
  payment_track: PaymentTrack; standing_order: boolean; needs_review: boolean;
  call_state: CallState; call_attempts: number; last_call_at: string | null;
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
  price_private: number | null; price_maccabi_1: number | null; price_maccabi_2: number | null; commitments: number | null;
};
export type Enrollment = { id: number; choir_id: number; student_id: number; status: Status };
export type Task = {
  id: number; title: string; due_date: string | null; kind: string; description: string;
  assignee: Assignee; status: TaskStatus; position: number; created_at: string;
};

export type Transaction = {
  id: number; kind: TxKind; occurred_on: string; amount: number; category: string; counterparty: string;
  teacher_id: number | null; method: TxMethod; reference: string; recurring: boolean; notes: string;
  receipt_path: string | null; receipt_name: string;
};

export type BillingSettings = {
  lesson_private: number; lesson_maccabi_1: number; lesson_maccabi_2: number; lesson_commitments: number;
};
export type FundRate = { fund: string; amount: number | null };
export type Charge = {
  id: number; student_id: number; month: string; lesson_id: number | null; choir_id: number | null; part: number;
  description: string; payer: 'parents' | 'fund'; fund: string | null; amount: number | null;
  commitments: number | null; state: ChargeState;
};
export type Payment = {
  id: number; student_id: number; paid_on: string; amount: number; method: PaymentMethod; reference: string;
  check_number: string; check_bank: string; check_date: string | null; check_status: CheckStatus | null; notes: string;
};

type Named = { first_name: string; last_name: string };
export const fullName = (p: Named | null | undefined) => (p ? `${p.first_name} ${p.last_name}`.trim() : '');
