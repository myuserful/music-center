import 'server-only';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import fontkit from '@pdf-lib/fontkit';
import { PDFDocument, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import { isoDate } from './age';

const FONTS = path.join(process.cwd(), 'assets', 'fonts');
const HEBREW = /[֐-׿]/;

/**
 * pdf-lib מצייר משמאל לימין, אז מסדרים את הטקסט לתצוגה: מפרקים לקטעים עבריים ולא-עבריים (ספרות, לטינית),
 * הופכים את סדר הקטעים ואת האותיות בקטעים העבריים. כל קטע מקבל את הגופן שמתאים לו
 */
export function visualRuns(text: string): { text: string; hebrew: boolean }[] {
  const runs: { text: string; hebrew: boolean }[] = [];
  for (const ch of text) {
    // רווח תמיד שייך לעברית (כדי שיישאר בין מספר למילה), פיסוק נצמד לקטע הנוכחי
    const hebrew = HEBREW.test(ch) || /\s/.test(ch) || (/["'.,:()\-·]/.test(ch) ? runs.at(-1)?.hebrew ?? true : false);
    const last = runs.at(-1);
    if (last && last.hebrew === hebrew) last.text += ch;
    else runs.push({ text: ch, hebrew });
  }
  return runs.reverse().map((r) => ({ hebrew: r.hebrew, text: r.hebrew ? [...r.text].reverse().join('') : r.text }));
}

export type Fonts = { he: PDFFont; latin: PDFFont };

/** טוען את הגופנים (עברית ולטינית) לתוך המסמך */
export async function loadFonts(doc: PDFDocument): Promise<Fonts> {
  doc.registerFontkit(fontkit);
  const [he, latin] = await Promise.all([
    readFile(path.join(FONTS, 'rubik-hebrew-500-normal.woff')),
    readFile(path.join(FONTS, 'rubik-latin-500-normal.woff')),
  ]);
  return { he: await doc.embedFont(he, { subset: true }), latin: await doc.embedFont(latin, { subset: true }) };
}

/** הקטעים לציור לפי הסדר החזותי, כל תו עם הגופן שיש בו צורה עבורו (בגופן העברי אין רווחים וספרות) */
function pieces(fonts: Fonts, text: string): { text: string; font: PDFFont }[] {
  const out: { text: string; font: PDFFont }[] = [];
  const has = (font: PDFFont, c: string) => font.getCharacterSet().includes(c.codePointAt(0)!);
  for (const r of visualRuns(text)) {
    for (const c of r.text) {
      const font = has(fonts.he, c) && (r.hebrew || !has(fonts.latin, c)) ? fonts.he : has(fonts.latin, c) ? fonts.latin : null;
      if (!font) continue; // תו שאין לו צורה באף גופן: מדלגים במקום להפיל את הקובץ
      const last = out.at(-1);
      if (last && last.font === font) last.text += c;
      else out.push({ text: c, font });
    }
  }
  // fontkit הופך בעצמו טקסט עברי בזמן הציור, אז מחזירים כל קטע עברי לסדר הלוגי שלו
  return out.map((p) => (p.font === fonts.he ? { ...p, text: [...p.text].reverse().join('') } : p));
}

/** רוחב הטקסט בנקודות */
export const textWidth = (fonts: Fonts, text: string, size: number) =>
  pieces(fonts, text).reduce((w, p) => w + p.font.widthOfTextAtSize(p.text, size), 0);

/** כותב טקסט כך שהקצה הימני שלו ב-right. bold = ציור כפול בהסטה קלה (יש לנו רק משקל אחד של הגופן) */
export function drawRight(page: PDFPage, fonts: Fonts, text: string, right: number, y: number, size: number, gray = 0, bold = false) {
  const ps = pieces(fonts, text);
  let x = right - ps.reduce((w, p) => w + p.font.widthOfTextAtSize(p.text, size), 0);
  for (const p of ps) {
    for (const dx of bold ? [0, size / 40] : [0]) {
      page.drawText(p.text, { x: x + dx, y, size, font: p.font, color: rgb(gray, gray, gray) });
    }
    x += p.font.widthOfTextAtSize(p.text, size);
  }
}

/** תשובת הורדה של קובץ PDF (inline = נפתח בדפדפן במקום לרדת) */
export function pdfResponse(bytes: Uint8Array, filename: string, { inline = false } = {}): Response {
  // תווים שאסורים בשמות קבצים ב-Windows (למשל ה-" של ת"ז)
  const name = filename.replace(/[\/:*?"<>|]/g, '');
  return new Response(Buffer.from(bytes), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename="file.pdf"; filename*=UTF-8''${encodeURIComponent(name)}`,
      'Cache-Control': 'no-store',
    },
  });
}

export type PdfColumn<T> = { header: string; width: number; value: (row: T) => string };

/** טבלה פשוטה מימין לשמאל ב-PDF (A4), עם כותרת ומספור שורות (אפשר לבטל), על פני כמה עמודים לפי הצורך */
export async function pdfTableResponse<T>(
  title: string, columns: PdfColumn<T>[], rows: T[], { numbered = true } = {},
): Promise<Response> {
  const doc = await PDFDocument.create();
  const fonts = await loadFonts(doc);
  doc.setTitle(title);

  const W = 595, H = 842, M = 48, ROW = 22, SIZE = 11;
  const cols: PdfColumn<T>[] = numbered ? [{ header: '#', width: 30, value: () => '' }, ...columns] : columns;
  let page = doc.addPage([W, H]);
  let y = H - M;

  const header = () => {
    let right = W - M;
    for (const c of cols) { drawRight(page, fonts, c.header, right - 4, y, SIZE, 0.4); right -= c.width; }
    y -= 8;
    page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 1, color: rgb(0.8, 0.8, 0.85) });
    y -= ROW - 6;
  };

  drawRight(page, fonts, title, W - M, y, 18);
  y -= 22;
  drawRight(page, fonts, `${rows.length} ${numbered ? 'תלמידים' : 'ת"ז'} · ${isoDate(new Date()).split('-').reverse().join('/')}`, W - M, y, 10, 0.4);
  y -= 30;
  header();

  rows.forEach((row, i) => {
    if (y < M) { page = doc.addPage([W, H]); y = H - M; header(); }
    let right = W - M;
    for (const c of cols) {
      drawRight(page, fonts, c.header === '#' ? String(i + 1) : c.value(row), right - 4, y, SIZE, c.header === '#' ? 0.5 : 0);
      right -= c.width;
    }
    y -= ROW;
  });

  return pdfResponse(await doc.save(), `${title} ${isoDate(new Date())}.pdf`);
}
