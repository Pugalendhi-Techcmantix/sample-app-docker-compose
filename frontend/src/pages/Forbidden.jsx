import { Link } from 'react-router-dom'

export default function Forbidden() {
  return (
    <section className="status-page">
      <h1>403 – Access denied</h1>
      <p>You do not have permission to view this page.</p>
      <Link to="/" className="btn">Back to dashboard</Link>
    </section>
  )
}
