import 'server-only';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { PDFDocument, rgb, type PDFPage } from 'pdf-lib';
import { shortDate } from './activityDays';
import { RECEIPT_FIELD_LABELS, type Gender, type ReceiptField } from './constants';
import { drawRight, loadFonts, pdfResponse, textWidth, type Fonts } from './pdf';

/** פרטי העסק בראש הקבלה (כמו בחשבונית מ-SUMIT) */
const BUSINESS = {
  name: 'מקצב',
  sub: 'מוזיקה',
  details: 'ח"פ: 208803510 · w0533142707@gmail.com · טלפון: 03-5011502',
  address: 'גינות דוד, הרב כהנמן 92 · מתחם הסופרים, רחוב 10 600',
};

type Image = Awaited<ReturnType<PDFDocument['embedPng']>>;

/** הלוגו שבראש הדף והחתימה הסרוקה שבתחתיתו */
async function images(doc: PDFDocument): Promise<{ logo: Image; signature: Image }> {
  const file = (name: string) => readFile(path.join(process.cwd(), 'public', name));
  const [logo, signature] = await Promise.all([file('logo.png'), file('signature.png')]);
  return { logo: await doc.embedPng(logo), signature: await doc.embedPng(signature) };
}

export type ReceiptInput = {
  name: string; idNumber: string; gender: Gender | null;
  amount: number; dates: string[];
  number: string; issuedOn: string;
  /** התחום שכתוב באישור. ריק = הבעה ויצירה */
  field?: ReceiptField | null;
};

/** אישור קבלה כ-PDF לתצוגה בדפדפן */
export async function receiptPdf(r: ReceiptInput): Promise<Response> {
  const { bytes, filename } = await receiptPdfFile(r);
  return pdfResponse(bytes, filename, { inline: true });
}

/** אישור קבלה: מי, כמה פעילויות, באיזה סכום ובאילו תאריכים (לפי הקבלה שהקופות מבקשות) */
export async function receiptPdfFile(r: ReceiptInput): Promise<{ bytes: Uint8Array; filename: string }> {
  const doc = await PDFDocument.create();
  const fonts = await loadFonts(doc);
  const { logo, signature: sig } = await images(doc);
  doc.setTitle(`אישור קבלה - ${r.name}`);
  doc.setAuthor(BUSINESS.name);

  const W = 595, H = 842, M = 56, RIGHT = W - M, CENTER = W / 2;
  const center = (page: PDFPage, text: string, y: number, size: number, gray = 0, bold = false) =>
    drawRight(page, fonts, text, CENTER + textWidth(fonts, text, size) / 2, y, size, gray, bold);

  const amount = r.amount.toLocaleString('he-IL', { maximumFractionDigits: 2 });

  let page = doc.addPage([W, H]);
  header(page, fonts, logo, { W, H, M, RIGHT });
  let y = H - 180;

  // הנוסח קבוע לכולם, בדיוק כמו בקבלה לדוגמה
  drawRight(page, fonts, 'לכבוד', RIGHT, y, 13);
  const issued = shortDate(r.issuedOn);
  page.drawText(issued, { x: CENTER - 110, y, size: 13, font: fonts.latin });
  y -= 24;
  drawRight(page, fonts, 'לכל המעוניין שלום וברכה,', RIGHT, y, 13);
  y -= 40;

  // "אישור קבלה 21460, 21465" באמצע עם קו תחתון. המספרים כמו שהוקלדו, בלי היפוך כיווניות
  const title = 'אישור קבלה';
  const latinNumber = !!r.number && !/[֐-׿]/.test(r.number);
  const numW = !r.number ? 0 : latinNumber ? fonts.latin.widthOfTextAtSize(r.number, 13.5) : textWidth(fonts, r.number, 13.5);
  const total = textWidth(fonts, title, 13.5) + (r.number ? 6 + numW : 0);
  const right = CENTER + total / 2;
  drawRight(page, fonts, title, right, y, 13.5);
  if (r.number) {
    const numRight = right - total + numW;
    if (latinNumber) page.drawText(r.number, { x: numRight - numW, y, size: 13.5, font: fonts.latin });
    else drawRight(page, fonts, r.number, numRight, y, 13.5);
  }
  page.drawLine({ start: { x: right - total, y: y - 3 }, end: { x: right, y: y - 3 }, thickness: 0.8 });
  y -= 28;

  const body = [
    `הריני לאשר כי ${receiptWords(r.gender).child} ${r.name}${r.idNumber ? ` ת.ז ${r.idNumber}` : ''}`,
    `${receiptWords(r.gender).received} ${r.dates.length} טיפולים ב${RECEIPT_FIELD_LABELS[r.field ?? 'expression'] ?? RECEIPT_FIELD_LABELS.expression}`,
    `בעלות כוללת של ${amount} ש"ח`,
    'בתאריכים הנ"ל :',
  ];
  for (const t of body) { center(page, t, y, 13.5); y -= 27; }

  // התאריכים: עמודה אחת כמו בקבלה לדוגמה, ויותר עמודות כשיש הרבה
  const ROW = 22, COL_W = 90;
  // שורות שנכנסות מ-top ועד מעל בלוק החתימה (שצריך מקום לחתימה, לקו ולכיתוב שמתחתיו)
  const fitRows = (top: number) => Math.max(1, Math.floor((top - 150) / ROW));
  const cols = Math.min(4, Math.ceil(r.dates.length / fitRows(y)));
  let i = 0;
  while (i < r.dates.length) {
    const rows = Math.min(fitRows(y), Math.ceil((r.dates.length - i) / cols));
    const chunk = r.dates.slice(i, i + rows * cols);
    const usedCols = Math.ceil(chunk.length / rows);
    // הסדר: מלמעלה למטה, ואז העמודה הבאה משמאל (קריאה מימין לשמאל)
    chunk.forEach((d, k) => {
      const col = Math.floor(k / rows), row = k % rows;
      const cx = CENTER + ((usedCols - 1) / 2 - col) * COL_W;
      const t = shortDate(d);
      page.drawText(t, { x: cx - fonts.latin.widthOfTextAtSize(t, 12.5) / 2, y: y - row * ROW, size: 12.5, font: fonts.latin });
    });
    i += chunk.length;
    y -= rows * ROW;
    if (i < r.dates.length) {
      footer(page, fonts, { W, M });
      page = doc.addPage([W, H]);
      header(page, fonts, logo, { W, H, M, RIGHT });
      y = H - 170;
      center(page, `המשך התאריכים - ${r.name}`, y, 12, 0.35);
      y -= 34;
    }
  }

  // חתימה
  y = Math.min(y - 30, 190);
  drawRight(page, fonts, 'בברכה,', RIGHT - 40, y, 13);
  drawRight(page, fonts, BUSINESS.name, RIGHT - 40, y - 22, 13, 0, true);
  signature(page, fonts, sig, { M, y });
  footer(page, fonts, { W, M });

  return { bytes: await doc.save(), filename: `אישור קבלה - ${r.name} ${r.issuedOn}.pdf` };
}

/** "הילד ... קיבל" / "הילדה ... קיבלה". מין לא ידוע: "הילד/ה ... קיבל/ה" */
export function receiptWords(gender: Gender | null) {
  if (gender === 'boy') return { child: 'הילד', received: 'קיבל' };
  if (gender === 'girl') return { child: 'הילדה', received: 'קיבלה' };
  return { child: 'הילד/ה', received: 'קיבל/ה' };
}

/** החתימה הסרוקה יושבת על קו החתימה שבצד שמאל, והכיתוב "חתימה וחותמת" מתחתיו */
function signature(page: PDFPage, fonts: Fonts, sig: Image, { M, y }: { M: number; y: number }) {
  const BOX = 150, SIG_W = 120, line = y - 26;
  const h = SIG_W * (sig.height / sig.width);
  page.drawImage(sig, { x: M + (BOX - SIG_W) / 2, y: line + 5, width: SIG_W, height: h });
  page.drawLine({ start: { x: M, y: line }, end: { x: M + BOX, y: line }, thickness: 0.8, color: rgb(0.5, 0.5, 0.5) });
  drawRight(page, fonts, 'חתימה וחותמת', M + BOX, line - 15, 11, 0.4);
}

function header(page: PDFPage, fonts: Fonts, logo: Image,
  { W, H, M, RIGHT }: { W: number; H: number; M: number; RIGHT: number }) {
  const lw = 96, lh = lw * (logo.height / logo.width);
  page.drawImage(logo, { x: M, y: H - 46 - lh, width: lw, height: lh });
  drawRight(page, fonts, BUSINESS.name, RIGHT, H - 62, 20, 0, true);
  drawRight(page, fonts, BUSINESS.sub, RIGHT, H - 82, 12, 0.3);
  drawRight(page, fonts, BUSINESS.details, RIGHT, H - 104, 10, 0.3);
  drawRight(page, fonts, BUSINESS.address, RIGHT, H - 119, 10, 0.3);
  page.drawLine({ start: { x: M, y: H - 134 }, end: { x: W - M, y: H - 134 }, thickness: 0.8, color: rgb(0.8, 0.8, 0.8) });
}

function footer(page: PDFPage, fonts: Fonts, { W, M }: { W: number; M: number }) {
  page.drawLine({ start: { x: M, y: 50 }, end: { x: W - M, y: 50 }, thickness: 1, color: rgb(0.55, 0.55, 0.6) });
  const t = `${BUSINESS.name} · ${BUSINESS.address} · 03-5011502`;
  drawRight(page, fonts, t, W / 2 + textWidth(fonts, t, 9) / 2, 36, 9, 0.4);
}

export type InternalReceiptInput = {
  number: string; issuedOn: string; customer: string; studentName: string;
  amount: number; method: string; reference: string; description: string;
  /** פיקדון (חוזר להורים כשמביאים התחייבות) או תשלום רגיל */
  deposit: boolean;
};

/** כותרת האישור הפנימי */
export const internalReceiptTitle = (deposit: boolean, number: string) =>
  `${deposit ? 'אישור קבלת פיקדון' : 'אישור קבלת תשלום'} מס' ${number}`;

/** אישור קבלה פנימי (לא מ-SUMIT): למשל על פיקדון. לא קבלה לצורכי מס */
export async function internalReceiptPdf(r: InternalReceiptInput): Promise<Response> {
  const doc = await PDFDocument.create();
  const fonts = await loadFonts(doc);
  const { logo, signature: sig } = await images(doc);
  const title = internalReceiptTitle(r.deposit, r.number);
  doc.setTitle(`${title} - ${r.customer}`);
  doc.setAuthor(BUSINESS.name);

  const W = 595, H = 842, M = 56, RIGHT = W - M, CENTER = W / 2;
  const center = (text: string, y: number, size: number, gray = 0, bold = false) =>
    drawRight(page, fonts, text, CENTER + textWidth(fonts, text, size) / 2, y, size, gray, bold);
  const page = doc.addPage([W, H]);
  header(page, fonts, logo, { W, H, M, RIGHT });
  let y = H - 180;

  drawRight(page, fonts, `לכבוד ${r.customer}`, RIGHT, y, 13);
  const issued = shortDate(r.issuedOn);
  page.drawText(issued, { x: CENTER - 110, y, size: 13, font: fonts.latin });
  y -= 52;

  const tw = textWidth(fonts, title, 14);
  center(title, y, 14, 0, true);
  page.drawLine({ start: { x: CENTER - tw / 2, y: y - 4 }, end: { x: CENTER + tw / 2, y: y - 4 }, thickness: 0.8 });
  y -= 40;

  const amount = r.amount.toLocaleString('he-IL', { maximumFractionDigits: 2 });
  // רשימת תאריכים ("20.10, 27.10") בשורה משלה, בכתב לטיני משמאל לימין, כדי שהסדר לא יתהפך
  const dated = r.description.match(/^(.*בתאריכים)\s+([\d., ]+)$/);
  const lines = [
    `הריני לאשר כי התקבל מ${r.customer} סכום של ${amount} ש"ח`,
    `עבור ${r.studentName}`,
    dated ? dated[1] : r.description,
  ].filter(Boolean);
  for (const t of lines) { center(t, y, 13.5); y -= 28; }
  if (dated) {
    const t = dated[2].trim();
    page.drawText(t, { x: CENTER - fonts.latin.widthOfTextAtSize(t, 13) / 2, y, size: 13, font: fonts.latin });
    y -= 28;
  }
  center(`אמצעי תשלום: ${r.method}${r.reference ? ` · אסמכתא ${r.reference}` : ''}`, y, 13.5);
  y -= 28;
  if (r.deposit) {
    y -= 8;
    center('הפיקדון יוחזר עם הצגת התחייבות מקופת החולים', y, 12.5, 0.25);
    y -= 26;
  }

  y = Math.min(y - 40, 200);
  drawRight(page, fonts, 'בברכה,', RIGHT - 40, y, 13);
  drawRight(page, fonts, BUSINESS.name, RIGHT - 40, y - 22, 13, 0, true);
  signature(page, fonts, sig, { M, y });
  center('מסמך זה הוא אישור פנימי ואינו קבלה לצורכי מס', 80, 9.5, 0.45);
  footer(page, fonts, { W, M });

  return pdfResponse(await doc.save(), `${title} - ${r.customer} ${r.issuedOn}.pdf`, { inline: true });
}
