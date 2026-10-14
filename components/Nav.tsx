'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const LINKS = [
  { href: '/', label: 'מסך ראשי', icon: '◉' },
  { href: '/assign', label: 'שיבוץ בגרירה', icon: '⇄' },
  { href: '/tasks', label: 'משימות', icon: '☑' },
  { href: '/calls', label: 'טלפונים להורים', icon: '☎' },
  { href: '/schedule', label: 'לוח שיעורים', icon: '▦' },
  { href: '/tracking', label: 'מעקב שיבוץ', icon: '✓' },
  { href: '/students', label: 'תלמידים', icon: '☺' },
  { href: '/payments', label: 'תשלומים', icon: '₪' },
  { href: '/finance', label: 'הכנסות והוצאות', icon: '⚖' },
  { href: '/teachers', label: 'מורים', icon: '♪' },
  { href: '/choirs', label: 'מקהלות', icon: '♫' },
  { href: '/branches', label: 'סניפים וחדרים', icon: '⌂' },
  { href: '/instruments', label: 'כלי נגינה', icon: '♬' },
];

export function Nav() {
  const path = usePathname();
  return (
    <nav className="nav">
      {LINKS.map((l) => {
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
