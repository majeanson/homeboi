// ONE polite, visually hidden message line for the whole app (review #34): a change the
// screen already SHOWS but a screen reader would otherwise never hear — a row moved with
// the keyboard (« Lait, position 3 sur 12 »). Created on first use, reused after; cleared
// then set a frame later so the same words twice are still announced twice.
export function announce(message: string): void {
  if (typeof document === 'undefined') return
  let el = document.getElementById('sr-announce')
  if (!el) {
    el = document.createElement('div')
    el.id = 'sr-announce'
    el.className = 'sr-only'
    el.setAttribute('aria-live', 'polite')
    document.body.appendChild(el)
  }
  const node = el
  node.textContent = ''
  requestAnimationFrame(() => {
    node.textContent = message
  })
}
