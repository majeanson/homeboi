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
  const apply = () => {
    root.setProperty('--vvh', `${Math.round(vv.height)}px`)
    root.setProperty('--vvt', `${Math.round(vv.offsetTop)}px`)
    root.setProperty('--kb', `${Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop))}px`)
  }
  apply()
  vv.addEventListener('resize', apply)
  vv.addEventListener('scroll', apply)
}
