import { describe, expect, it, vi } from 'vitest';
import { oncePerKey } from './oncePerKey';

describe('oncePerKey', () => {
  it('אחרי ריצה מוצלחת לא רץ שוב עד שהמפתח מתחלף', async () => {
    const run = vi.fn(async () => true);
    const once = oncePerKey(run);
    await once('2026-11-03');
    await once('2026-11-03');
    expect(run).toHaveBeenCalledTimes(1);
    await once('2026-11-04');
    expect(run).toHaveBeenCalledTimes(2);
  });

  it('בקשות במקביל מחכות לאותה ריצה', async () => {
    let finish = (_: boolean) => {};
    const run = vi.fn(() => new Promise<boolean>((r) => { finish = r; }));
    const once = oncePerKey(run);
    const both = Promise.all([once('d'), once('d')]);
    expect(run).toHaveBeenCalledTimes(1);
    finish(true);
    await both;
  });

  it('ריצה שנכשלה מנוסה שוב בבקשה הבאה', async () => {
    const run = vi.fn<() => Promise<boolean>>().mockResolvedValueOnce(false).mockResolvedValue(true);
    const once = oncePerKey(run);
    await once('d');
    await once('d');
    await once('d');
    expect(run).toHaveBeenCalledTimes(2);
  });

  it('חריגה מגיעה למי שחיכה, והריצה הבאה מתחילה מחדש', async () => {
    const run = vi.fn<() => Promise<boolean>>().mockRejectedValueOnce(new Error('x')).mockResolvedValue(true);
    const once = oncePerKey(run);
    await expect(once('d')).rejects.toThrow('x');
    await once('d');
    expect(run).toHaveBeenCalledTimes(2);
  });
});
