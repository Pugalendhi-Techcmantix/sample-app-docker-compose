import { CircleAlert, X } from 'lucide-react'

export default function ErrorBanner({ error, onClose }) {
  return (
    <div role="alert" aria-live="assertive">
      {error && (
        <div className="banner">
          <CircleAlert size={18} aria-hidden="true" />
          <span>{error.message}</span>
          {onClose && (
            <button type="button" className="btn btn-ghost btn-icon" onClick={onClose} aria-label="Dismiss error">
              <X size={16} aria-hidden="true" />
            </button>
          )}
        </div>
      )}
    </div>
  )
}
