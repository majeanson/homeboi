// Track the visual viewport into CSS custom properties, so fixed overlays
// (centered modals, bottom sheets) can stay inside the VISIBLE area when the
// on-screen keyboard is up. iOS Safari overlays the keyboard without resizing
// the layout viewport — without this, a modal's footer (Save / Cancel) ends up
// hidden behind the keyboard or the browser chrome.
//
//   --vvh  visible height (px)        → overlay height / max-height
//   --vvt  visible top offset (px)    → pin an overlay to the visible top
//   --kb   keyboard/obscured bottom   → lift a bottom sheet above the keyboard
//
// One module-level side effect (same shape as registerSw): call once at boot.
// No-op where visualViewport is missing — the CSS fallbacks (dvh) take over.
export function trackVisualViewport(): void {
  const vv = window.visualViewport
  if (!vv) return
  const root = document.documentElement.style

  // Browser zoom is locked (viewport user-scalable=no + touch-action in
  // core.css), but iOS Safari ignores user-scalable=no in a plain browser tab,
  // so a pinch can still slip through there. Two guards:
  //   1. Skip writes while vv.scale > 1 — a pinch fires resize+scroll every
  //      frame, and writing the shrunken vv.height would squash overlays sized
  //      with --vvh and make them shimmer through the gesture.
  //   2. rAF-coalesce bursts so we set the vars at most once per frame.
  // Tracks the current keyboard inset so the focus-scroll below only nudges on a
  // device whose keyboard is actually up (0 on desktop → no jump on click).
  let kbInset = 0
  let queued = false
  const apply = () => {
    queued = false
    if (vv.scale > 1) return
    kbInset = Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop))
    root.setProperty('--vvh', `${Math.round(vv.height)}px`)
    root.setProperty('--vvt', `${Math.round(vv.offsetTop)}px`)
    root.setProperty('--kb', `${kbInset}px`)
    // While the keyboard is up, hide the bottom chrome (the mobile tab bar + the
    // ＋ FAB) — it otherwise floats in the gap above the keyboard, fighting the
    // field being edited for attention. `.kb-open` keys the CSS in hub.css.
    document.documentElement.classList.toggle('kb-open', kbInset > 120)
  }
  const schedule = () => {
    if (queued) return
    queued = true
    requestAnimationFrame(apply)
  }
  apply()
  vv.addEventListener('resize', schedule)
  vv.addEventListener('scroll', schedule)

  // When a text field is tapped, ease THAT field into the middle of the visible
  // band ("zoom on the part being edited") once the keyboard has slid in. Gated
  // on a real keyboard inset, so a plain desktop click never yanks the page.
  // iOS' own scroll-into-view is unreliable inside our fixed sheets/overlays.
  const TEXT = /^(|text|search|email|url|tel|password|number)$/i
  // A submit/action button sitting just below the focused field in the same
  // compact group (e.g. the recipe import panel's "Importer", which follows the
  // URL input + paste box) — reveal IT, not just the field, so the control the
  // user is typing toward never strands under the keyboard. Disabled buttons
  // count: import enables only once a URL is typed, but it's where the field
  // leads, so keep it in view. Returns null for a lone field → centre the field.
  const actionBelow = (el: HTMLElement): HTMLElement | null => {
    const bottom = el.getBoundingClientRect().bottom
    let scope = el.parentElement
    for (let up = 0; up < 3 && scope; up++, scope = scope.parentElement) {
      for (const b of scope.querySelectorAll<HTMLElement>('button')) {
        const dy = b.getBoundingClientRect().top - bottom
        if (dy >= 0 && dy < 260) return b
      }
    }
    return null
  }
  let scrollTimer: ReturnType<typeof setTimeout>
  document.addEventListener('focusin', (e) => {
    const el = e.target
    if (!(el instanceof HTMLElement)) return
    const editable =
      el.tagName === 'TEXTAREA' || el.isContentEditable || (el.tagName === 'INPUT' && TEXT.test((el as HTMLInputElement).type))
    if (!editable) return
    clearTimeout(scrollTimer)
    scrollTimer = setTimeout(() => {
      if (kbInset <= 120 || !el.isConnected) return
      const action = actionBelow(el)
      // Pin the focused field near the TOP of the visible band so the content
      // below it (between field and keyboard) stays readable — iOS doesn't
      // shrink the layout viewport, so 'center' would land mid-screen / behind
      // the keyboard. scroll-margin-top (core.css) leaves a little breathing gap.
      if (action) action.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
      else el.scrollIntoView({ block: 'start', behavior: 'smooth' })
    }, 300)
  })

  // Final backstop for iOS Safari browser tabs: block the pinch-zoom gesture
  // outright (it honours user-scalable=no only once installed standalone). These
  // gesture* events are iOS-only.
  for (const ev of ['gesturestart', 'gesturechange', 'gestureend']) {
    document.addEventListener(ev, (e) => e.preventDefault(), { passive: false })
  }

  // Trackpad pinch + Ctrl/⌘-scroll zoom (laptops & desktops): the browser fires
  // a wheel event with ctrlKey set and zooms the whole page. touch-action and
  // user-scalable=no don't cover the wheel, so this is the only guard that stops
  // it — the most common "I can still zoom weirdly" path on a laptop.
  window.addEventListener(
    'wheel',
    (e) => {
      if (e.ctrlKey) e.preventDefault()
    },
    { passive: false },
  )

  // Multi-touch backstop for non-iOS tablets (Android / Chrome OS), where the
  // iOS gesture* events never fire: a second finger landing to pinch is
  // cancelled. Single-finger scrolling (touches.length === 1) is untouched.
  document.addEventListener(
    'touchmove',
    (e) => {
      if (e.touches.length > 1) e.preventDefault()
    },
    { passive: false },
  )
}
