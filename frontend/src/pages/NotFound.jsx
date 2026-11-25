import { ArrowLeft, Compass } from 'lucide-react'
import { Link } from 'react-router-dom'

export default function NotFound() {
  return (
    <section className="status-page">
      <span className="state-icon" aria-hidden="true"><Compass size={22} strokeWidth={1.75} /></span>
      <h1>404 – Page not found</h1>
      <p>The page you are looking for does not exist. Check the address, or head back to the dashboard.</p>
      <Link to="/" className="btn"><ArrowLeft size={16} aria-hidden="true" /> Back to dashboard</Link>
    </section>
  )
}
