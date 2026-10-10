// גיבוי מקומי של כל הנתונים, בלי סיסמת מסד הנתונים (דרך המפתח הסודי ב-.env.local).
// הרצה: npm run backup   (אפשר לתת תיקיית יעד: npm run backup -- D:\גיבויים)
// יוצר שני קבצים: data.json (כל הטבלאות) ו-restore.sql (שחזור הנתונים ב-SQL Editor,
// אחרי שמריצים את קבצי supabase/migrations. מוחק קודם את הנתונים שבטבלאות).
import { mkdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY;
if (!url || !key) {
  console.error('חסרים NEXT_PUBLIC_SUPABASE_URL או SUPABASE_SECRET_KEY ב-.env.local');
  process.exit(1);
}
const headers = { apikey: key, Authorization: `Bearer ${key}` };

// סדר שחזור לפי קשרים בין טבלאות. טבלאות חדשות שלא ברשימה נכנסות בסוף
const ORDER = [
  'branches', 'rooms', 'instruments', 'teachers', 'teacher_instruments', 'teacher_branches',
  'teacher_hours', 'students', 'contacts', 'lessons', 'choirs', 'choir_enrollments', 'tasks',
];

async function get(path, extra = {}) {
  const res = await fetch(`${url}/rest/v1/${path}`, { headers: { ...headers, ...extra } });
  if (!res.ok) throw new Error(`${path}: ${res.status} ${await res.text()}`);
  return res.json();
}

const api = await get('', { Accept: 'application/openapi+json' });
const defs = api.definitions ?? {};
const tables = Object.keys(defs).sort((a, b) => {
  const i = (t) => (ORDER.includes(t) ? ORDER.indexOf(t) : ORDER.length);
  return i(a) - i(b) || a.localeCompare(b);
});

const PAGE = 1000;
const data = {};
for (const t of tables) {
  const cols = Object.keys(defs[t].properties ?? {});
  const pk = cols.filter((c) => defs[t].properties[c].description?.includes('<pk/>'));
  const order = (pk.length ? pk : cols).map((c) => `${c}.asc`).join(',');
  const rows = [];
  for (let from = 0; ; from += PAGE) {
    const page = await get(`${t}?select=*&order=${order}&limit=${PAGE}&offset=${from}`);
    rows.push(...page);
    if (page.length < PAGE) break;
  }
  data[t] = rows;
  console.log(`${t}: ${rows.length}`);
}

const stamp = new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Jerusalem' }).slice(0, 16).replace(/[ :]/g, '-');
const dir = join(process.argv[2] ?? join(homedir(), 'Documents', 'maktzev-backups'), `maktzev-${stamp}`);
mkdirSync(dir, { recursive: true });

const sql = [`-- גיבוי נתונים של מקצב, ${stamp}`, '-- להריץ אחרי קבצי supabase/migrations. מחליף את כל הנתונים שבטבלאות!', 'begin;',
  `truncate ${tables.join(', ')} restart identity cascade;`];
for (const t of tables) {
  const rows = data[t];
  if (!rows.length) continue;
  const json = JSON.stringify(rows);
  if (json.includes('$backup$')) throw new Error(`${t}: תוכן לא צפוי`);
  sql.push(`insert into ${t} overriding system value select * from json_populate_recordset(null::${t}, $backup$${json}$backup$);`);
  if ('id' in rows[0]) {
    sql.push(`select setval(pg_get_serial_sequence('${t}', 'id'), (select max(id) from ${t}));`);
  }
}
sql.push('commit;', '');

writeFileSync(join(dir, 'data.json'), JSON.stringify(data, null, 2));
writeFileSync(join(dir, 'restore.sql'), sql.join('\n'));
console.log(`\nנשמר ב: ${dir}`);
