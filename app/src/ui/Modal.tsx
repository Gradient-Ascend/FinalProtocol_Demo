import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'

// How many modals are showing. While one is, the keys are its own: the
// battle, the title and the map ask here before they act on a key.
let showing = 0

export function modalOpen(): boolean {
  return showing > 0
}

const FOCUSABLE = 'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

// A dialog over whatever is on screen. Focus moves into it when it opens and
// goes back to where it was when it closes; Tab stays inside it; Escape
// closes it.
export function Modal({ children, onClose, label }: { children: React.ReactNode; onClose: () => void; label: string }) {
  const panel = useRef<HTMLElement>(null)
  const close = useRef(onClose)
  close.current = onClose
  // What had focus before the dialog was drawn (read while rendering: opening
  // a dialog can make its opener inert, and an inert element loses focus).
  const [opener] = useState(() => (typeof document !== 'undefined' && document.activeElement instanceof HTMLElement ? document.activeElement : null))

  useLayoutEffect(() => {
    showing += 1
    panel.current?.focus({ preventScroll: true })
    const onKey = (event: KeyboardEvent) => {
      const node = panel.current
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        close.current()
      } else if (event.key === 'Tab' && node) {
        const stops = [...node.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(stop => stop.getClientRects().length > 0)
        const first = stops[0]
        const last = stops[stops.length - 1]
        const at = document.activeElement
        const outside = !at || !node.contains(at)
        if (!first || !last) {
          event.preventDefault()
          node.focus({ preventScroll: true })
        } else if (event.shiftKey ? outside || at === first || at === node : outside || at === last) {
          event.preventDefault()
          ;(event.shiftKey ? last : first).focus()
        }
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => {
      showing -= 1
      window.removeEventListener('keydown', onKey, true)
    }
  }, [])

  // After the dialog has gone, and anything it made inert is live again.
  useEffect(() => () => {
    if (opener?.isConnected) opener.focus({ preventScroll: true })
  }, [opener])

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label={label}>
      <section className="modal-panel" ref={panel} tabIndex={-1}>
        <button className="icon-button modal-close" onClick={onClose} aria-label="Close"><X size={18} /></button>
        {children}
      </section>
    </div>
  )
}
