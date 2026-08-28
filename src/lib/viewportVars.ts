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

// ── Keyboard state, shared module-wide ──────────────────────────────────────
// KB_THRESHOLD: ignore tiny insets (browser chrome, accessory bar) — only a
// real on-screen keyboard clears this. kbInset is the total viewport SHRINK
// (innerHeight - vv.height) — the pan-independent "a keyboard exists" signal,
// NOT the bottom occlusion (that's --kb; see apply()). Written by apply() below
// and read by the caret-follow helpers, so a caller outside
// trackVisualViewport's closure (caretIntoView) sees the same truth.
const KB_THRESHOLD = 120
let kbInset = 0

// An editable target whose caret/focus should be kept above the keyboard. We
// track text-ish <input>s, every <textarea>, and any contentEditable host.
// Buttons, checkboxes, date/colour pickers, etc. are deliberately excluded.
const TEXT = /^(|text|search|email|url|tel|password|number)$/i
function isEditable(el: EventTarget | null): el is HTMLElement {
  return (
    el instanceof HTMLElement &&
    (el.tagName === 'TEXTAREA' || el.isContentEditable || (el.tagName === 'INPUT' && TEXT.test((el as HTMLInputElement).type)))
  )
}

// Controls whose FOCUS can make the platform put something over the bottom of the
// screen: a keyboard, or one of iOS's picker wheels (date/time/select). Wider than
// `isEditable` on purpose — a `<input type="date">` has no caret to follow, but its
// wheel occludes exactly like a keyboard and the fit padding must still apply.
//
// The types EXCLUDED are the ones whose focus summons nothing: a checkbox, a button,
// a file/colour/range picker. Focus on a `<div>`, a link or `<body>` is likewise no.
const NO_SUMMON = /^(checkbox|radio|button|submit|reset|file|color|range|image|hidden)$/i
function canSummonKeyboard(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false
  if (el.isContentEditable || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT') return true
  return el.tagName === 'INPUT' && !NO_SUMMON.test((el as HTMLInputElement).type)
}

// In an iOS HOME-SCREEN app, the keyboard carries no attached accessory bar —
// instead a floating ▲▼✓ pill hovers INSIDE the visual viewport, ~10px above the
// keyboard top. visualViewport knows nothing about it, so "just above the
// keyboard" is exactly where that pill covers the caret. Reserve its band on
// that platform only (Safari-tab iOS and Android put the bar inside the
// keyboard, below vv's bottom edge). Lazy + memoized so importing this module
// in a test runner without a DOM stays safe.
let accessoryPx: number | null = null
function accessoryPad(): number {
  if (accessoryPx !== null) return accessoryPx
  if (typeof navigator === 'undefined') return (accessoryPx = 0)
  const nav = navigator as Navigator & { standalone?: boolean }
  const ios = /iP(hone|ad|od)/.test(nav.userAgent) || (nav.platform === 'MacIntel' && nav.maxTouchPoints > 1)
  const standalone = nav.standalone === true || (typeof matchMedia === 'function' && matchMedia('(display-mode: standalone)').matches)
  accessoryPx = ios && standalone ? 64 : 0
  return accessoryPx
}

// ── On-device keyboard diagnostics (?kbdebug=1) ─────────────────────────────
// The keyboard machinery is exercised by e2e against a stubbed visualViewport,
// but the failures Marc reports are iOS-only (viewport push, momentum reveal,
// spurious selectionchange) and can't be reproduced in Chromium. This overlay
// paints the live numbers on the device itself — visual viewport, gates,
// scroller geometry, and the last few pin/follow decisions — so a screenshot
// replaces a guess. Enable by adding ?kbdebug=1 to any URL (sticks for the
// session); zero cost when off.
let kbDebugEl: HTMLElement | null = null
const kbDebugLog: string[] = []
function kbDebug(line: string): void {
  if (!kbDebugEl) return
  // Timestamp every decision — the overlay renders the LAST 5, and without a clock
  // a stale entry (from an earlier keystroke) reads as the current truth.
  kbDebugLog.push(`${(performance.now() / 1000).toFixed(1)} ${line}`)
  if (kbDebugLog.length > 5) kbDebugLog.shift()
}
// Painted-space RULERS. The overlay's numbers are DOM truth (getBoundingClientRect,
// scrollTop) — but Marc's second capture showed the PAINTED rows sitting ~100px below
// where those rects claim, i.e. the compositor and the DOM disagree (iOS keyboard-pan
// territory). Rects can never reveal that from inside JS: every API answers from the
// same DOM-side geometry. So we draw fixed markers AT the reported coordinates — if
// paint agrees with DOM, the red box hugs the caret's line on screen; any visible gap
// between a marker and the row it names IS the divergence, measured by the screenshot.
const kbMarks: Record<string, HTMLElement> = {}
function kbMark(name: string, colour: string, top: number, height = 0): void {
  let m = kbMarks[name]
  if (!m) {
    m = document.createElement('div')
    m.style.cssText =
      'position:fixed;left:0;right:0;z-index:99998;pointer-events:none;' +
      'border-top:2px solid;font:10px/1 ui-monospace,monospace;text-align:right;padding-right:2px;'
    kbMarks[name] = m
    document.body.appendChild(m)
  }
  m.style.top = `${top}px`
  m.style.height = `${Math.max(height, 10)}px`
  m.style.borderColor = colour
  m.style.color = colour
  m.style.borderBottom = height > 0 ? `2px solid ${colour}` : 'none'
  m.textContent = name
}

function renderKbDebug(): void {
  if (!kbDebugEl) return
  const vv = window.visualViewport
  const cs = getComputedStyle(document.documentElement)
  const ae = document.activeElement as HTMLElement | null
  // Markers are plain fixed elements (layout-anchored: painted = CSS top − vvT),
  // while glued-shell content paints at its client coords — so a marker naming a
  // shell-space coordinate y must be drawn at CSS top y − shift to land on the
  // PAINTED spot. If the red box hugs the painted caret line, the model holds.
  const mShift = ae ? fixedShellShift(ae) : 0
  const sel = document.getSelection()
  let caret = 'none'
  if (sel && sel.rangeCount) {
    // Mirror caretIntoView's ACTUAL measurement (clientRects[0] → bounding rect →
    // line-element fallback), and name the container@offset — a bare 0..0 told us
    // the range had no rect but not what the follow logic did about it.
    const range = sel.getRangeAt(0)
    const r = range.getClientRects()[0] ?? range.getBoundingClientRect()
    const c = range.startContainer
    const host = c.nodeType === Node.ELEMENT_NODE ? (c as HTMLElement) : c.parentElement
    caret = `${Math.round(r.top)}..${Math.round(r.bottom)} in=${host ? `${host.tagName}.${String(host.className).split(' ')[0]}` : '?'}@${range.startOffset}`
    const sc0 = ae ? scrollersUp(ae)[0] : null
    const line = sc0 ? caretLineEl(range, sc0) : null
    if (line) {
      const lr = line.getBoundingClientRect()
      caret += ` line=${line.tagName}.${String(line.className).split(' ')[0]} ${Math.round(lr.top)}..${Math.round(lr.bottom)}`
      kbMark('caret-line', '#ff3b30', lr.top - mShift, lr.height)
    }
  }
  const sc = ae ? scrollersUp(ae)[0] : null
  const scBox = sc?.getBoundingClientRect()
  // The fixed surface hosting the field — its own rect + the COMPUTED fit paddings,
  // so "the .kb-open padding never applied" and "it applied but paint disagrees"
  // stop being indistinguishable theories.
  const shell = ae?.closest<HTMLElement>('.note-editor, .scene, .recipe-modal, .cashier, .vv-fit') ?? null
  const shBox = shell?.getBoundingClientRect()
  const shCs = shell ? getComputedStyle(shell) : null
  kbMark('visB', '#ff9500', visibleBottom(sc) - mShift)
  if (scBox) kbMark('scroller', '#00c7be', scBox.top - mShift, scBox.height)
  kbDebugEl.textContent = [
    `inner=${window.innerHeight} vvH=${vv ? Math.round(vv.height) : '-'} vvT=${vv ? Math.round(vv.offsetTop) : '-'} scale=${vv?.scale ?? '-'}`,
    `kbInset=${kbInset} open=${document.documentElement.classList.contains('kb-open')} --kb=${cs.getPropertyValue('--kb').trim()} --kbF=${cs.getPropertyValue('--kb-fixed').trim()} --vvt=${cs.getPropertyValue('--vvt').trim()}`,
    `visBottom=${Math.round(visibleBottom())} eff=${sc ? Math.round(visibleBottom(sc)) : '-'} shift=${ae ? fixedShellShift(ae) : 0} accessory=${accessoryPad()}`,
    shell && shBox && shCs
      ? `shell=${String(shell.className).split(' ')[0]} ${Math.round(shBox.top)}..${Math.round(shBox.bottom)} padT=${shCs.paddingTop} padB=${shCs.paddingBottom}`
      : 'shell=none',
    `ae=${ae ? `${ae.tagName}.${String(ae.className).split(' ')[0]}` : 'none'} caretY=${caret}`,
    sc && scBox
      ? `scroller=${String(sc.className).split(' ')[0]} top=${Math.round(scBox.top)} bottom=${Math.round(scBox.bottom)} sT=${Math.round(sc.scrollTop)} sH=${sc.scrollHeight} cH=${sc.clientHeight} slack=${getComputedStyle(sc).paddingBottom}`
      : 'scroller=none',
    ...kbDebugLog,
  ].join('\n')
}

// iOS standalone can GLUE a full-screen `position:fixed` layer to the VISUAL
// viewport during the keyboard pan: the layer's painted position stops matching
// its client rects — content at client y paints at visual y, not visual y−vvT.
// Marc's marker captures (2026-07-14) proved it: rulers drawn at reported client
// coords landed one full pan (136px) above the painted rows they named. The one
// measurable tell is the layer's own rect: iOS expands it upward by exactly the
// pan, so an inset:0 shell reads top = −vv.offsetTop while glued (and 0 when
// not). That top IS the correction, self-calibrating per device and per state:
// every band decision for content inside a fixed layer must shift by it.
function fixedShellShift(from: HTMLElement | null): number {
  const vv = window.visualViewport
  if (!vv || vv.offsetTop < 1) return 0
  for (let el = from; el; el = el.parentElement) {
    if (getComputedStyle(el).position === 'fixed') {
      return Math.max(-vv.offsetTop, Math.min(0, el.getBoundingClientRect().top))
    }
  }
  return 0
}

// Bottom of the area the user can actually SEE, in `el`'s own client-rect
// coordinates: the visual viewport's bottom edge, shifted into the fixed layer's
// glued space when iOS dragged one (fixedShellShift), minus the floating
// accessory pill's band while the keyboard is up. Every "is the caret hidden?"
// decision must compare against THIS, never against an element's own box — a
// fixed full-screen surface keeps its full layout height under the keyboard, so
// its box.bottom lies about what's visible.
function visibleBottom(el?: HTMLElement | null): number {
  const vv = window.visualViewport
  const bottom = vv ? vv.offsetTop + vv.height : window.innerHeight
  const shift = el ? fixedShellShift(el) : 0
  return bottom + shift - (kbInset > KB_THRESHOLD ? accessoryPad() : 0)
}

// Keep the CARET visible inside a scrolling contentEditable.
//
// The global focus-pin below scrolls the focused ELEMENT into view, which is right for
// an <input>/<textarea> (small, one line of interest) but useless for a tall
// contentEditable: the host already spans the whole editor, so it's "in view" while the
// line you're typing sits far below the fold. Browsers normally keep the caret visible
// themselves, but not reliably inside a fixed, keyboard-overlaid container on iOS — so
// we drive it. Nudges the scroller only when the caret has actually left the band
// (idempotent, so it can be called on every keystroke without fighting a manual
// scroll). A collapsed range reports no client rect in some engines; fall back to the
// containing element's rect.
export function caretIntoView(scroller: HTMLElement, pad = 24): void {
  const sel = document.getSelection()
  if (!sel || sel.rangeCount === 0) return
  const range = sel.getRangeAt(0)
  // Caret-follow is for a CARET. An expanded range means the user is selecting —
  // and its first client rect is the ANCHOR line (the top of the selection), not
  // the handle being dragged. Following it scrolls the view back UP toward the
  // anchor on every drag frame, fighting the finger dragging the lower handle
  // down ("it keeps pulling me back up"). Typing into a selection collapses it
  // first, so the next real caret move still follows.
  if (!range.collapsed) return
  if (!scroller.contains(range.startContainer)) return

  let src = 'r'
  let rect = range.getClientRects()[0] ?? range.getBoundingClientRect()
  // The LINE the caret lives on — the top-level block under the scroller. This is
  // the ground truth the caret rect must agree with: WebKit reports NO rect for a
  // collapsed range whose container is an element (exactly what caretToEnd leaves
  // on the empty line Enter just created), and can report a STALE rect (a line
  // above) right after a DOM edit — both let the line being typed sink under the
  // keyboard while the follow believes below=0 (Marc's iOS checklist capture).
  const line = caretLineEl(range, scroller)
  const lineBox = line?.getBoundingClientRect()
  if (!rect || (rect.top === 0 && rect.bottom === 0)) {
    if (!lineBox) return
    rect = lineBox
    src = 'line'
  } else if (lineBox && (rect.bottom < lineBox.top - 1 || rect.top > lineBox.bottom + 1)) {
    // A caret rect OUTSIDE its own line's box is a lie — measure the line instead.
    rect = lineBox
    src = 'line!'
  }

  const box = scroller.getBoundingClientRect()
  // Clamp to what's actually VISIBLE: with the keyboard up, the scroller's own
  // bottom can sit under the keyboard (a fixed surface whose .kb-open pin hasn't
  // settled yet) and under the iOS floating accessory pill either way. Scrolling
  // is still able to lift the caret above both — the box is just a window.
  const bottomEdge = Math.min(box.bottom, visibleBottom(scroller))
  const below = rect.bottom - (bottomEdge - pad)
  const above = box.top + pad - rect.top
  if (below > 0) {
    const before = scroller.scrollTop
    scroller.scrollTop += below
    // The scroller can run out of road (content ends at the caret while the box
    // still extends under the keyboard) — spill the remainder to its ancestors.
    const left = below - (scroller.scrollTop - before)
    if (left > 0.5) nudgeBy(scroller, left)
    kbDebug(`civ ${src} b=${Math.round(rect.bottom)}/${Math.round(bottomEdge)} below=${Math.round(below)} moved=${Math.round(scroller.scrollTop - before)} left=${Math.round(left)}`)
  } else if (above > 0) {
    scroller.scrollTop -= above
    kbDebug(`civ ${src} above=${Math.round(above)}`)
  } else {
    kbDebug(`civ ${src} ok b=${Math.round(rect.bottom)}/${Math.round(bottomEdge)}`)
  }
}

// The top-level line block the caret sits on: the direct child of the contentEditable
// HOST holding the caret (the host IS the scroller in the note editor, but can be a
// smaller editable inside a big sheet scroller — a line must never resolve to a whole
// form section). A collapsed range can also sit BETWEEN blocks (container = the host
// itself, e.g. caretToEnd on the line Enter just made, or iOS restoring a selection) —
// resolve that to the adjacent child rather than measuring the whole host, whose rect
// would demand a bogus scroll.
function caretLineEl(range: Range, scroller: HTMLElement): HTMLElement | null {
  let node: Node | null = range.startContainer
  const el = node.nodeType === Node.ELEMENT_NODE ? (node as HTMLElement) : node.parentElement
  let host: HTMLElement | null = el && el.isContentEditable ? el : null
  while (host?.parentElement?.isContentEditable) host = host.parentElement
  const root = host && scroller.contains(host) ? host : scroller
  if (node === root) {
    const kids = root.childNodes
    node = kids.length ? kids[Math.min(range.startOffset, kids.length - 1)] : null
  }
  while (node && node.parentNode && node.parentNode !== root) node = node.parentNode
  return node && node.parentNode === root && node.nodeType === Node.ELEMENT_NODE ? (node as HTMLElement) : null
}

// Every scrollable ancestor of `from` (itself included — the NoteEditor body is
// its own scroller), nearest first. #root, the document-level scroller, is an
// ancestor of everything, so the walk always ends at a scroller that can move.
function scrollersUp(from: HTMLElement | null): HTMLElement[] {
  const out: HTMLElement[] = []
  for (let el = from; el; el = el.parentElement) {
    if (el.scrollHeight > el.clientHeight + 1 && /(auto|scroll)/.test(getComputedStyle(el).overflowY)) out.push(el)
  }
  return out
}

// Scroll `from`'s ANCESTORS down by dy px, nearest scroller first, spilling the
// remainder outward until absorbed. Never scrolls `from` itself — for a
// <textarea> that would scroll its own text away from the caret.
function nudgeBy(from: HTMLElement, dy: number): void {
  for (const sc of scrollersUp(from.parentElement)) {
    if (dy <= 0.5) return
    const before = sc.scrollTop
    sc.scrollTop += dy
    dy -= sc.scrollTop - before
  }
}

// The GENERAL caret-follow, run on every input/selection change while the
// keyboard is up (wired in trackVisualViewport). The focus-time pin only fires
// once; typing can push the caret back under the keyboard afterwards — a new
// line in a contentEditable, wrapped text growing a field, layout settling, the
// user scrolling to peek and then resuming. This is the version of what
// NoteEditor wires by hand (afterInput → caretIntoView), for EVERY field.
function followCaret(el: HTMLElement): void {
  if (el.isContentEditable) {
    const scroller = scrollersUp(el)[0]
    kbDebug(`follow ce scroller=${scroller ? String(scroller.className).split(' ')[0] : 'NONE'}`)
    if (scroller) caretIntoView(scroller)
    return
  }
  // <input>/<textarea>: the Selection API can't see the caret inside a form
  // control, but every one of ours is a few rems tall and scrolls internally —
  // the browser keeps the caret visible WITHIN the control, so revealing the
  // control's bottom edge is enough.
  const over = el.getBoundingClientRect().bottom - (visibleBottom(el) - 24)
  if (over > 0) nudgeBy(el, over)
}

// Re-read the visual viewport ON DEMAND. The vars above only recompute when the
// browser SAYS the viewport moved — and iOS skips that event in one very reachable
// case: the keyboard closes because its focused field was REMOVED (a route change
// unmounting the form). No `resize`, and no `focusout` either — so `.kb-open` +
// --kb-fixed stay latched at the keyboard's height, and the NEXT full-screen
// surface pads ~290px of itself away: a dead band across the bottom third that
// hides the rest of the page (Marc, iOS PWA — the day page opened from the
// calendar showed nothing past « Dîner »). Nothing else re-measured on a
// client-side navigation, so the stale band followed you from page to page.
// This is a pure re-READ of the live viewport, never a guess about the keyboard,
// so calling it can only replace a stale answer with the true one — a keyboard
// that IS still up keeps its fit. No-op before trackVisualViewport() has run (or
// where visualViewport is missing).
let remeasureNow: () => void = () => {}
export function remeasureViewport(): void {
  remeasureNow()
}

export function trackVisualViewport(): void {
  const vv = window.visualViewport
  if (!vv) return
  const root = document.documentElement.style

  // ?kbdebug=1 anywhere in the URL → live diagnostics overlay (sticks for the
  // session so in-app navigation keeps it; kill it by closing the app).
  if (/[?&]kbdebug=1/.test(location.search) || sessionStorage.getItem('bbKbDebug') === '1') {
    try {
      sessionStorage.setItem('bbKbDebug', '1')
    } catch {
      /* private mode — the overlay still works for this page */
    }
    kbDebugEl = document.createElement('div')
    kbDebugEl.style.cssText =
      // top tracks --vvt: iOS pans the layout viewport when the keyboard opens,
      // which pushed a plain top:4px overlay right off the screen (Marc's shot).
      'position:fixed;top:calc(var(--vvt, 0px) + 4px);left:4px;right:4px;z-index:99999;background:rgba(0,0,0,.78);color:#7CFC98;' +
      'font:11px/1.4 ui-monospace,monospace;padding:6px 8px;pointer-events:none;white-space:pre-wrap;border-radius:8px;'
    document.body.appendChild(kbDebugEl)
    setInterval(renderKbDebug, 250)
  }

  // Browser zoom is locked (viewport user-scalable=no + touch-action in
  // core.css), but iOS Safari ignores user-scalable=no in a plain browser tab,
  // so a pinch can still slip through there. Two guards:
  //   1. Skip writes while vv.scale > 1 — a pinch fires resize+scroll every
  //      frame, and writing the shrunken vv.height would squash overlays sized
  //      with --vvh and make them shimmer through the gesture.
  //   2. rAF-coalesce bursts so we set the vars at most once per frame.
  // The current keyboard inset (module-level kbInset) gates the focus-scroll and
  // caret-follow below, so they only nudge on a device whose keyboard is
  // actually up (0 on desktop → no jump on click).
  let kbOpen = false
  let queued = false

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
    kbDebug(`pin ${el.tagName}${el.isContentEditable ? '/ce' : ''}`)
    const action = actionBelow(el)
    if (action) action.scrollIntoView({ block: 'nearest', behavior })
    // A tall contentEditable host is already "in view" while the caret the user
    // just placed (tap at the end of a long note) sits under the keyboard —
    // scrollIntoView on the ELEMENT would no-op. Pin the CARET instead; the
    // input-driven follow takes over from the first keystroke either way.
    else if (el.isContentEditable) followCaret(el)
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
    // The 900ms tail: iOS's own caret-reveal scroll is an ANIMATION that can land
    // after our 480ms retry and drag the caret back under the keyboard; one late,
    // idempotent re-pin outlasts it.
    for (const ms of [120, 280, 480, 900]) pinTimers.push(setTimeout(() => pinOnce('auto'), ms))
  }

  const apply = () => {
    queued = false
    if (vv.scale > 1) return
    // A SUSPENDED web view reports a collapsed visualViewport — iOS does this while
    // the app-switcher, the screenshot preview/markup editor, or a system share sheet
    // is on top. `innerHeight - vv.height` then looks exactly like a keyboard, so we'd
    // latch --kb + `.kb-open` and come back with the tab bar and ＋ FAB hidden and a
    // parked sheet peeking over the bottom edge. Measure only what the user can see.
    if (document.hidden) return
    // "Is a keyboard up?" is the total viewport SHRINK — deliberately ignoring
    // vv.offsetTop. In a standalone iOS app, focusing a caret near the BOTTOM of
    // the screen makes iOS PAN the viewport (offsetTop jumps, sometimes by most of
    // the keyboard's height — the "viewport push"). The old `inner - height -
    // offsetTop` then read the keyboard as nearly gone: `.kb-open` dropped, the
    // padding vanished, and every pin/follow gate disarmed — exactly when the user
    // tapped the end of a long note and needed them most. The pan doesn't change
    // whether a keyboard exists; only the shrink does.
    kbInset = Math.max(0, Math.round(window.innerHeight - vv.height))
    // What a fixed inset:0 surface must pad away at the BOTTOM is pan-aware
    // geometry though: the pan moves part of the obscured band from the bottom
    // (--kb) to the top (--vvt), and the two paddings together must equal the
    // shrink or content drifts off the visible band.
    const bottomInset = Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop))
    root.setProperty('--vvh', `${Math.round(vv.height)}px`)
    root.setProperty('--vvt', `${Math.round(vv.offsetTop)}px`)
    // A shrunken visual viewport is NOT proof of a keyboard, and treating it as one
    // cost the bottom chrome (Marc, 2026-08-28: « perte du footer », with the ?kbdebug
    // overlay reading `kbInset=318 open=true ae=BODY` — a 318px "keyboard" while
    // NOTHING was focused). iOS collapses the visual viewport for things that are not
    // keyboards: the screenshot preview/markup editor, the app switcher, Control
    // Centre, a share sheet. `document.hidden` above catches only some of those — it
    // stays FALSE for a screenshot preview — so the shrink read exactly like a
    // keyboard, `.kb-open` latched, and hub.css hid the tab bar and the ＋ FAB with no
    // field on screen to justify it and no event coming to heal it.
    //
    // The missing invariant: a keyboard cannot ARRIVE if nothing that could summon one
    // holds focus. Gated on the RISING edge only (`|| kbOpen` keeps an already-open
    // keyboard open) — and that half matters as much as the guard itself. A keyboard
    // genuinely still up across an in-app NAVIGATION has no focused field: the old one
    // unmounted with the route. Gating both edges dropped the fit there and broke
    // `keyboard.spec.ts` « a keyboard that is genuinely still up keeps its fit across a
    // navigation » — a case that exists precisely because the re-read must agree with
    // the device rather than blanket-clear on every route change.
    //
    // So: a phantom shrink with nothing ever focused never opens (the reported bug),
    // while a real keyboard survives losing its field. The falling edge stays where it
    // was — owned by the geometry (the shrink going away) and by the healers below.
    const open = kbInset > KB_THRESHOLD && (kbOpen || canSummonKeyboard(document.activeElement))
    // --kb means "how much keyboard covers the bottom", so it must agree with
    // `.kb-open` — publishing a sub-threshold inset (browser chrome, an accessory
    // bar) lifted every consumer off a keyboard that isn't there.
    root.setProperty('--kb', `${open ? bottomInset : 0}px`)
    // The FIXED-layer bottom inset. When iOS glues a full-screen fixed shell to
    // the visual viewport (fixedShellShift < 0 — see its comment), the pan no
    // longer relieves that shell's bottom: content inside it paints at its client
    // coords, so the true occlusion is the pan-reduced inset PLUS the glue shift
    // (= the full shrink when fully glued). core.css « Keyboard fit » pads fixed
    // surfaces with THIS; in-page scrollers (.hub__body) keep --kb.
    const focused = document.activeElement
    const shift = open && focused instanceof HTMLElement ? fixedShellShift(focused) : 0
    // Set only while open; REMOVE when closed (never publish 0px): a defined 0
    // would beat core.css's `var(--kb-fixed, var(--kb))` fallback and zero the
    // fit padding for anything that publishes --kb by hand (e2e stubs do).
    if (open) root.setProperty('--kb-fixed', `${Math.round(bottomInset - shift)}px`)
    else root.removeProperty('--kb-fixed')
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

  // Coming back from a suspend, re-measure. Two things need it: the `document.hidden`
  // guard above skipped every event that arrived while away, and rAF is frozen while
  // hidden — so a callback queued on the way out never ran, leaving `queued` latched
  // true and `schedule()` deaf to every later resize. Clear the latch, then re-read a
  // few times as the viewport settles (iOS serves the pre-suspend height for a frame
  // or two, and sometimes never fires a resize of its own on the way back).
  //
  // Three signals because no single one covers every way iOS takes the screen away:
  // the app-switcher and a backgrounded PWA fire `visibilitychange`; a system overlay
  // that merely covers us (the screenshot preview → Markup editor, a share sheet)
  // fires only window blur/focus; a bfcache restore fires only `pageshow`.
  const remeasure = () => {
    if (document.hidden) return
    queued = false
    schedule()
    for (const ms of [60, 200, 500]) setTimeout(schedule, ms)
  }
  // The same re-read, callable from React: `remeasureViewport()` fires on every
  // client-side navigation (router.tsx). Wired here so it shares this closure's
  // `queued` latch and its settle retries — the keyboard's dismissal ANIMATION is
  // still running when the route changes, so one immediate read isn't enough.
  remeasureNow = remeasure
  document.addEventListener('visibilitychange', remeasure)
  window.addEventListener('focus', remeasure)
  window.addEventListener('pageshow', remeasure)

  // Tapping a field re-pins it — whether the keyboard is still arriving (the
  // rising edge above also fires) or ALREADY up (moving between fields, which gets
  // no viewport resize, so the rising edge won't fire). pinFocused self-schedules
  // its own settle retries, so focus churn (e.g. the combobox's blur/refocus
  // dance) just resets a cheap idempotent schedule instead of cancelling the one
  // chance to scroll.
  document.addEventListener('focusin', (e) => {
    if (!isEditable(e.target)) return
    // --kb-fixed is derived from the FOCUSED field's fixed shell — recompute when
    // focus moves (keyboard already up = no viewport event will do it for us).
    schedule()
    pinFocused()
  })

  // Typing FOLLOWS the caret — the focus-time pin above fires once, but a new
  // line, wrapped text, or settling layout can push the caret back under the
  // keyboard afterwards (Marc, iOS Notes du cercle: « ça continue en dessous du
  // clavier »). 'input' catches typing; 'selectionchange' catches caret moves
  // without input (arrow keys on a tablet's hardware keyboard) and fires on
  // every keystroke too, so both funnel into one rAF-coalesced pass. followCaret
  // only acts when the caret has actually left the visible band, so a manual
  // scroll-to-peek while typing is never fought, and desktop (kbInset 0) is a
  // constant-time no-op.
  let followQueued = false
  const follow = () => {
    if (followQueued || kbInset <= KB_THRESHOLD) return
    followQueued = true
    requestAnimationFrame(() => {
      followQueued = false
      if (kbInset <= KB_THRESHOLD) return
      const el = document.activeElement
      if (isEditable(el) && el.isConnected) followCaret(el)
    })
  }
  document.addEventListener('input', follow)
  // iOS fires SPURIOUS selectionchange events while the user merely SCROLLS a
  // contentEditable holding a caret — following those yanks the scroll straight
  // back to the caret, fighting the finger (felt as jank / "I can't scroll away").
  // Only follow when the selection has actually MOVED; a same-place repeat is a
  // scroll artefact, not a caret move.
  let lastA: Node | null = null
  let lastF: Node | null = null
  let lastAO = -1
  let lastFO = -1
  document.addEventListener('selectionchange', () => {
    const s = document.getSelection()
    const a = s?.anchorNode ?? null
    const f = s?.focusNode ?? null
    const ao = s?.anchorOffset ?? -1
    const fo = s?.focusOffset ?? -1
    if (a === lastA && f === lastF && ao === lastAO && fo === lastFO) return
    lastA = a
    lastF = f
    lastAO = ao
    lastFO = fo
    // An EXPANDED selection is a drag-the-handles gesture, not a caret move —
    // never follow it (caretIntoView would measure the anchor end and scroll the
    // view back up under the user's finger). Skipping here also spares the rAF
    // churn: a handle drag changes focusNode/focusOffset on every frame.
    if (!s || !s.isCollapsed) return
    follow()
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

  // …and the case `focusout` itself misses: the field wasn't blurred, it was
  // REMOVED (a sheet closing, a form unmounting on save). Removing the focused
  // node fires no blur/focusout, and iOS can hide the keyboard without a
  // visualViewport `resize` — so the vars latch. On a NAVIGATION the router
  // re-reads them (remeasureViewport above); this covers the same unmount with no
  // route change. Gated tight: only when we still claim a keyboard is up while
  // nothing editable holds focus — with a field focused this is a no-op, so a live
  // keyboard is never fought. It only ever re-READS the viewport; a keyboard that
  // is genuinely still up keeps its fit.
  document.addEventListener('pointerup', () => {
    if (kbOpen && !isEditable(document.activeElement)) schedule()
  })

  // Watchdog: `.kb-open` with NOTHING editable focused must not outlive the
  // keyboard. Every healer above needs an EVENT — a tap (pointerup), a navigation
  // (remeasureViewport), a focus change — but idle hands heal nothing: close a
  // composer via its own ✕ (the field unmounts, iOS hides the keyboard with no
  // `resize` and no `focusout`) and then just LOOK at the screen, and the tab bar
  // + ＋ FAB stay hidden until the next tap (« the bottom bar sometimes
  // disappears », 2026-08-27). While the state is contradictory — we claim a
  // keyboard yet no field holds focus — re-READ once a second. Pure re-read,
  // never a guess: a keyboard genuinely up keeps its fit; a stale latch clears
  // within a tick. Constant-time no-op the rest of the time.
  setInterval(() => {
    if (kbOpen && !document.hidden && !isEditable(document.activeElement)) schedule()
  }, 1000)

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
