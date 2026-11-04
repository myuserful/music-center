import type { createClient } from './supabase/server';

/** קבצי קבלות ואסמכתאות: בתיקייה הפרטית ב-Storage (הכנסות והוצאות, תשלום שכר) */
export const RECEIPT_BUCKET = 'receipts';
export const RECEIPT_ACCEPT = 'image/*,application/pdf,.doc,.docx,.xls,.xlsx';
const MAX_RECEIPT = 10 * 1024 * 1024;
const RECEIPT_TYPES = /^(image\/|application\/pdf$|application\/msword$|application\/vnd\.openxmlformats-officedocument\.|application\/vnd\.ms-excel$)/;

/** הקובץ מהטופס (או null אם לא נבחר), אחרי בדיקת סוג וגודל. מחרוזת = הודעת שגיאה */
export function receiptFile(fd: FormData, field = 'receipt'): File | null | string {
  const f = fd.get(field);
  if (!(f instanceof File) || f.size === 0) return null;
  if (f.size > MAX_RECEIPT) return 'הקובץ גדול מ-10MB';
  if (!RECEIPT_TYPES.test(f.type)) return 'אפשר לצרף תמונה, PDF, Word או Excel';
  return f;
}

export async function uploadReceipt(db: Awaited<ReturnType<typeof createClient>>, file: File, date: string) {
  const ext = (file.name.match(/\.([a-z0-9]{1,5})$/i)?.[1] ?? 'bin').toLowerCase();
  const path = `${date.slice(0, 7)}/${crypto.randomUUID()}.${ext}`;
  const { error } = await db.storage.from(RECEIPT_BUCKET).upload(path, file, { contentType: file.type });
  return error ? { error: error.message } : { path };
}
