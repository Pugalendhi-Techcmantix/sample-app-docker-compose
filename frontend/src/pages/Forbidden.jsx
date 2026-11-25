import { ArrowLeft, ShieldOff } from 'lucide-react'
import { Link } from 'react-router-dom'

export default function Forbidden() {
  return (
    <section className="status-page">
      <span className="state-icon danger" aria-hidden="true"><ShieldOff size={22} strokeWidth={1.75} /></span>
      <h1>403 – Access denied</h1>
      <p>Your role does not include permission to view this page. If you need it, ask an administrator to update your role.</p>
      <Link to="/" className="btn"><ArrowLeft size={16} aria-hidden="true" /> Back to dashboard</Link>
    </section>
  )
}
