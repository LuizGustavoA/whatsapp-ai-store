import { createPortal } from 'react-dom';

export default function ConfigModal({ title, open, onClose, onSave, saving, children }) {
  if (!open) {
    return null;
  }

  return createPortal(
    <div className="modal-overlay fin-config-modal-overlay" onClick={onClose}>
      <div className="modal-card fin-config-modal" onClick={(event) => event.stopPropagation()}>
        <div className="fin-modal-header">
          <h2>{title}</h2>
          <button type="button" className="fin-modal-close" onClick={onClose} aria-label="Fechar">
            ×
          </button>
        </div>
        <div className="fin-modal-body">{children}</div>
        <div className="modal-actions fin-modal-footer">
          <button type="button" className="btn-secondary" onClick={onClose} disabled={saving}>
            Cancelar
          </button>
          <button type="button" className="btn-primary inline" onClick={onSave} disabled={saving}>
            {saving ? 'Salvando...' : 'Salvar'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
