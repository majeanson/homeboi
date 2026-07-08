import { useEffect, useRef, useState } from 'react'
import { useT } from '../i18n'
import { useAudience } from '../lib/audience'
import { Modal } from './Modal'
import { Icon } from './Icon'

// The adult escape hatch from a SIMPLIFIED lens (toddler or simple), so the
// one-way-door property holds while an adult can still leave (see audience.ts and
// the "kid view one-way door" project note). A locked kiosk relaunched with
// ?kid=1 / ?simple=1 has no address bar in an installed PWA, so there was no way
// out at all.
//
// It lives as a visible switch in the hub footer/nav (rendered by HubLayout
// inside .hubnav). The gate:
//   1. A SUSTAINED long-press (~3s) on the switch — for BOTH lenses. Toddlers tap
//      and drag; they rarely hold one spot that long. A fill bar gives feedback.
//   2. THEN, for the TODDLER lens only (`requireMath`), a simple arithmetic
//      challenge (a + b): a pre-reader can't solve it, an adult answers in a
//      second. The SIMPLE lens is a capable post-reader adult (bmad/08 A-1), so
//      the hold alone lets her out — no condescending math. Nothing stored, no
//      secret — calm by design.
// Clearing the gate calls unlock(), which drops the lock and the parent lens back.
//
// Touch note: on a real tablet a 3s press would otherwise trigger the OS
// long-press callout / text selection (→ pointercancel) or be cancelled by tiny
// finger jitter (→ pointerleave), so the hold never completed. We suppress the
// callout/selection in CSS, preventDefault the context menu, and capture the
// pointer so jitter inside the hold doesn't abort it.
const HOLD_MS = 3000

function newSum() {
  // Small single-digit addends (2–9), so the sum stays a quick mental add for an
  // adult but is unreadable/unsolvable for a toddler.
  return { a: 2 + Math.floor(Math.random() * 7), b: 2 + Math.floor(Math.random() * 7) }
}

export function KidExitGate({ requireMath = true }: { requireMath?: boolean }) {
  const t = useT()
  const { unlock } = useAudience()
  // requireMath=false is the simple/grandma lens; label it as such.
  const exitTitle = requireMath ? t.audience.exitTitle : t.audience.exitTitleSimple
  const [holding, setHolding] = useState(false)
  const [gateOpen, setGateOpen] = useState(false)
  const [sum, setSum] = useState(newSum)
  const [answer, setAnswer] = useState('')
  const [wrong, setWrong] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Clear a pending hold timer if we unmount mid-press, so it can't fire
  // setGateOpen on a gone component.
  useEffect(() => () => clearTimeout(timer.current ?? undefined), [])

  function startHold(e: React.PointerEvent<HTMLButtonElement>) {
    // Capture the pointer so small finger movement during the 3s hold doesn't
    // fire pointerleave (which would cancel it). pointerup still lands here.
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {
      // setPointerCapture can throw if the pointer is already gone — ignore.
    }
    setHolding(true)
    timer.current = setTimeout(() => {
      setHolding(false)
      // Toddler: the hold only ARMS the math gate (a pre-reader can't clear it).
      // Simple/grandma (requireMath=false): the hold IS the confirmation — a
      // capable adult held 3s deliberately, so drop straight back to parent.
      if (!requireMath) {
        unlock()
        return
      }
      setSum(newSum())
      setAnswer('')
      setWrong(false)
      setGateOpen(true)
    }, HOLD_MS)
  }
  function cancelHold() {
    setHolding(false)
    if (timer.current) {
      clearTimeout(timer.current)
      timer.current = null
    }
  }

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (Number.parseInt(answer, 10) === sum.a + sum.b) {
      setGateOpen(false)
      unlock()
    } else {
      // Wrong → new sum, so a toddler mashing numbers can't brute one fixed answer.
      setWrong(true)
      setSum(newSum())
      setAnswer('')
    }
  }

  return (
    <>
      {/* The visible exit switch, sitting in the hub footer/nav. It reads as an
          ordinary nav button; a 3s hold arms the fill bar, then the math gate
          opens. onContextMenu is prevented so a long-press doesn't pop the OS
          callout (which would cancel the hold) — see the touch note above. */}
      <button
        type="button"
        className={`hubnav__btn kid-exit-switch${holding ? ' is-holding' : ''}`}
        aria-label={exitTitle}
        title={t.audience.exitHold}
        onPointerDown={startHold}
        onPointerUp={cancelHold}
        onPointerCancel={cancelHold}
        onContextMenu={(e) => e.preventDefault()}
      >
        {/* A Phosphor door glyph, not a 🚪 emoji — control affordances use the shared
            Icon set (the emoji rendered as a dark full-colour box that read as a
            broken tab in the mobile bottom nav). Sized to match the section tabs. */}
        <Icon name="door-bold" size={22} color="var(--ink-faint)" />
        <span className="kid-exit-switch__label">{exitTitle}</span>
        <span className="kid-exit-switch__fill" aria-hidden="true" />
      </button>

      {/* The math gate rides the shared <Modal> chrome (backdrop, ✕ close, focus-trap,
          Esc). Security is unchanged — it lives in the 3s hold + the arithmetic answer
          below, not the presentation. `className="kid-exit-modal"` keeps the card's
          class so the inner __q/__input/__actions styling (+ the e2e gate test) hold. */}
      <Modal open={gateOpen} onClose={() => setGateOpen(false)} className="kid-exit-modal" title={t.audience.exitTitle}>
        <form onSubmit={submit}>
          <label className="kid-exit-modal__q">
            <span>
              {t.audience.exitPrompt} {sum.a} + {sum.b}&nbsp;?
            </span>
            {/* No autoFocus — house rule: the keyboard only ever opens on an
                explicit tap, never when a dialog mounts. */}
            <input
              type="number"
              inputMode="numeric"
              className="kid-exit-modal__input"
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              aria-label={t.audience.exitAnswer}
            />
          </label>
          {wrong && (
            <p className="kid-exit-modal__wrong" role="alert">
              {t.audience.exitWrong}
            </p>
          )}
          <div className="kid-exit-modal__actions">
            <button type="button" className="btn btn--ghost" onClick={() => setGateOpen(false)}>
              {t.audience.exitCancel}
            </button>
            <button type="submit" className="btn btn--primary">
              {t.audience.exitConfirm}
            </button>
          </div>
        </form>
      </Modal>
    </>
  )
}
