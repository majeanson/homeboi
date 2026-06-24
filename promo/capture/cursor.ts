// Injected before the page loads so the RECORDED video shows a real, gliding cursor
// that reacts to Playwright's mouse events (move/down/up). Playwright doesn't render a
// pointer in its video, so we draw our own: a soft accent dot that eases toward the
// pointer, shrinks on press, and emits a single calm ripple on click.
//
// addInitScript runs this in the page context. Keep it self-contained (no imports).
export function installCursor() {
  const ACCENT = '#5891AC'
  const style = document.createElement('style')
  style.textContent = `
    #promo-cursor{position:fixed;left:0;top:0;width:34px;height:34px;margin:-17px 0 0 -17px;
      border-radius:50%;background:${ACCENT};opacity:.92;pointer-events:none;z-index:2147483647;
      box-shadow:0 0 0 7px ${ACCENT}2e, 0 6px 18px rgba(40,30,18,.35);
      transition:transform .12s ease-out, left .09s linear, top .09s linear;will-change:left,top,transform}
    #promo-cursor.down{transform:scale(.7)}
    .promo-ripple{position:fixed;border-radius:50%;border:3px solid ${ACCENT};pointer-events:none;
      z-index:2147483646;opacity:.6;animation:promoRipple .65s ease-out forwards}
    @keyframes promoRipple{from{width:18px;height:18px;margin:-9px 0 0 -9px;opacity:.6}
      to{width:120px;height:120px;margin:-60px 0 0 -60px;opacity:0}}
  `
  document.documentElement.appendChild(style)

  const dot = document.createElement('div')
  dot.id = 'promo-cursor'
  dot.style.left = '50%'
  dot.style.top = '70%'
  const add = () => document.body && document.body.appendChild(dot)
  if (document.body) add()
  else document.addEventListener('DOMContentLoaded', add)

  window.addEventListener(
    'mousemove',
    (e) => {
      dot.style.left = e.clientX + 'px'
      dot.style.top = e.clientY + 'px'
    },
    true,
  )
  window.addEventListener(
    'mousedown',
    (e) => {
      dot.classList.add('down')
      const r = document.createElement('div')
      r.className = 'promo-ripple'
      r.style.left = e.clientX + 'px'
      r.style.top = e.clientY + 'px'
      ;(document.body || document.documentElement).appendChild(r)
      setTimeout(() => r.remove(), 700)
    },
    true,
  )
  window.addEventListener('mouseup', () => dot.classList.remove('down'), true)
}
