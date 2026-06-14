import { useEffect, useRef, useState } from 'react'
import { useT } from '../i18n'
import { useAudience } from '../lib/audience'
import { useModal } from '../lib/useModal'

// The adult escape hatch from the toddler lens, built as a PARENTAL GATE so the
// one-way-door property still holds for the child (see audience.ts, and the
// "kid view one-way door" project note). A toddler-locked kiosk relaunched with
// ?kid=1 has no address bar in an installed PWA, so there was no way out at all.
//
// It lives as a visible switch in the hub footer/nav (rendered by HubLayout
// inside .hubnav), but is gated by two challenges neither of which a pre-reader
// clears:
//   1. A SUSTAINED long-press (~3s) on the switch. Toddlers tap and drag; they
//      rarely hold one spot that long. A fill bar gives the adult feedback.
//   2. A simple arithmetic challenge (a + b). A pre-reader can't solve it; an
//      adult answers in a second. Nothing to set up, nothing to remember, no
//      stored secret — calm by design.
// Clearing both calls unlock(), which drops the lock and the parent lens back.
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

export function KidExitGate() {
  const t = useT()
  const { unlock } = useAudience()
  const [holding, setHolding] = useState(false)
  const [gateOpen, setGateOpen] = useState(false)
  const [sum, setSum] = useState(newSum)
  const [answer, setAnswer] = useState('')
  const [wrong, setWrong] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const modalRef = useRef<HTMLDivElement>(null)
  useModal(modalRef, () => setGateOpen(false), { open: gateOpen })

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
        aria-label={t.audience.exitTitle}
        title={t.audience.exitHold}
        onPointerDown={startHold}
        onPointerUp={cancelHold}
        onPointerCancel={cancelHold}
        onContextMenu={(e) => e.preventDefault()}
      >
        <span className="hubnav__peek-pic" aria-hidden="true">
          🚪
        </span>
        <span>{t.audience.exitTitle}</span>
        <span className="kid-exit-switch__fill" aria-hidden="true" />
      </button>

      {gateOpen && (
        <div
          className="kid-exit-overlay"
          onClick={(e) => {
            if (e.target === e.currentTarget) setGateOpen(false)
          }}
        >
          <div
            ref={modalRef}
            className="kid-exit-modal"
            role="dialog"
            aria-modal="true"
            aria-label={t.audience.exitTitle}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="kid-exit-modal__title">{t.audience.exitTitle}</h2>
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
          </div>
        </div>
      )}
    </>
  )
}
