import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { useT } from '../i18n'
import { useModal } from './useModal'
import { Icon } from '../components/Icon'

// A real in-app confirm dialog — replaces the platform `window.confirm()` (ugly,
// unstyled, blocks the JS thread, invisible to e2e) for the few HEAVY deletes
// that warrant a deliberate yes/no rather than the forgiving undo toast: losing
// a whole recipe, a household member (cascades to their routines), or a tag
// across every recipe. Light deletes still use the undo toast (useDeferredRemoval).
//
// Promise-based so a caller reads naturally:
//   const confirm = useConfirm()
//   if (!(await confirm({ message, tone: 'danger' }))) return
//
// THE PASSWORD SHAPE (STATE.md §4-L L5, 2026-09-16). A wall tablet is often signed in
// as the operator and a phone is left on a counter, so a session proves "someone in
// this house", not "the account's owner". The irreversible doors — revoking the other
// parent, ending every session, restoring a backup over the live content — re-ask the
// one thing a cookie does not carry. Same dialog, one extra field:
//   const pw = await confirm({ message, input: { kind: 'password', label } })
//   if (pw === null) return          // cancelled
//   await api(…, { body: { …, password: pw } })
// The dialog never verifies the password itself (the endpoint does, through
// functions/_lib/sudo.ts); it only makes sure the person typed one.
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
interface ConfirmInputOpts extends ConfirmOpts {
  // Ask for a value before confirming. 'password' renders a masked field; the
  // promise resolves to the typed string, or null on cancel.
  input: { kind: 'password'; label: string }
}
type Resolver = (value: boolean | string | null) => void

interface ConfirmFn {
  (opts: ConfirmInputOpts): Promise<string | null>
  (opts: ConfirmOpts): Promise<boolean>
}

const ConfirmContext = createContext<ConfirmFn>((() => Promise.resolve(false)) as unknown as ConfirmFn)

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const t = useT()
  const [req, setReq] = useState<ConfirmOpts | ConfirmInputOpts | null>(null)
  const [value, setValue] = useState('')
  const resolverRef = useRef<Resolver | null>(null)
  const dialogRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const settle = useCallback((v: boolean | string | null) => {
    resolverRef.current?.(v)
    resolverRef.current = null
    setReq(null)
    setValue('')
  }, [])

  const withInput = !!req && 'input' in req && !!req.input
  // Esc / scroll-lock / focus-trap; Esc resolves to "no" (same as Cancel).
  const cancel = useCallback(() => settle(withInput ? null : false), [settle, withInput])
  useModal(dialogRef, cancel, { open: !!req })
  // The field takes focus on open: the whole dialog exists to receive it.
  useEffect(() => {
    if (withInput) inputRef.current?.focus()
  }, [withInput])

  const confirm = useCallback(((opts: ConfirmOpts | ConfirmInputOpts) => {
    return new Promise<boolean | string | null>((resolve) => {
      resolverRef.current = resolve
      setValue('')
      setReq(opts)
    })
  }) as ConfirmFn, [])

  const ok = () => settle(withInput ? value : true)

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {req && (
        <>
          <div className="confirm-backdrop" onClick={cancel} aria-hidden="true" />
          <div ref={dialogRef} className="confirm" role="alertdialog" aria-modal="true" aria-label={req.title ?? t.common.confirmTitle}>
            <p className="confirm__msg">{req.message}</p>
            {withInput && (
              <label className="confirm__input">
                <span className="field__label">{(req as ConfirmInputOpts).input.label}</span>
                <input
                  ref={inputRef}
                  className="input"
                  type="password"
                  autoComplete="current-password"
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && value) {
                      e.preventDefault()
                      ok()
                    }
                  }}
                />
              </label>
            )}
            <div className="confirm__actions">
              <button type="button" className="btn btn--ghost" onClick={cancel}>
                {req.cancelLabel ?? t.common.cancel}
              </button>
              <button
                type="button"
                className={'btn' + (req.tone === 'default' ? ' btn--primary' : ' btn--danger')}
                disabled={withInput && !value}
                onClick={ok}
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
