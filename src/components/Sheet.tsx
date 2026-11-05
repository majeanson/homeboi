import { IconButton } from './IconButton'
import { useId, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useModal } from '../lib/useModal'
import { useSwipeToDismiss } from '../lib/useSwipeToDismiss'
import { useT } from '../i18n'


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
  title,
  ariaLabel,
  className,
  /** Render the top-right ✕. Default true; ProfilePicker passes false (it closes
   *  via the scrim / swipe / picking a face). */
  showClose = true,
  closeLabel,
  action,
  children,
}: {
  open: boolean
  onClose: () => void
  /** The sheet's heading, rendered as the first child and wired as its accessible name
   *  (2026-11-05 — before, every sheet rendered its own `<h3>` and the dialog had a name
   *  only when the caller remembered `ariaLabel`). Pass `ariaLabel` instead when the
   *  sheet opens on content with no heading (a picker of faces). */
  title?: ReactNode
  ariaLabel?: string
  /** Extra modifier on the sheet (e.g. `detail-sheet`, or a dynamic `help-armed`). */
  className?: string
  showClose?: boolean
  closeLabel?: string
  /** Optional control(s) beside the ✕ (e.g. the detail peek's ⋯ ActionMenu) —
   *  rendered before it in a `.sheet__head-actions` cluster. Without it, the ✕
   *  keeps its historical sticky-float markup untouched. */
  action?: ReactNode
  children: ReactNode
}) {
  const t = useT()
  const ref = useRef<HTMLDivElement>(null)
  const titleId = useId()
  // Esc / scroll-lock / focus-trap / the phone's back button, plus drag-the-grab-handle-
  // down to dismiss.
  useModal(ref, onClose, { open, history: true })
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
        aria-labelledby={title != null ? titleId : undefined}
        aria-label={title == null ? ariaLabel : undefined}
      >
        <div className="grab" aria-hidden="true" />
        {title != null && (
          <h3 id={titleId} className="sheet__title">
            {title}
          </h3>
        )}
        {action ? (
          // With an `action`, the cluster takes over the ✕'s sticky-float corner so
          // both controls ride together (flex kills the ✕'s own float inside it).
          <div className="sheet__head-actions">
            {action}
            {showClose && <IconButton icon="x-bold" label={closeLabel ?? t.common.close} onClick={onClose} className="sheet__close" />}
          </div>
        ) : (
          showClose && <IconButton icon="x-bold" label={closeLabel ?? t.common.close} onClick={onClose} className="sheet__close" />
        )}
        {children}
      </div>
    </>,
    document.body,
  )
}
