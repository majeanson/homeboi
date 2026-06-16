import { useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useModal } from '../lib/useModal'
import { useT } from '../i18n'
import { Icon } from './Icon'

// A centred dialog wrapper: one place that wires the shared modal behaviour
// (Escape, scroll-lock, focus-trap via useModal), the backdrop, and the ✕ close,
// so the dozen hand-rolled overlays stop drifting. Mount it conditionally and pass
// `open` — `{!open ⇒ null}`. Backdrop click and ✕ both close. Portalled to <body>
// so it escapes any transformed ancestor.
export function Modal({
  open,
  onClose,
  title,
  children,
  className,
}: {
  open: boolean
  onClose: () => void
  title?: ReactNode
  children: ReactNode
  className?: string
}) {
  const t = useT()
  const ref = useRef<HTMLDivElement>(null)
  useModal(ref, onClose, { open })
  if (!open) return null
  return createPortal(
    <div className="kit-modal__backdrop" onClick={onClose}>
      <div
        ref={ref}
        className={'kit-modal' + (className ? ` ${className}` : '')}
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <button type="button" className="kit-modal__close" onClick={onClose} aria-label={t.common.close} title={t.common.close}>
          <Icon name="x-bold" size={18} />
        </button>
        {title != null && <h3 className="kit-modal__title">{title}</h3>}
        {children}
      </div>
    </div>,
    document.body,
  )
}
