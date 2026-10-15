// « Am I inside someone else's page? » — true when the app is rendered in an iframe
// (the portfolio at marcportal.com/projects frames the public door as a scaled-down
// preview; functions/_lib/securityHeaders.ts allows exactly that origin).
//
// Read ONCE and never reactive: a page does not move in or out of a frame. It is a
// PRESENTATION hint like surface/audience — never a permission boundary, and never a
// reason to hide a control that works. What it is for: not stacking our own first-run
// chrome (the guided tour, the welcome card) over a preview that is mostly a window onto
// the board, and letting the door spend a 1280×800 frame on the product, not the footer.
//
// `public/theme-bootstrap.js` stamps the same fact on <html data-embedded> before first
// paint, so CSS can answer it with no flash; keep the two in step.
export function isEmbedded(): boolean {
  try {
    return window.self !== window.top
  } catch {
    // Reading `window.top` itself can throw in a sandboxed cross-origin frame — which
    // is, by definition, a frame.
    return true
  }
}
