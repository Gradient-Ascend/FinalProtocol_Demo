import { X } from 'lucide-react'

export function Modal({ children, onClose, label }: { children: React.ReactNode; onClose: () => void; label: string }) {
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label={label}>
      <section className="modal-panel">
        <button className="icon-button modal-close" onClick={onClose} aria-label="Close"><X size={18} /></button>
        {children}
      </section>
    </div>
  )
}
