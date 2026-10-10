import 'server-only';
import ExcelJS from 'exceljs';
import { isoDate } from './age';

export type Column<T> = { header: string; width?: number; value: (row: T) => string | number | null };

/** קובץ אקסל מימין לשמאל: שורת כותרת מודגשת וקפואה, עם סינון אוטומטי */
export async function xlsxResponse<T>(name: string, columns: Column<T>[], rows: T[]): Promise<Response> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(name, { views: [{ rightToLeft: true, state: 'frozen', ySplit: 1 }] });
  ws.columns = columns.map((c) => ({ header: c.header, width: c.width ?? 16 }));
  for (const r of rows) ws.addRow(columns.map((c) => c.value(r) ?? ''));

  const header = ws.getRow(1);
  header.font = { bold: true };
  header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8E4F5' } };
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length } };
  ws.eachRow((row) => { row.alignment = { vertical: 'top', wrapText: true }; });

  const buf = await wb.xlsx.writeBuffer();
  const filename = `${name} ${isoDate(new Date())}.xlsx`;
  return new Response(buf, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      // שם קובץ בעברית: גרסה מקודדת לדפדפנים + גיבוי באנגלית
      'Content-Disposition': `attachment; filename="export.xlsx"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      'Cache-Control': 'no-store',
    },
  });
}

export const yesNo = (b: boolean) => (b ? 'כן' : '');
