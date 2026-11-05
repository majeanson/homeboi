import { useEffect, useRef, type RefObject } from 'react'

// Shared behaviour every dialog/sheet should have, so the 11 overlays stop
// drifting apart: Escape-to-close, a background scroll lock, and a focus trap
// that hands focus back to the opener on close.
//
//   const ref = useRef<HTMLDivElement>(null)
//   useModal(ref, onClose)                 // conditionally-mounted modal
//   useModal(ref, onClose, { open })       // always-mounted sheet (no-op hidden)
//
// `open` defaults to true for modals that mount only while open; pass the real
// flag for sheets that stay in the DOM and toggle a `.show` class (AddSheet,
// ProfilePicker) so the hook does nothing while they're tucked away.

const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'

// A field that pops the on-screen keyboard when focused — every textarea, any
// contenteditable, and the text-flavoured <input> types (not checkbox/radio/
// button/date pickers). The focus trap skips these so opening a modal never
// summons the keyboard on its own.
const TEXT_INPUT = /^(|text|search|email|url|tel|password|number)$/i
function isTextEntry(n: HTMLElement): boolean {
  if (n.tagName === 'TEXTAREA' || n.isContentEditable) return true
  return n.tagName === 'INPUT' && TEXT_INPUT.test((n as HTMLInputElement).type)
}

// Ref-counted scroll lock so stacked overlays (a flyer over the cashier) don't
// unlock the page when only the top one closes.
//
// `body`/`html` are `overflow:hidden` in this app — they NEVER scroll. The real
// scrollers are `#root` (auth/setup/marketing pages) and `.hub__body` (the hub
// shell). So the classic `body{position:fixed}` trick is inert here and the page
// behind an open sheet kept scrolling. We freeze the actual scrollers instead by
// toggling `html.scroll-locked`, whose CSS (core.css) sets `overflow:hidden` on
// both. overflow:hidden holds scrollTop in place (no jump, no scroll-restore).
let lockCount = 0
function lockScroll(): void {
  if (lockCount++ > 0) return
  document.documentElement.classList.add('scroll-locked')
}
function unlockScroll(): void {
  if (lockCount === 0 || --lockCount > 0) return
  document.documentElement.classList.remove('scroll-locked')
}

// Only the top-most open modal reacts to Escape, so a flyer over the cashier
// closes the flyer alone — not both at once.
const escStack: Array<() => void> = []

// One token per open overlay, so a stack of them (a confirm raised over a sheet) can
// tell WHOSE history entry the back button just popped.
let overlaySeq = 0

// Pushes and pops happen in STRICT SEQUENCE. A pop is asynchronous (`history.back()`
// settles on the next popstate), and an overlay that opens in the same tick another
// closes — « Modifier » in a peek: the sheet goes, the dialog comes — would push its
// entry just in time for the pending pop to take it away; the dialog's own listener
// then read "my entry left the top" and closed it before anyone saw it (five e2e reds
// on the first run of back-closes-overlay.spec, 2026-11-05). So every push waits for
// the previous pop; the fallback timer only matters if a back never fires popstate,
// and it keeps one odd browser from wedging every later overlay.
let settled: Promise<void> = Promise.resolve()
function popSentinel(): void {
  settled = settled.then(
    () =>
      new Promise<void>((res) => {
        let done = false
        const finish = () => {
          if (done) return
          done = true
          window.removeEventListener('popstate', finish)
          res()
        }
        window.addEventListener('popstate', finish)
        window.history.back()
        setTimeout(finish, 500)
      }),
  )
}

export function useModal(
  ref: RefObject<HTMLElement | null>,
  onClose: () => void,
  {
    open = true,
    history: ownsBack = false,
  }: {
    open?: boolean
    /**
     * Hold ONE same-URL history entry while open, so the phone's back button (Android
     * hardware / gesture, the iOS edge swipe in a PWA) closes THIS overlay instead of
     * leaving the page underneath it — what every sheet, peek, ⋯ menu and dialog did
     * until 2026-11-05 (only DrawPad guarded, with a sentinel of its own that BLOCKS
     * back rather than closing; it keeps that).
     *
     * Opt-IN, not default, because ten of the fourteen callers are ROUTED scenes
     * (CookMode, CashierMode, NoteEditor, RecipeSheet…) where the router already owns
     * the entry — a second one there would make back land on the same scene twice.
     * The overlay shells pass it: Modal, Sheet, confirm, ActionMenu, ZoomableImg,
     * FlyerViewer, FlippPager.
     *
     * Stacking: each open overlay pushes its own token; on popstate only the overlay
     * whose token just LEFT the top closes (a confirm over a sheet: first back closes
     * the confirm, the sheet stays). Closing by ✕ / Esc / scrim pops the entry back
     * off if it is still on top; if the page navigated meanwhile (a sheet action that
     * opens a scene), the entry is left alone — popping it would undo that navigation.
     * React Router's own `{usr, key, idx}` state is spread into the entry so its
     * popstate bookkeeping (delta / blockers) keeps reading a sane index.
     */
    history?: boolean
  } = {},
): void {
  // The back-button sentinel. `onClose` rides in a ref so a new callback identity on a
  // re-render never pushes a second entry — the effect keys on `open` alone.
  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onCloseRef.current = onClose
  })
  useEffect(() => {
    if (!open || !ownsBack) return
    const token = ++overlaySeq
    let pushed = false
    let gone = false
    const onPop = () => {
      if (window.history.state?.__overlay !== token) onCloseRef.current()
    }
    void settled.then(() => {
      if (gone) return // closed again before the previous pop had settled — never pushed
      window.history.pushState({ ...(window.history.state ?? {}), __overlay: token }, '')
      pushed = true
      window.addEventListener('popstate', onPop)
    })
    return () => {
      gone = true
      if (!pushed) return
      window.removeEventListener('popstate', onPop)
      // Closed by the UI with our entry still on top → drop it, silently (listener off).
      // If the page navigated meanwhile the top is the router's entry: leave it be.
      if (window.history.state?.__overlay === token) popSentinel()
    }
  }, [open, ownsBack])

  // Escape — top of the stack wins.
  useEffect(() => {
    if (!open) return
    const close = () => onClose()
    escStack.push(close)
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && escStack[escStack.length - 1] === close) {
        e.preventDefault()
        onClose()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      const i = escStack.lastIndexOf(close)
      if (i >= 0) escStack.splice(i, 1)
    }
  }, [open, onClose])

  // Background scroll lock.
  useEffect(() => {
    if (!open) return
    lockScroll()
    return unlockScroll
  }, [open])

  // Focus trap + restore.
  useEffect(() => {
    if (!open) return
    const el = ref.current
    if (!el) return
    const opener = document.activeElement as HTMLElement | null
    const list = () =>
      Array.from(el.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (n) => n.offsetParent !== null || n === document.activeElement,
      )
    // Pull focus in for the trap — but NEVER onto a text field, which would
    // summon the on-screen keyboard the instant a dialog/sheet opens. House
    // rule: text entry is always an explicit tap, never automatic. So prefer the
    // first NON-text control (a ✕, a tab, a button); fall back to the container
    // itself. The keyboard only ever appears when the user taps a field.
    if (!el.contains(document.activeElement)) {
      const target = list().find((n) => !isTextEntry(n))
      if (target) target.focus()
      else {
        el.tabIndex = -1
        el.focus()
      }
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return
      const f = list()
      if (f.length === 0) {
        e.preventDefault()
        return
      }
      const first = f[0]
      const last = f[f.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
    el.addEventListener('keydown', onKey)
    return () => {
      el.removeEventListener('keydown', onKey)
      // Hand focus back to whatever opened the modal (FAB, row, button).
      opener?.focus?.()
    }
  }, [open, ref])
}
