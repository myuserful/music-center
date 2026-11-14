/**
 * מצב עבודה מקומי בלי התחברות.
 * פעיל רק בהרצה על המחשב (npm run dev) וכש-AUTH_DISABLED=true.
 * ב-Vercel (production) הוא תמיד כבוי, וההתחברות נדרשת.
 */
export const LOCAL_NO_AUTH =
  process.env.NODE_ENV === 'development' && process.env.AUTH_DISABLED === 'true';
