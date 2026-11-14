import { redirect } from 'next/navigation';
import { getRole } from '@/lib/roles';

/** מסך של מנהל בלבד */
export default async function AdminOnlyLayout({ children }: { children: React.ReactNode }) {
  if ((await getRole()) !== 'admin') redirect('/');
  return children;
}
