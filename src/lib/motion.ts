// E-40 (bmad/08): honour prefers-reduced-motion in JS-DRIVEN scrolling. CSS
// animations gate themselves via @media; the imperative
// scrollIntoView/scrollTo calls need this equivalent — a long smooth glide
// across a page is significant motion. Use at the call site:
//   el.scrollIntoView({ block: 'center', behavior: scrollBehavior() })
// Read live per call (not cached at module load) so flipping the OS setting
// applies to the very next scroll.
export function scrollBehavior(): ScrollBehavior {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'
  } catch {
    return 'smooth'
  }
}

// Scroll a deep-linked node into view AFTER the layout under it has stopped moving,
// then make sure it actually landed.
//
// Why this exists rather than a bare `scrollIntoView`: a deep-link (the guide's
// ?card=&point=, and anything shaped like it) arrives while the page is still
// settling — ancestors are being opened, the target card expands, and the wiring
// consumes its own URL params with a `replace` navigation. Every one of those is a
// re-render AFTER the scroll was requested, and a smooth scroll that started against
// the old layout is simply lost: the guide's point scroll fired, the re-render landed,
// and the reader was left at the TOP of the page looking at the wrong card.
//
// So: wait for the target's position to hold still for two consecutive frames (bounded
// by `settleMs`), scroll once, then verify. If the node still isn't on screen a moment
// later — the usual sign that a late re-render ate the glide — snap it into place
// instantly rather than leaving the reader stranded. Worst case is well under the ~2 s
// a reader will wait before deciding the link is broken.
//
// Returns a cancel function; call it from the effect's cleanup so a fast second
// deep-link doesn't fight the first.
export function scrollIntoViewSettled(
  el: HTMLElement,
  { block = 'center', settleMs = 600, verifyMs = 350 }: { block?: ScrollLogicalPosition; settleMs?: number; verifyMs?: number } = {},
): () => void {
  let cancelled = false
  let raf = 0
  let timer = 0
  const started = performance.now()
  let lastTop: number | null = null
  let stableFrames = 0

  const onScreen = () => {
    const r = el.getBoundingClientRect()
    // Generous: any part of it inside the viewport counts as "the reader can see it".
    return r.bottom > 0 && r.top < (window.innerHeight || 0)
  }

  const land = () => {
    if (cancelled || !el.isConnected) return
    el.scrollIntoView({ behavior: scrollBehavior(), block })
    // The glide can still be cancelled by a re-render that arrives after it starts.
    // Re-check once and, if so, put the reader there without the animation.
    timer = window.setTimeout(() => {
      if (cancelled || !el.isConnected || onScreen()) return
      el.scrollIntoView({ behavior: 'auto', block })
    }, verifyMs)
  }

  const tick = () => {
    if (cancelled || !el.isConnected) return
    const top = Math.round(el.getBoundingClientRect().top)
    stableFrames = lastTop === top ? stableFrames + 1 : 0
    lastTop = top
    if (stableFrames >= 2 || performance.now() - started > settleMs) {
      land()
      return
    }
    raf = requestAnimationFrame(tick)
  }
  raf = requestAnimationFrame(tick)

  return () => {
    cancelled = true
    cancelAnimationFrame(raf)
    window.clearTimeout(timer)
  }
}
