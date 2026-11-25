export default function Chips({ items, empty = 'None' }) {
  if (!items?.length) return <span className="muted">{empty}</span>
  return (
    <ul className="chips">
      {items.map((k) => (
        <li key={k} className="chip">{k}</li>
      ))}
    </ul>
  )
}
