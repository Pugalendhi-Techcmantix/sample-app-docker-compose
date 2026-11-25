import { useEffect, useRef } from 'react'

export default function ConfirmDelete({ open, title, message, onConfirm, onCancel }) {
  const ref = useRef(null)
  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (open && !d.open) d.showModal?.() ?? d.setAttribute('open', '')
    if (!open && d.open) d.close?.() ?? d.removeAttribute('open')
  }, [open])

  return (
    <dialog ref={ref} className="dialog" aria-labelledby="confirm-title" onCancel={onCancel}>
      {open && (
        <>
          <h2 id="confirm-title">{title}</h2>
          <p>{message}</p>
          <div className="actions">
            <button type="button" className="btn" onClick={onCancel}>Cancel</button>
            <button type="button" className="btn btn-danger" onClick={onConfirm}>Delete</button>
          </div>
        </>
      )}
    </dialog>
  )
}
