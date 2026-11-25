import { useEffect, useRef } from 'react'

// Native <dialog>; children are mounted only while open so forms start fresh.
export default function Modal({ open, title, titleId = 'modal-title', onClose, children }) {
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
    <dialog ref={ref} className="dialog" aria-labelledby={titleId} onCancel={onClose}>
      {open && (
        <>
          <h2 id={titleId}>{title}</h2>
          {children}
        </>
      )}
    </dialog>
  )
}
