import { useEffect } from 'react'
import { createDeviceStore } from './createDeviceStore'
import { useSpeak } from './speak'
import { useAudience } from './audience'

// Tap-to-hear everywhere (bmad/08 A-2): in a SIMPLIFIED lens (toddler or
// simple/grandma), a sustained ~500 ms press on any content row reads it aloud
// — one gesture, every surface, without wiring each row. A shell-level
// listener (mounted once by HubLayout) finds the nearest speakable ancestor of
// the press and hands its `data-speak` (or its stripped text) to the same
// on-device useSpeak() every narration uses. The hold is deliberately shorter
// than the exit gate's 3 s and aborts the moment the finger travels (a scroll
// is never a request to hear).
//
// Defensive scoping — the listener must NEVER fight an interaction that owns
// the pointer or the gesture:
//   • drag zones (usePointerDnd sets window pointer capture)   → excluded
//   • the exit gate (its own long-press)                        → excluded
//   • form fields (long-press = text selection / cursor)        → excluded
//   • open modal / tour spotlight (the press belongs to it)     → bail out
//   • scrolling (.hub__body)  → passive listeners, no preventDefault on move;
//     >8 px of travel or a pointercancel aborts the hold
// After a hold fires, the ONE click the lifting finger still produces is
// swallowed (capture-phase, one-shot) so hearing never also acts — a long-press
// on a door tile speaks it without opening it.

// Per-device pref (default ON), toggled in Réglages ▸ Système ▸ Affichage ▸ Voix.
const store = createDeviceStore<boolean>('babillard-tap-to-hear', true, {
  read: (raw) => raw !== '0',
  write: (v) => (v ? '1' : '0'),
})
export const useTapToHear = store.use
export const setTapToHear = store.set

const HOLD_MS = 500
const MOVE_PX = 8
// What a long-press can read: an explicit [data-speak] wins; else these content
// rows speak their own text. Controls (buttons, chips, nav) stay silent — this
// hears CONTENT, it doesn't re-explain chrome (help mode does that).
const TARGETS = '[data-speak], .act, .listrow, .note-card, .bigtile, .today-hero, .sayable'
const EXCLUDE = '[data-dnd-zone], .kid-exit-switch, input, textarea, select, [contenteditable="true"]'

export function useTapToHearListener(): void {
  const { audience } = useAudience()
  const enabled = useTapToHear()
  const speak = useSpeak()
  const active = enabled && (audience === 'toddler' || audience === 'simple')

  useEffect(() => {
    if (!active) return
    let timer: number | null = null
    let x0 = 0
    let y0 = 0
    const clear = () => {
      if (timer != null) {
        clearTimeout(timer)
        timer = null
      }
    }
    // One-shot, capture-phase: swallow the single click the lifting finger
    // fires after a hold has already spoken, so the row never ALSO activates.
    const suppressClick = (ev: MouseEvent) => {
      ev.preventDefault()
      ev.stopPropagation()
      window.removeEventListener('click', suppressClick, true)
    }
    const down = (e: PointerEvent) => {
      clear()
      if (e.button !== 0) return // primary presses only (touch/pen report 0)
      const el = e.target instanceof Element ? e.target.closest(TARGETS) : null
      if (!el || el.closest(EXCLUDE)) return
      // A dialog or the tour spotlight is up — the press belongs to it.
      if (document.querySelector('.kit-modal__backdrop, .tour')) return
      x0 = e.clientX
      y0 = e.clientY
      timer = window.setTimeout(() => {
        timer = null
        const explicit = el instanceof HTMLElement ? el.dataset.speak : undefined
        // Cap the fallback text so a long-press on a dense row stays a glance,
        // not a lecture (speak() already strips emoji itself).
        const text = explicit || (el.textContent ?? '').trim().slice(0, 240)
        speak(text)
        window.addEventListener('click', suppressClick, true)
        window.setTimeout(() => window.removeEventListener('click', suppressClick, true), 900)
      }, HOLD_MS)
    }
    const move = (e: PointerEvent) => {
      // Finger travel = a scroll/drag, never a request to hear. NEVER
      // preventDefault here — .hub__body's scroll must stay native.
      if (timer != null && Math.hypot(e.clientX - x0, e.clientY - y0) > MOVE_PX) clear()
    }
    // A long-press on a link/image also arms the OS context menu (Android) —
    // suppress it only on our speakable targets, same trick as the exit switch.
    const context = (e: Event) => {
      const el = e.target instanceof Element ? e.target.closest(TARGETS) : null
      if (el && !el.closest(EXCLUDE)) e.preventDefault()
    }
    window.addEventListener('pointerdown', down, { passive: true })
    window.addEventListener('pointermove', move, { passive: true })
    window.addEventListener('pointerup', clear, { passive: true })
    window.addEventListener('pointercancel', clear, { passive: true })
    window.addEventListener('contextmenu', context)
    return () => {
      clear()
      window.removeEventListener('pointerdown', down)
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', clear)
      window.removeEventListener('pointercancel', clear)
      window.removeEventListener('contextmenu', context)
      window.removeEventListener('click', suppressClick, true)
    }
  }, [active, speak])
}
