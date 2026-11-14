/**
 * כל ההרשאות שאפשר לתת לתפקיד (חוץ ממנהל, שתמיד רואה הכול).
 * קובץ בלי קוד שרת, כדי שגם התפריט (בדפדפן) יוכל להשתמש בו.
 */

export type Screen = { perm: string; href: string; label: string; icon: string };

/** המסכים, לפי הסדר בתפריט. ההרשאה של כל מסך היא שם הנתיב שלו */
export const SCREENS: Screen[] = [
  { perm: 'home', href: '/', label: 'מסך ראשי', icon: '◉' },
  { perm: 'assign', href: '/assign', label: 'שיבוץ בגרירה', icon: '⇄' },
  { perm: 'tasks', href: '/tasks', label: 'משימות', icon: '☑' },
  { perm: 'calls', href: '/calls', label: 'טלפונים להורים', icon: '☎' },
  { perm: 'schedule', href: '/schedule', label: 'לוח שיעורים', icon: '▦' },
  { perm: 'daily', href: '/daily', label: 'סגירת יום', icon: '✎' },
  { perm: 'tracking', href: '/tracking', label: 'מעקב שיבוץ', icon: '✓' },
  { perm: 'students', href: '/students', label: 'תלמידים', icon: '☺' },
  { perm: 'siblings', href: '/siblings', label: 'אחים', icon: '⚭' },
  { perm: 'funds', href: '/funds', label: 'קופות חולים', icon: '✚' },
  { perm: 'payments', href: '/payments', label: 'תשלומים', icon: '₪' },
  { perm: 'certificates', href: '/certificates', label: 'אישורי קבלה', icon: '❏' },
  { perm: 'payroll', href: '/payroll', label: 'שכר מורים', icon: '◷' },
  { perm: 'finance', href: '/finance', label: 'הכנסות והוצאות', icon: '⚖' },
  { perm: 'teachers', href: '/teachers', label: 'מורים', icon: '♪' },
  { perm: 'choirs', href: '/choirs', label: 'מקהלות', icon: '♫' },
  { perm: 'branches', href: '/branches', label: 'סניפים וחדרים', icon: '⌂' },
  { perm: 'instruments', href: '/instruments', label: 'כלי נגינה', icon: '♬' },
];

/** מסכים של מנהל בלבד, שאי אפשר לתת לתפקיד אחר */
export const ADMIN_SCREENS: Screen[] = [
  { perm: 'users', href: '/users', label: 'משתמשים', icon: '⚿' },
  { perm: 'permissions', href: '/permissions', label: 'הרשאות', icon: '⚙' },
];

/** פעולות רגישות בתוך מסכים */
export const ACTIONS = [
  { perm: 'delete_payments', label: 'מחיקת תשלומים וקבלות', hint: 'במסך התשלומים ובכרטיס התלמיד' },
  { perm: 'edit_prices', label: 'שינוי המחירון', hint: 'במסך התשלומים' },
] as const;

export const ALL_PERMS = [...SCREENS.map((s) => s.perm), ...ACTIONS.map((a) => a.perm)];

/** תפקידים שאפשר להגדיר להם הרשאות במסך (למורים ולהורים יהיו מסכים נפרדים) */
export const EDITABLE_ROLES = ['secretary'] as const;

/** ברירת מחדל למזכירה, עד שמריצים את 0064_role_permissions.sql */
export const DEFAULT_SECRETARY = SCREENS.map((s) => s.perm).filter((p) => p !== 'payroll' && p !== 'finance');

/** ההרשאה של נתיב (או null לנתיב שאינו מסך בתפריט) */
export function permForPath(path: string): string | null {
  if (path === '/') return 'home';
  const s = [...SCREENS, ...ADMIN_SCREENS].find((x) => x.href !== '/' && (path === x.href || path.startsWith(`${x.href}/`)));
  return s?.perm ?? null;
}
