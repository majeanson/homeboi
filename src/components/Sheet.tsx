import { useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useModal } from '../lib/useModal'
import { useSwipeToDismiss } from '../lib/useSwipeToDismiss'
import { useT } from '../i18n'
import { Icon } from './Icon'

// The ONE bottom-sheet shell. AddSheet, ProfilePicker and the detail peek each
// hand-rolled the identical chrome — a `.scrim` backdrop, an always-mounted
// `.sheet` that slides in on a `.show` toggle, a `.grab` handle, an optional
// `.sheet__close` ✕ — plus the same two behaviour hooks (`useModal` for
// Esc/scroll-lock/focus-trap, `useSwipeToDismiss` for drag-the-handle-down). This
// folds that shell into one place so the sheets stop drifting; the body is the
// caller's `children`.
//
// ALWAYS-MOUNTED on purpose: the sheet stays in the DOM and toggles `.show` (the
// hooks no-op while `open` is false), so the CSS slide-in/out runs both ways. Mount
// it once at the page/shell level and flip `open`.
export function Sheet({
  open,
  onClose,
  ariaLabel,
  className,
  /** Render the top-right ✕. Default true; ProfilePicker passes false (it closes
   *  via the scrim / swipe / picking a face). */
  showClose = true,
  closeLabel,
  children,
}: {
  open: boolean
  onClose: () => void
  ariaLabel?: string
  /** Extra modifier on the sheet (e.g. `detail-sheet`, or a dynamic `help-armed`). */
  className?: string
  showClose?: boolean
  closeLabel?: string
  children: ReactNode
}) {
  const t = useT()
  const ref = useRef<HTMLDivElement>(null)
  // Esc / scroll-lock / focus-trap, plus drag-the-grab-handle-down to dismiss.
  useModal(ref, onClose, { open })
  useSwipeToDismiss(ref, onClose, { open })

  // Portal to <body>. The sheet is `position: fixed`, but a transformed ancestor
  // (e.g. AddSheet's own `.sheet.show` with `transform: translateY(0)`) becomes the
  // containing block for fixed descendants — so a Sheet nested inside another Sheet
  // (FaceSelect's "À qui" picker inside AddSheet) was positioned relative to the outer
  // box and its hide-transform slid it *within* that scrollable box instead of
  // off-screen, leaving the picker stuck open. Portaling escapes any such ancestor.
  return createPortal(
    <>
      <div className={'scrim' + (open ? ' show' : '')} onClick={onClose} aria-hidden="true" />
      <div
        ref={ref}
        className={'sheet' + (className ? ` ${className}` : '') + (open ? ' show' : '')}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
      >
        <div className="grab" aria-hidden="true" />
        {showClose && (
          <button type="button" className="sheet__close" onClick={onClose} aria-label={closeLabel ?? t.common.close}>
            <Icon name="x-bold" size={18} />
          </button>
        )}
        {children}
      </div>
    </>,
    document.body,
  )
}
