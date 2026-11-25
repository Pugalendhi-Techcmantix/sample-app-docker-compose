import Modal from './Modal.jsx'

export default function ConfirmDelete({ open, title, message, onConfirm, onCancel }) {
  return (
    <Modal open={open} title={title} titleId="confirm-title" onClose={onCancel}>
      <p>{message}</p>
      <div className="actions">
        <button type="button" className="btn" onClick={onCancel}>Cancel</button>
        <button type="button" className="btn btn-danger" onClick={onConfirm}>Delete</button>
      </div>
    </Modal>
  )
}
