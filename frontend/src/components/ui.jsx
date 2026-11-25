// Small presentational pieces shared by pages: brand mark, avatar, page head, empty state.

export function BrandMark() {
  return (
    <span className="brand-mark" aria-hidden="true">
      <i /><i /><i /><i />
    </span>
  )
}

export function initials(name = '') {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return '?'
  const first = [...parts[0]][0]
  const last = parts.length > 1 ? [...parts[parts.length - 1]][0] : ''
  return (first + last).toUpperCase()
}

// Decorative: the person's name is always rendered next to it.
export function Avatar({ name, size, self }) {
  const cls = ['avatar', size === 'lg' && 'avatar-lg', self && 'avatar-self'].filter(Boolean).join(' ')
  return <span className={cls} aria-hidden="true">{initials(name)}</span>
}

export function PageHead({ title, description, children }) {
  return (
    <div className="page-head">
      <div className="page-title">
        <h1>{title}</h1>
        {description && <p className="page-desc">{description}</p>}
      </div>
      {children}
    </div>
  )
}

export function EmptyState({ icon: Icon, title, children, action }) {
  return (
    <div className="empty-state">
      <span className="state-icon" aria-hidden="true"><Icon size={22} strokeWidth={1.75} /></span>
      <p className="empty-title">{title}</p>
      {children && <p>{children}</p>}
      {action}
    </div>
  )
}
