'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ADMIN_SCREENS, SCREENS } from '@/lib/permissions';

export function Nav({ allowed, admin }: { allowed: string[]; admin: boolean }) {
  const path = usePathname();
  const links = [...SCREENS.filter((s) => allowed.includes(s.perm)), ...(admin ? ADMIN_SCREENS : [])];
  return (
    <nav className="nav">
      {links.map((l) => {
        const active = l.href === '/' ? path === '/' : path.startsWith(l.href);
        return (
          <Link key={l.href} href={l.href} className={active ? 'active' : ''}>
            <span className="nav-icon" aria-hidden>{l.icon}</span>
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
