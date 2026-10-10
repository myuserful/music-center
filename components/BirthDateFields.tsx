'use client';

import { useState } from 'react';
import { ageFrom, birthDateFromAge } from '@/lib/age';

/** גיל ותאריך לידה מסונכרנים: הזנת גיל ממלאת תאריך משוער, הזנת תאריך מחשבת גיל */
export function BirthDateFields({ birthDate, approx }: { birthDate: string | null; approx: boolean }) {
  const [date, setDate] = useState(birthDate ?? '');
  const [age, setAge] = useState(birthDate ? String(ageFrom(birthDate)) : '');
  const [isApprox, setIsApprox] = useState(approx);

  return (
    <>
      <label>
        גיל
        <input
          type="number" min={0} max={99} inputMode="numeric" value={age}
          onChange={(e) => {
            const v = e.target.value;
            setAge(v);
            if (v === '') return;
            setDate(birthDateFromAge(Number(v)));
            setIsApprox(true);
          }}
        />
      </label>
      <label>
        תאריך לידה
        <input
          name="birth_date" type="date" value={date}
          onChange={(e) => {
            const v = e.target.value;
            setDate(v);
            setAge(v ? String(ageFrom(v)) : '');
            setIsApprox(false);
          }}
        />
      </label>
      <label className="check" style={{ alignSelf: 'end' }}>
        <input
          type="checkbox" name="birth_date_approx" checked={isApprox}
          onChange={(e) => setIsApprox(e.target.checked)}
        />
        תאריך לידה משוער
      </label>
    </>
  );
}
