export default function ErrorBanner({ error, onClose }) {
  return (
    <div role="alert" aria-live="assertive">
      {error && (
        <div className="banner">
          <span>{error.message}</span>
          {onClose && (
            <button type="button" className="btn btn-ghost" onClick={onClose} aria-label="Dismiss error">
              ×
            </button>
          )}
        </div>
      )}
    </div>
  )
}
