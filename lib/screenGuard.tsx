import { redirect } from 'next/navigation';
import { can } from './roles';

/** layout שחוסם מסך למי שאין לו את ההרשאה שלו (חוזרים למסך הראשי) */
export function screenGuard(perm: string) {
  return async function ScreenGuard({ children }: { children: React.ReactNode }) {
    if (!(await can(perm))) redirect('/');
    return children;
  };
}
