import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
const { studentEmail } = await import('./mail');

describe('studentEmail', () => {
  it('only a valid email, and not when marked "no email"', () => {
    expect(studentEmail({ email: ' dana@gmail.com ', no_email: false })).toBe('dana@gmail.com');
    expect(studentEmail({ email: 'dana@gmail', no_email: false })).toBe('');
    expect(studentEmail({ email: '', no_email: false })).toBe('');
    expect(studentEmail({ email: 'dana@gmail.com', no_email: true })).toBe('');
    expect(studentEmail(null)).toBe('');
  });
});
