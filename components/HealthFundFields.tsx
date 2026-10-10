'use client';

import { useState } from 'react';
import { HEALTH_FUND_LABELS, HEALTH_PLANS, type HealthFund } from '@/lib/constants';

/** קופת חולים וסוג מנוי: ההצעות לסוג המנוי משתנות לפי הקופה שנבחרה */
export function HealthFundFields({ fund, plan }: { fund: HealthFund | null; plan: string }) {
  const [current, setCurrent] = useState<HealthFund | ''>(fund ?? '');
  const plans = current ? HEALTH_PLANS[current] : [];

  return (
    <>
      <label>
        קופת חולים
        <select name="health_fund" value={current} onChange={(e) => setCurrent(e.target.value as HealthFund | '')}>
          <option value="">לא ידוע</option>
          {(Object.keys(HEALTH_FUND_LABELS) as HealthFund[]).map((f) => (
            <option key={f} value={f}>{HEALTH_FUND_LABELS[f]}</option>
          ))}
        </select>
      </label>
      <label>
        סוג מנוי
        <input name="health_plan" list="health-plans" defaultValue={plan} disabled={!current} placeholder={plans[0] ?? ''} />
        <datalist id="health-plans">
          {plans.map((p) => <option key={p} value={p} />)}
        </datalist>
      </label>
    </>
  );
}
