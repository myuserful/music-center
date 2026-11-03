/**
 * עוטף בדיקה כך שתרוץ פעם אחת לכל מפתח (למשל פעם ביום): בקשות שמגיעות בזמן הריצה מחכות לאותה ריצה,
 * ואחרי ריצה מוצלחת לא רצים שוב עד שהמפתח מתחלף. ריצה שהחזירה false תנוסה שוב בבקשה הבאה.
 * הזיכרון הוא של השרת הנוכחי בלבד, אז כמה שרתים יריצו כל אחד פעם אחת - הבדיקה צריכה לעמוד בזה
 */
export function oncePerKey<A extends unknown[]>(run: (...args: A) => Promise<boolean>) {
  let doneKey: string | null = null;
  const inFlight = new Map<string, Promise<void>>();

  return (key: string, ...args: A): Promise<void> => {
    if (doneKey === key) return Promise.resolve();
    const running = inFlight.get(key);
    if (running) return running;
    const started = run(...args)
      .then((ok) => { if (ok) doneKey = key; })
      .finally(() => { inFlight.delete(key); });
    inFlight.set(key, started);
    return started;
  };
}
