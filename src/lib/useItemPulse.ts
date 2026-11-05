import { useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'

const TRIES = 40
const EVERY_MS = 100
const HOLD_MS = 1800

// ?item=<id> → land ON the row (solidify 4.2, 2026-11-05): wait for `[data-item="<id>"]`
// (the data may still be loading), scroll it into view, wear `.is-item-target` for a
// moment, then strip the param so a reload or a back does not replay it. Read the LIVE
// url when stripping: a param set in the meantime must survive (the Réglages ?focus=
// timer lost a tab that way). A row that never appears (a card the device has hidden)
// simply lands on the page.
export function useItemPulse() {
  const [params, setParams] = useSearchParams()
  const item = params.get('item')
  useEffect(() => {
    if (!item) return
    const path = window.location.pathname
    let tries = 0
    const timer = window.setInterval(() => {
      if (window.location.pathname !== path) {
        window.clearInterval(timer)
        return
      }
      const el = document.querySelector<HTMLElement>(`[data-item="${CSS.escape(item)}"]`)
      tries += 1
      if (!el && tries < TRIES) return
      window.clearInterval(timer)
      if (el) {
        el.scrollIntoView({ block: 'center' })
        el.classList.add('is-item-target')
        // Not cleared on cleanup: stripping the param re-runs this effect, the mark outlives it.
        window.setTimeout(() => el.classList.remove('is-item-target'), HOLD_MS)
      }
      setParams(
        () => {
          const next = new URLSearchParams(window.location.search)
          next.delete('item')
          return next
        },
        { replace: true },
      )
    }, EVERY_MS)
    return () => window.clearInterval(timer)
  }, [item, setParams])
}
