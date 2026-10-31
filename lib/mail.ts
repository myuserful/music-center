import 'server-only';
import nodemailer from 'nodemailer';

/** שליחת מייל מחשבון העסק (Gmail עם סיסמת אפליקציה, או כל שרת SMTP אחר). מוגדר? */
export const mailConfigured = () => !!(process.env.SMTP_USER && process.env.SMTP_PASS);

export const validEmail = (e: string | null | undefined) => !!e && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim());

/** כתובת המייל של התלמיד/ה (מהכרטיס), רק אם תקינה ולא סומן "אין מייל" */
export const studentEmail = (s: { email?: string | null; no_email?: boolean } | null) =>
  s && !s.no_email && validEmail(s.email) ? s.email!.trim() : '';

/** שולח מייל עם קבצים מצורפים. זורק שגיאה בעברית אם לא הצליח */
export async function sendMail(m: {
  to: string; subject: string; text: string;
  attachments?: { filename: string; content: Uint8Array; contentType?: string }[];
}): Promise<void> {
  if (!mailConfigured()) throw new Error('שליחת מיילים לא מוגדרת: חסרים SMTP_USER ו-SMTP_PASS (ב-.env.local וב-Vercel)');
  const port = Number(process.env.SMTP_PORT || 465);
  const transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com', port, secure: port === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
  try {
    await transport.sendMail({
      from: { name: process.env.SMTP_FROM_NAME || 'מקצב', address: process.env.SMTP_USER! },
      to: m.to, subject: m.subject, text: m.text,
      attachments: m.attachments?.map((a) => ({ ...a, content: Buffer.from(a.content) })),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/auth|535|534/i.test(msg)) throw new Error('שליחת המייל נכשלה: שם המשתמש או סיסמת האפליקציה של המייל שגויים');
    throw new Error(`שליחת המייל נכשלה: ${msg}`);
  }
}
