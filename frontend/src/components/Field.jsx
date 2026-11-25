export default function Field({ id, label, error, hint, children }) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {children}
      {hint && !error && <p className="hint" id={`${id}-hint`}>{hint}</p>}
      {error && <p id={`${id}-err`} className="field-error">{error}</p>}
    </div>
  )
}

// aria props for an input rendered inside <Field>
export const fieldAria = (id, error, hint) => ({
  'aria-invalid': error ? true : undefined,
  'aria-describedby': error ? `${id}-err` : hint ? `${id}-hint` : undefined,
})

// Turn an ApiError into { field: message }. A plain 409 maps to `conflictField` when given.
export function mapFieldErrors(err, conflictField) {
  const out = {}
  if (err.details?.length) for (const d of err.details) out[d.field] = d.message
  else if (err.status === 409 && conflictField) out[conflictField] = err.message
  return out
}
