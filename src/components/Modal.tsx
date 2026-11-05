import { IconButton } from './IconButton'
import { useId, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useModal } from '../lib/useModal'
import { useT } from '../i18n'

import { Cluster } from './Layout'

// A centred dialog wrapper: one place that wires the shared modal behaviour
// (Escape, scroll-lock, focus-trap, the phone's back button — via useModal), the
// backdrop, and the ✕ close, so the dozen hand-rolled overlays stop drifting. Mount it
// conditionally and pass `open` — `{!open ⇒ null}`. Backdrop click and ✕ both close.
// Portalled to <body> so it escapes any transformed ancestor.
//
// 2026-11-05 (wave 0.5): it had no accessible NAME (a `title` rendered an <h3> nobody
// referenced) and no footer slot, so every dialog hand-rolled its own button row
// (`fridge-modal__actions`, `kid-exit-modal__actions`…) — the fork the shell exists to
// prevent. Now: `title` is wired through aria-labelledby, `ariaLabel` covers a dialog
// without one, `footer` is the ONE button row (a right-aligned Cluster), and `size`
// names the three widths that existed as bespoke classes.
export function Modal({
  open,
  onClose,
  title,
  ariaLabel,
  footer,
  size = 'md',
  children,
  className,
}: {
  open: boolean
  onClose: () => void
  /** The heading; also the dialog's accessible name. Give `ariaLabel` instead when the
   *  dialog has no visible heading. */
  title?: ReactNode
  ariaLabel?: string
  /** The button row at the foot — right-aligned, wraps on a narrow phone. */
  footer?: ReactNode
  /** sm = a yes/no; md = a form (the default, 460px); full = a tall picker / preview. */
  size?: 'sm' | 'md' | 'full'
  children: ReactNode
  className?: string
}) {
  const t = useT()
  const ref = useRef<HTMLDivElement>(null)
  const titleId = useId()
  useModal(ref, onClose, { open, history: true })
  if (!open) return null
  return createPortal(
    <div className="kit-modal__backdrop" onClick={onClose}>
      <div
        ref={ref}
        className={'kit-modal' + (size !== 'md' ? ` kit-modal--${size}` : '') + (className ? ` ${className}` : '')}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title != null ? titleId : undefined}
        aria-label={title == null ? ariaLabel : undefined}
        onClick={(e) => e.stopPropagation()}
      >
        <IconButton icon="x-bold" label={t.common.close} onClick={onClose} variant="bare" className="kit-modal__close" />
        {title != null && (
          <h3 id={titleId} className="kit-modal__title">
            {title}
          </h3>
        )}
        {children}
        {footer != null && (
          <Cluster justify="end" className="kit-modal__footer">
            {footer}
          </Cluster>
        )}
      </div>
    </div>,
    document.body,
  )
}
