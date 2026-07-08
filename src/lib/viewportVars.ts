import { scrollBehavior } from './motion'
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
  // KB_THRESHOLD: ignore tiny insets (browser chrome, accessory bar) — only a
  // real on-screen keyboard clears this.
  const KB_THRESHOLD = 120
  let kbInset = 0
  let kbOpen = false
  let queued = false

  // An editable target whose focus should be kept above the keyboard. We pin
  // text-ish <input>s, every <textarea>, and any contentEditable host. Buttons,
  // checkboxes, date/colour pickers, etc. are deliberately excluded.
  const TEXT = /^(|text|search|email|url|tel|password|number)$/i
  const isEditable = (el: EventTarget | null): el is HTMLElement =>
    el instanceof HTMLElement &&
    (el.tagName === 'TEXTAREA' || el.isContentEditable || (el.tagName === 'INPUT' && TEXT.test((el as HTMLInputElement).type)))

  // OPT-IN exception: a few compact panels (e.g. the recipe import panel's
  // "Importer", which follows the URL input + paste box) want the action button
  // BELOW the field revealed too, not just the field — so the control the user is
  // typing toward never strands under the keyboard. Mark such a panel with
  // `data-kb-reveal` and the field-to-button reveal kicks in there only. Disabled
  // buttons count (import enables only once a URL is typed, but it's where the
  // field leads). Returns null when there's no eligible button → pin the field.
  const actionBelow = (el: HTMLElement): HTMLElement | null => {
    if (!el.closest('[data-kb-reveal]')) return null
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

  // Ease the CURRENTLY-focused text field to the top of the visible band so the
  // keyboard (which slides up from the bottom) can never cover what you're typing.
  // This is the behaviour every text edit in the app gets for free.
  //
  // We pin near the TOP (not centre): iOS doesn't shrink the layout viewport, so
  // 'center' would land mid-screen / behind the keyboard. scroll-margin-top
  // (core.css) leaves a little breathing gap above it. iOS' own scroll-into-view
  // is unreliable inside our fixed sheets/overlays, so we drive it ourselves.
  const pinOnce = (behavior: ScrollBehavior) => {
    if (kbInset <= KB_THRESHOLD) return
    const el = document.activeElement
    if (!isEditable(el) || !el.isConnected) return
    const action = actionBelow(el)
    if (action) action.scrollIntoView({ block: 'nearest', behavior })
    else el.scrollIntoView({ block: 'start', behavior })
  }

  // Pin NOW, then RE-pin a few times as the keyboard slide-in, a combobox dropdown
  // opening on focus, and the `.kb-open` trailing padding all settle over ~½s.
  // Any one of them can move the field AFTER a single scroll — which is exactly
  // why it "sometimes worked": a lone shot raced the layout, and the combobox's
  // blur/refocus churn kept resetting the one debounced attempt. The retries are
  // idempotent (a no-op once the field already sits above the keyboard) and never
  // blur, so there's no keyboard flicker; bounded to the settle window so a user's
  // later manual scroll while typing isn't fought.
  let pinTimers: ReturnType<typeof setTimeout>[] = []
  const pinFocused = () => {
    pinTimers.forEach(clearTimeout)
    pinTimers = []
    pinOnce(scrollBehavior())
    for (const ms of [120, 280, 480]) pinTimers.push(setTimeout(() => pinOnce('auto'), ms))
  }

  const apply = () => {
    queued = false
    if (vv.scale > 1) return
    kbInset = Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop))
    root.setProperty('--vvh', `${Math.round(vv.height)}px`)
    root.setProperty('--vvt', `${Math.round(vv.offsetTop)}px`)
    root.setProperty('--kb', `${kbInset}px`)
    const open = kbInset > KB_THRESHOLD
    // While the keyboard is up, hide the bottom chrome (the mobile tab bar + the
    // ＋ FAB) — it otherwise floats in the gap above the keyboard, fighting the
    // field being edited for attention. `.kb-open` keys the CSS in hub.css.
    document.documentElement.classList.toggle('kb-open', open)
    // The keyboard slide-in is what was racing the old fixed 300ms timer: on a
    // slow device the inset is still ~0 at 300ms, so the one-shot scroll was
    // skipped and never retried. Re-pin on the RISING edge (keyboard just
    // arrived) so the focused field lands above it no matter how late it slides
    // in. We fire only on the transition, not every scroll frame, so a user's
    // manual scroll while typing isn't fought.
    if (open && !kbOpen) pinFocused()
    // NOTE — we deliberately NEVER programmatically blur the focused field here.
    // An earlier version blurred it on the "falling edge" (keyboard gone, field
    // still focused) to unwind the stranded scroll the iPad "Hide Keyboard" key
    // leaves behind. But the computed keyboard inset is noisy on real devices and
    // dips below the threshold for a frame or two whenever a combobox dropdown or a
    // modal grows the layout on focus — so that blur could fire WHILE the user was
    // typing. Dismissing the field, paired with a modal focus-trap or any re-focus,
    // produced a rapid keyboard open/close loop that made inputs (login, the cercle
    // "Relier" pickers) impossible to use. The vars above (--vvh/--kb/.kb-open)
    // already reset on a genuine close — which is what full-screen scenes bind to —
    // so the only thing lost is the rare cosmetic stranded-scroll, a far smaller
    // cost than a flickering keyboard. The app now never dismisses a live keyboard.
    kbOpen = open
  }
  const schedule = () => {
    if (queued) return
    queued = true
    requestAnimationFrame(apply)
  }
  apply()
  vv.addEventListener('resize', schedule)
  vv.addEventListener('scroll', schedule)

  // Tapping a field re-pins it — whether the keyboard is still arriving (the
  // rising edge above also fires) or ALREADY up (moving between fields, which gets
  // no viewport resize, so the rising edge won't fire). pinFocused self-schedules
  // its own settle retries, so focus churn (e.g. the combobox's blur/refocus
  // dance) just resets a cheap idempotent schedule instead of cancelling the one
  // chance to scroll.
  document.addEventListener('focusin', (e) => {
    if (!isEditable(e.target)) return
    pinFocused()
  })

  // A field blurring usually means the keyboard is closing. Some browsers don't
  // fire a visualViewport 'resize' on dismiss, which would leave --vvh/--kb (and
  // the .kb-open class) stuck at their keyboard-open values — shrinking full-screen
  // scenes that bind to --vvh with the keyboard already gone. Recompute once it has
  // settled; if focus merely moved to another field, apply() reads the still-small
  // viewport and correctly keeps things as-is.
  document.addEventListener('focusout', () => {
    setTimeout(schedule, 300)
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
