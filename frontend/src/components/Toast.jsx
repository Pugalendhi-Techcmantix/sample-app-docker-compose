import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react'
import { CircleAlert, CircleCheck, X } from 'lucide-react'

const ToastContext = createContext(() => {})

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])
  const id = useRef(0)

  const dismiss = useCallback((tid) => setToasts((t) => t.filter((x) => x.id !== tid)), [])
  const toast = useMemo(
    () => (message, type = 'success') => {
      const tid = ++id.current
      setToasts((t) => [...t, { id: tid, message, type }])
      setTimeout(() => dismiss(tid), 4000)
    },
    [dismiss],
  )

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((t) => {
          const Icon = t.type === 'error' ? CircleAlert : CircleCheck
          return (
            <div key={t.id} className={`toast toast-${t.type}`}>
              <Icon size={18} aria-hidden="true" />
              <span>{t.message}</span>
              <button type="button" className="btn btn-ghost btn-icon" onClick={() => dismiss(t.id)} aria-label="Dismiss">
                <X size={16} aria-hidden="true" />
              </button>
            </div>
          )
        })}
      </div>
    </ToastContext.Provider>
  )
}

export const useToast = () => useContext(ToastContext)
