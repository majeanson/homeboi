import { useEffect, type RefObject } from 'react'

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
// unlock the page when only the top one closes. position:fixed + scroll restore
// is the one technique that actually stops iOS Safari scrolling the background.
let lockCount = 0
let savedScrollY = 0
function lockScroll(): void {
  if (lockCount++ > 0) return
  savedScrollY = window.scrollY
  const b = document.body
  b.style.position = 'fixed'
  b.style.top = `-${savedScrollY}px`
  b.style.left = '0'
  b.style.right = '0'
  b.style.width = '100%'
}
function unlockScroll(): void {
  if (lockCount === 0 || --lockCount > 0) return
  const b = document.body
  b.style.position = ''
  b.style.top = ''
  b.style.left = ''
  b.style.right = ''
  b.style.width = ''
  window.scrollTo(0, savedScrollY)
}

// Only the top-most open modal reacts to Escape, so a flyer over the cashier
// closes the flyer alone — not both at once.
const escStack: Array<() => void> = []

export function useModal(
  ref: RefObject<HTMLElement | null>,
  onClose: () => void,
  { open = true }: { open?: boolean } = {},
): void {
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
