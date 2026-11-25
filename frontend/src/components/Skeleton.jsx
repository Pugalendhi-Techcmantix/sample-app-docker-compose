// Loading placeholder shaped like the content it stands in for: list rows or stat cards.
export default function Skeleton({ rows = 4, variant = 'rows' }) {
  const items = Array.from({ length: rows }, (_, i) => i)
  return (
    <div className={variant === 'stats' ? 'skeleton-stats' : 'skeleton-list'} role="status" aria-busy="true">
      <span className="sr-only">Loading…</span>
      {items.map((i) =>
        variant === 'stats' ? (
          <div key={i} className="skeleton-row" aria-hidden="true">
            <div className="skeleton w1" />
            <div className="skeleton w2" />
          </div>
        ) : (
          <div key={i} className="skeleton-row" aria-hidden="true">
            <div className="skeleton dot" />
            <div className="skeleton w1" />
            <div className="skeleton w2" />
            <div className="skeleton w3" />
          </div>
        ),
      )}
    </div>
  )
}
