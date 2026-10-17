'use client';

export function PrintButton({ children = 'הדפסה' }: { children?: React.ReactNode }) {
  return <button type="button" className="btn btn-primary" onClick={() => window.print()}>{children}</button>;
}
