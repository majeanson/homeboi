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
