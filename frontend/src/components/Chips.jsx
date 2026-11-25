// Permission chips. View-only keys stay neutral; keys that can change data take the accent,
// so a role's write access is visible at a glance.
export const isWrite = (key) => !key.endsWith('.view')

// Users before roles, then from least to most power; unknown keys keep their order at the end.
const ORDER = ['users.view', 'users.create', 'users.edit', 'users.delete', 'roles.view', 'roles.manage']
const rank = (k) => (ORDER.includes(k) ? ORDER.indexOf(k) : ORDER.length)
const sorted = (items) => [...items].sort((a, b) => rank(a) - rank(b))

export default function Chips({ items, empty = 'None' }) {
  if (!items?.length) return <span className="muted">{empty}</span>
  return (
    <ul className="chips" translate="no">
      {sorted(items).map((k) => (
        <li key={k} className={isWrite(k) ? 'chip chip-write' : 'chip'}>{k}</li>
      ))}
    </ul>
  )
}

export function ChipsLegend() {
  return (
    <p className="chips-legend">
      <span><i aria-hidden="true" />View only</span>
      <span><i className="w" aria-hidden="true" />Can change data</span>
    </p>
  )
}
