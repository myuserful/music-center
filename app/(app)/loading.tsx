/** מוצג מיד בלחיצה על קישור, עד שהנתונים מגיעים מהמסד */
export default function Loading() {
  return (
    <div className="page-loading" role="status" aria-label="טוען">
      <div className="skeleton skeleton-title" />
      <div className="skeleton skeleton-sub" />
      <div className="skeleton-row">
        {[0, 1, 2, 3].map((i) => <div key={i} className="skeleton skeleton-tile" />)}
      </div>
      <div className="skeleton skeleton-card" />
    </div>
  );
}
