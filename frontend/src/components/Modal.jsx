import { useEffect, useRef } from 'react'
import { X } from 'lucide-react'

// Native <dialog>: focus is trapped and Escape closes. Children are mounted only while open
// so forms start fresh. The close button comes last in the DOM so focus lands on the first
// field (or Cancel in a confirm) rather than on Close.
export default function Modal({ open, title, titleId = 'modal-title', onClose, wide, children }) {
  const ref = useRef(null)
  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (open && !d.open) {
      if (d.showModal) d.showModal()
      else d.setAttribute('open', '')
    }
    if (!open && d.open) {
      if (d.close) d.close()
      else d.removeAttribute('open')
    }
  }, [open])

  return (
    <dialog ref={ref} className={wide ? 'dialog dialog-wide' : 'dialog'} aria-labelledby={titleId} onCancel={onClose}>
      {open && (
        <>
          <h2 id={titleId}>{title}</h2>
          {children}
          <button type="button" className="btn btn-ghost btn-icon btn-sm dialog-close" onClick={onClose} aria-label="Close dialog">
            <X size={18} aria-hidden="true" />
          </button>
        </>
      )}
    </dialog>
  )
}
