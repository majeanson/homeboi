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
  let queued = false
  const apply = () => {
    queued = false
    if (vv.scale > 1) return
    root.setProperty('--vvh', `${Math.round(vv.height)}px`)
    root.setProperty('--vvt', `${Math.round(vv.offsetTop)}px`)
    root.setProperty('--kb', `${Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop))}px`)
  }
  const schedule = () => {
    if (queued) return
    queued = true
    requestAnimationFrame(apply)
  }
  apply()
  vv.addEventListener('resize', schedule)
  vv.addEventListener('scroll', schedule)

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
