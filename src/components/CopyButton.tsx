import { useEffect, useRef, useState } from 'react'
import { Icon, type IconName } from './Icon'

// THE copy-to-clipboard affordance. Nine call sites had hand-rolled the same eight
// lines (ShareModal, FamilyShareModal, guest ×2, micTest, shopping, CashierMode,
// HandoffPage) before this existed — PARITY's extraction rule fires at three.
//
// Three things every one of those sites learned the hard way, kept here so the next
// one inherits them instead of rediscovering them:
//
//  1. THE CONFIRMATION MUST STAY. The reason you copy is to paste somewhere else —
//     a bank app, flipp.com, a text message — and that app COVERS this page. A
//     toast fires into a hidden tab and is gone by the time you look back (Marc,
//     iPhone, 2026-09-10: « i dont see the notice », and the paste had worked). So
//     the word lives on the button and stays there. It resets when `text` changes,
//     which is the only honest trigger: what is on the clipboard is no longer what
//     the button would copy now.
//  2. `navigator.clipboard` CAN BE ABSENT OR REFUSE. iOS withholds it outside a
//     user gesture, and an insecure origin has none at all. On refusal the text is
//     rendered in a selectable read-only field so the copy is still possible by
//     hand — never a dead button and never a silent failure.
//  3. THE CLIPBOARD WRITE RIDES THE TAP. Awaiting anything before it (a fetch, a
//     save) loses the user-gesture window on Safari and the write is refused.
//     Callers that must save first should save AFTER, or pass the text they already
//     have — which is why `text` is a value or a sync getter, never a promise.
export function CopyButton({
  text,
  label,
  copiedLabel,
  refusedLabel,
  icon,
  variant = 'primary',
  size = 'sm',
  className,
  onCopied,
}: {
  /** What lands on the clipboard. A getter is read at tap time (still synchronous,
   *  so the user-gesture window survives) for text derived from live form state. */
  text: string | (() => string)
  label: string
  /** Shown after a successful copy and left there. Defaults to `label`. */
  copiedLabel?: string
  /** Shown when the clipboard is unavailable, above the manual-copy field. */
  refusedLabel?: string
  /** Optional idle glyph; the copied state always shows a check. */
  icon?: IconName
  variant?: 'primary' | 'ghost'
  size?: 'sm' | 'md'
  className?: string
  onCopied?: () => void
}) {
  const [state, setState] = useState<'idle' | 'copied' | 'refused'>('idle')
  const resolved = typeof text === 'function' ? text() : text
  // Reset when what we would copy changes — the standing « Copié ! » would
  // otherwise claim the clipboard holds an edit it never saw.
  const lastRef = useRef(resolved)
  useEffect(() => {
    if (lastRef.current !== resolved) {
      lastRef.current = resolved
      setState('idle')
    }
  }, [resolved])

  const copy = () => {
    const value = typeof text === 'function' ? text() : text
    if (!value) return
    // Optional-chained: `navigator.clipboard` is undefined on an insecure origin,
    // and reading `.writeText` off it would throw before any promise exists.
    const p = navigator.clipboard?.writeText(value)
    if (!p) {
      setState('refused')
      return
    }
    p.then(() => {
      setState('copied')
      onCopied?.()
    }).catch(() => setState('refused'))
  }

  // NOTHING TO COPY = an inert button, not a live one that silently does nothing.
  // `copy()` already returned early on an empty string, so the tap looked accepted and
  // changed nothing — the same class of lie as a disabled-looking control that works.
  const empty = !resolved.trim()
  const classes = ['btn', size === 'sm' ? 'btn--sm' : '', variant === 'ghost' ? 'btn--ghost' : 'btn--primary']
    .filter(Boolean)
    .join(' ')

  return (
    <div className={'copybtn' + (className ? ` ${className}` : '')}>
      <button type="button" className={classes} onClick={copy} disabled={empty}>
        {state === 'copied' ? <Icon name="check-bold" size={16} /> : icon ? <Icon name={icon} size={16} /> : null}
        {state === 'copied' ? (copiedLabel ?? label) : label}
      </button>
      {state === 'refused' && (
        <div className="copybtn__manual">
          {refusedLabel && <p className="copybtn__hint">{refusedLabel}</p>}
          {/* Read-only + select-on-focus: the copy still happens, by hand. */}
          <input
            className="input"
            readOnly
            value={resolved}
            aria-label={label}
            onFocus={(e) => e.currentTarget.select()}
          />
        </div>
      )}
    </div>
  )
}
