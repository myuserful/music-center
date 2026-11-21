import 'server-only';
import type { PaymentMethod } from './constants';

/**
 * חיבור ל-SUMIT (הנהלת החשבונות): הפקת קבלות על תשלומים במזומן, העברה וצ'ק.
 * המפתחות ב-.env.local וב-Vercel: SUMIT_COMPANY_ID ו-SUMIT_API_KEY (המפתח הפרטי)
 */
const API = 'https://api.sumit.co.il';

/** סוגי מסמכים ב-SUMIT (מתוך מפרט ה-API) */
export const SUMIT_RECEIPT = 2;

export const sumitConfigured = () => !!process.env.SUMIT_COMPANY_ID && !!process.env.SUMIT_API_KEY;

type SumitResponse<T> = { Status: 0 | 1 | 2; UserErrorMessage: string | null; TechnicalErrorDetails: string | null; Data: T | null };

async function call<T>(path: string, body: Record<string, unknown>): Promise<T> {
  if (!sumitConfigured()) throw new Error('חסרים מפתחות SUMIT ב-.env.local (SUMIT_COMPANY_ID, SUMIT_API_KEY)');
  const res = await fetch(`${API}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Content-Language': 'he' },
    body: JSON.stringify({
      Credentials: { CompanyID: Number(process.env.SUMIT_COMPANY_ID), APIKey: process.env.SUMIT_API_KEY },
      ...body,
    }),
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`SUMIT לא זמין (${res.status})`);
  const json = (await res.json()) as SumitResponse<T>;
  if (json.Status !== 0 || !json.Data) throw new Error(`SUMIT: ${json.UserErrorMessage || json.TechnicalErrorDetails || 'שגיאה לא ידועה'}`);
  return json.Data;
}

/** בדיקת חיבור בלי ליצור כלום: מה מספר הקבלה הבא */
export async function sumitNextReceiptNumber(): Promise<number> {
  const d = await call<{ NextDocumentNumber: number }>('/accounting/general/getnextdocumentnumber/', { Type: SUMIT_RECEIPT });
  return d.NextDocumentNumber;
}

export type ReceiptRequest = {
  /** לקוח ב-SUMIT: לכל תלמיד/ה לקוח אחד (לפי המזהה אצלנו) */
  customer: { externalId: string; name: string; phone: string; email: string };
  description: string;
  date: string;
  amount: number;
  method: PaymentMethod;
  reference: string;
  check: { number: string; date: string | null };
  /** לשלוח את הקבלה במייל ללקוח */
  email: boolean;
};

/** פרטי התשלום בקבלה לפי אמצעי התשלום */
export function sumitPayment(r: Pick<ReceiptRequest, 'amount' | 'method' | 'reference' | 'check' | 'date'>) {
  switch (r.method) {
    case 'cash':
      return { Amount: r.amount, Type: 2, Details_Cash: {} };
    case 'transfer':
    case 'standing_order':
      return { Amount: r.amount, Type: 3, Details_BankTransfer: { Reference: r.reference || null, DueDate: r.date } };
    case 'check':
      return { Amount: r.amount, Type: 4, Details_Cheque: { ChequeNumber: r.check.number || null, DueDate: r.check.date ?? r.date } };
    case 'credit':
      // תשלומי אשראי עוברים דרך SUMIT, ושם כבר יוצאת קבלה
      throw new Error('תשלום באשראי מקבל קבלה ישירות ב-SUMIT');
  }
}

const isPdf = (b: Uint8Array) => b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46; // %PDF

/**
 * מוריד את קובץ הקבלה (PDF) מ-SUMIT, כמו שהוא, בלי לשנות בו דבר.
 * לפי מזהה המסמך (getpdf, מבקשים מקור אם עוד אפשר: אחרי שהמקור כבר הופק, SUMIT נותן "העתק נאמן למקור").
 * בלי מזהה: מהקישור שנשמר בהפקה. זורק שגיאה בעברית אם לא התקבל PDF
 */
export async function sumitDownloadDocument(doc: { documentId: number | null; url: string; number: string }): Promise<Uint8Array> {
  const fail = (why: string) => new Error(`לא הצלחתי להוריד את קבלה ${doc.number} מ-SUMIT (${why}). אפשר להוריד אותה ביד ולצרף כקובץ`);
  let res: Response;
  if (doc.documentId) {
    if (!sumitConfigured()) throw fail('חסרים מפתחות SUMIT');
    try {
      res = await fetch(`${API}/accounting/documents/getpdf/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Language': 'he' },
        body: JSON.stringify({
          Credentials: { CompanyID: Number(process.env.SUMIT_COMPANY_ID), APIKey: process.env.SUMIT_API_KEY },
          DocumentID: doc.documentId, Original: true,
        }),
        cache: 'no-store',
      });
    } catch { throw fail('אין חיבור'); }
  } else {
    let host = '';
    try { const u = new URL(doc.url); if (u.protocol === 'https:') host = u.hostname; } catch { /* קישור לא תקין */ }
    if (!/(^|\.)sumit\.co\.il$/.test(host)) throw fail('הקישור השמור אינו של SUMIT');
    try { res = await fetch(doc.url, { cache: 'no-store' }); } catch { throw fail('אין חיבור'); }
  }
  if (!res.ok) throw fail(`שגיאה ${res.status}`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (!isPdf(bytes)) {
    // שגיאה מ-SUMIT חוזרת כ-JSON עם הודעה
    let why = 'לא התקבל קובץ PDF';
    try { why = (JSON.parse(new TextDecoder().decode(bytes)) as SumitResponse<unknown>).UserErrorMessage || why; } catch { /* לא JSON */ }
    throw fail(why);
  }
  return bytes;
}

/** הפקת קבלה ב-SUMIT. מחזיר את מספר הקבלה ואת הקישור אליה */
export async function sumitCreateReceipt(r: ReceiptRequest) {
  const d = await call<{ DocumentID: number; DocumentNumber: number | null; DocumentDownloadURL: string | null }>(
    '/accounting/documents/create/', {
      Details: {
        Type: SUMIT_RECEIPT,
        Date: r.date,
        Description: r.description,
        Customer: {
          ExternalIdentifier: r.customer.externalId, Name: r.customer.name,
          Phone: r.customer.phone || null, EmailAddress: r.customer.email || null,
          SearchMode: 2, // לפי המזהה שלנו: אותו/ה תלמיד/ה = אותו לקוח, ולקוח חדש בפעם הראשונה
        },
        SendByEmail: r.email && r.customer.email ? { EmailAddress: r.customer.email, Original: true, SendAsPaymentRequest: false } : null,
      },
      Payments: [sumitPayment(r)],
    },
  );
  return { documentId: d.DocumentID, number: d.DocumentNumber == null ? '' : String(d.DocumentNumber), url: d.DocumentDownloadURL ?? '' };
}
