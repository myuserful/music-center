'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

/** מוריד קובץ PDF עם הת"ז של התלמידים לפי הסינון (query) ומסמן אותם כנשלחו לקופה, ואז מרענן את הלוח */
export function SendToFundButton({ query, count, children, confirmText }: {
  query: string; count: number; children: React.ReactNode; confirmText: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function send() {
    if (!confirm(confirmText)) return;
    setBusy(true);
    setError('');
    try {
      const res = await fetch(`/funds/send${query}`, { method: 'POST' });
      if (!res.ok) throw new Error(await res.text());
      const name = /filename\*=UTF-8''([^;]+)/.exec(res.headers.get('Content-Disposition') ?? '')?.[1];
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement('a');
      a.href = url;
      a.download = name ? decodeURIComponent(name) : 'ids.pdf';
      a.click();
      URL.revokeObjectURL(url);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'שגיאה');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button type="button" className="btn btn-confirmed" onClick={send} disabled={busy || count === 0}
        title={count === 0 ? 'אין תלמידים ברשימה' : undefined}>
        {busy ? 'מוריד…' : children}
      </button>
      {error && <span className="flash flash-error" role="alert">{error}</span>}
    </>
  );
}
