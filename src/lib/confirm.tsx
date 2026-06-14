import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react'
import { useT } from '../i18n'
import { useModal } from './useModal'
import { Icon } from '../components/Icon'

// A real in-app confirm dialog — replaces the platform `window.confirm()` (ugly,
// unstyled, blocks the JS thread, invisible to e2e) for the few HEAVY deletes
// that warrant a deliberate yes/no rather than the forgiving undo toast: losing
// a whole recipe, a household member (cascades to their routines), or a tag
// across every recipe. Light deletes still use the undo toast (useUndoableRemove).
//
// Promise-based so a caller reads naturally:
//   const confirm = useConfirm()
//   if (!(await confirm({ message, tone: 'danger' }))) return
//
// One <ConfirmProvider> mounts at the app root; only one dialog is ever open.
interface ConfirmOpts {
  message: string
  title?: string
  confirmLabel?: string
  cancelLabel?: string
  // 'danger' tints the confirm button as a destructive action (the default here,
  // since every current caller is a delete); 'default' for a neutral choice.
  tone?: 'danger' | 'default'
}
type Resolver = (ok: boolean) => void

const ConfirmContext = createContext<(opts: ConfirmOpts) => Promise<boolean>>(() => Promise.resolve(false))

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const t = useT()
  const [req, setReq] = useState<ConfirmOpts | null>(null)
  const resolverRef = useRef<Resolver | null>(null)
  const dialogRef = useRef<HTMLDivElement>(null)

  const settle = useCallback((ok: boolean) => {
    resolverRef.current?.(ok)
    resolverRef.current = null
    setReq(null)
  }, [])

  // Esc / scroll-lock / focus-trap; Esc resolves to "no" (same as Cancel).
  const cancel = useCallback(() => settle(false), [settle])
  useModal(dialogRef, cancel, { open: !!req })

  const confirm = useCallback((opts: ConfirmOpts) => {
    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve
      setReq(opts)
    })
  }, [])

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {req && (
        <>
          <div className="confirm-backdrop" onClick={cancel} aria-hidden="true" />
          <div ref={dialogRef} className="confirm" role="alertdialog" aria-modal="true" aria-label={req.title ?? t.common.confirmTitle}>
            <p className="confirm__msg">{req.message}</p>
            <div className="confirm__actions">
              <button type="button" className="btn btn--ghost" onClick={cancel}>
                {req.cancelLabel ?? t.common.cancel}
              </button>
              <button
                type="button"
                className={'btn' + (req.tone === 'default' ? ' btn--primary' : ' btn--danger')}
                onClick={() => settle(true)}
              >
                {req.tone !== 'default' && <Icon name="trash-bold" size={16} />}
                {req.confirmLabel ?? t.common.delete}
              </button>
            </div>
          </div>
        </>
      )}
    </ConfirmContext.Provider>
  )
}

export const useConfirm = () => useContext(ConfirmContext)
