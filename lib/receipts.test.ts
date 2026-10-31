import { describe, expect, it, vi } from 'vitest';
import type { Contact, Student } from './types';

vi.mock('server-only', () => ({}));
const { receiptCustomer } = await import('./receipts');

const student = { id: 7, first_name: 'דני', last_name: 'כהן' } as Student;
const contact = (c: Partial<Contact>): Contact =>
  ({ id: 1, student_id: 7, name: '', relation: '', phone: '', email: '', is_primary: false, ...c });

describe('receiptCustomer', () => {
  it('the receipt is in the parent name (primary contact)', () => {
    const c = receiptCustomer(student, [
      contact({ id: 1, name: 'אבא כהן', phone: '02-5555555' }),
      contact({ id: 2, name: 'רחל כהן', is_primary: true, phone: '052-1234567', email: 'r@x.com' }),
    ]);
    expect(c).toEqual({ externalId: 'maktzev-contact-2', name: 'רחל כהן', phone: '052-1234567', email: 'r@x.com' });
  });

  it('no contact: the student name', () => {
    expect(receiptCustomer(student, [])).toMatchObject({ externalId: 'maktzev-student-7', name: 'דני כהן' });
  });
});
