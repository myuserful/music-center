# מקצב - מערכת שיבוץ למרכז מוזיקה

> קצב אחד קדימה

מערכת לצוות המשרד: סניפים, חדרים, מורים ושעות עבודה, תלמידים ואנשי קשר, שיבוץ שיעורים פרטיים שבועיים (30 דק'), מקהלות (עד 15 ילדים) ותהליך אישור הורים.

**טכנולוגיה:** Next.js 15 (TypeScript) על **Vercel**, מסד נתונים והתחברות ב-**Supabase** (PostgreSQL).

---

## התקנה והעלאה (פעם אחת)

### 1. Supabase - מסד נתונים
1. נכנסים ל-[supabase.com](https://supabase.com) ויוצרים פרויקט חדש (אזור מומלץ: Frankfurt).
2. **SQL Editor > New query**, מדביקים את כל התוכן של `supabase/migrations/0001_init.sql` ולוחצים **Run**.
   זה יוצר את כל הטבלאות, את כללי האבטחה ואת נתוני הפתיחה (2 סניפים וכלי נגינה).
3. **Authentication > Sign In / Providers > Email**: לכבות את **Allow new users to sign up** (אין הרשמה עצמית).
4. **Authentication > Users > Add user > Create new user** לכל אחת מהצוות:
   - Email: `dana@staff.maktzev` (שם המשתמש + `@staff.maktzev`)
   - סיסמה
   - לסמן **Auto Confirm User**
   
   בכניסה למערכת מקלידים רק `dana` והסיסמה.
5. **Project Settings > API**: מעתיקים את **Project URL** ואת המפתח **anon public**.

### 2. Vercel - האתר
1. מעלים את התיקייה ל-GitHub (ריפו פרטי).
2. ב-[vercel.com](https://vercel.com): **Add New > Project**, בוחרים את הריפו.
3. ב-**Environment Variables** מוסיפים:
   | שם | ערך |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | ה-Project URL מ-Supabase |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | המפתח anon public |
   | `NEXT_PUBLIC_LOGIN_DOMAIN` | `staff.maktzev` |
4. **Deploy**. אחרי דקה-שתיים המערכת באוויר.

---

## הרצה מקומית (לפיתוח)

```bash
npm install
```

ממלאים את `.env.local` (לפי `.env.example`) ואז:

```bash
npm run dev
```

ונכנסים ל-http://localhost:3000

בדיקות:

```bash
npm test
```

---

## גיבוי שבועי

כל לילה בין רביעי לחמישי (02:00) GitHub Actions מגבה את כל הטבלאות לקובץ `maktzev-YYYY-MM-DD.sql.gz`
ומעלה אותו לתיקייה **"גיבויים - מקצב"** בגוגל דרייב של negina998877@gmail.com. גיבויים בני יותר מחצי שנה נמחקים.
ההגדרה: [`.github/workflows/db-backup.yml`](.github/workflows/db-backup.yml).

### הגדרה (פעם אחת)

1. **כתובת מסד הנתונים:** ב-Supabase לוחצים **Connect**, בוחרים **Session pooler** ומעתיקים את ה-URI
   (מחליפים את `[YOUR-PASSWORD]` בסיסמת מסד הנתונים).
2. **חיבור לגוגל דרייב:** במחשב מריצים `winget install Rclone.Rclone`, פותחים טרמינל חדש ומריצים
   `rclone config create gdrive drive scope=drive.file`. נפתח דפדפן: מתחברים עם **negina998877@gmail.com** ומאשרים.
   אחר כך `rclone config show gdrive` מציג את ההגדרה (שורה `[gdrive]` והשורות שאחריה).
3. **סודות ב-GitHub:** בריפו, **Settings > Secrets and variables > Actions > New repository secret**:
   - `SUPABASE_DB_URL` - ה-URI משלב 1
   - `RCLONE_CONF` - כל הפלט משלב 2, כולל השורה `[gdrive]`
4. **בדיקה:** בלשונית **Actions** בוחרים "גיבוי שבועי" ולוחצים **Run workflow**. אחרי דקה-שתיים הקובץ מופיע בדרייב.
   אם גיבוי נכשל, GitHub שולח מייל.

### שחזור

מחלצים את הקובץ (`.gz`), ובפרויקט Supabase **ריק** מדביקים את התוכן ב-SQL Editor ולוחצים Run
(או: `psql "<URI>" -f maktzev-YYYY-MM-DD.sql`).

## כללי עסק עיקריים

- השבוע: 0 = ראשון ... 5 = שישי (6 = שבת לא מוצג בלוח).
- שיעור פרטי: 30 דקות, מתחיל בשעה עגולה או בחצי שעה.
- לפני שמירת שיעור נבדק ש:
  - השעה בתוך שעות העבודה של המורה
  - המורה מלמד/ת את הכלי
  - אין התנגשות למורה, לחדר או לתלמיד/ה (כולל מקהלות)
- התנגשויות חסומות גם ברמת מסד הנתונים (אינדקסים ייחודיים).
- מקהלה: עד 15 ילדים (נאכף גם בטריגר במסד הנתונים). המורה חייב/ת להיות משויך/ת לכלי "מקהלה".
- סטטוס שיבוץ: `pending` ממתין לאישור הורים (ברירת מחדל) ← `confirmed` סופי. `undecided` בהתלבטות.
  סירוב הורים = מחיקת השיבוץ.
- אבטחה: כל הטבלאות עם Row Level Security. רק משתמשות מחוברות יכולות לקרוא ולכתוב.

## מבנה הקוד

```
app/login              מסך כניסה
app/(app)/page.tsx     מסך ראשי - מה דורש טיפול
app/(app)/schedule     לוח שיעורים שבועי (לפי סניף או לפי מורה + מקומות פנויים)
app/(app)/tracking     מעקב שיבוץ ואישור הורים
app/(app)/students     תלמידים, אנשי קשר, שיבוצים
app/(app)/teachers     מורים, כלים, שעות עבודה
app/(app)/lessons      טופס שיבוץ שיעור
app/(app)/choirs       מקהלות ורישום ילדים
app/(app)/branches     סניפים וחדרים
app/(app)/instruments  כלי נגינה
lib/rules.ts           בדיקות התנגשות ושיבוץ
lib/actions/           פעולות שמירה (Server Actions)
supabase/migrations/   סכמת מסד הנתונים
```
