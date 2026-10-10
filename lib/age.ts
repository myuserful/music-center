/** תאריך כ-"YYYY-MM-DD" לפי השעון המקומי */
export function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** גיל בשנים שלמות לפי תאריך לידה "YYYY-MM-DD" */
export function ageFrom(birthDate: string, today = new Date()): number {
  const [y, m, d] = birthDate.split('-').map(Number);
  let age = today.getFullYear() - y;
  if (today.getMonth() + 1 < m || (today.getMonth() + 1 === m && today.getDate() < d)) age--;
  return age;
}

/** תאריך לידה משוער מגיל: היום לפני X שנים */
export function birthDateFromAge(age: number, today = new Date()): string {
  const d = new Date(today);
  d.setFullYear(today.getFullYear() - age);
  return isoDate(d);
}

/** תצוגה: "8" או "~8" כשהתאריך משוער */
export function ageLabel(birthDate: string | null, approx: boolean): string {
  if (!birthDate) return '';
  return `${approx ? '~' : ''}${ageFrom(birthDate)}`;
}
