export default function Skeleton({ rows = 4 }) {
  return (
    <div className="skeleton-list" role="status" aria-busy="true">
      <span className="sr-only">Loading…</span>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="skeleton" />
      ))}
    </div>
  )
}
