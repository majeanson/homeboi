// PWA service-worker registration — prod builds only. Dev (Vite/e2e) never
// registers: the SW would fight HMR and make test runs stateful. /sw.js itself
// is generated at build time by the babillard-sw plugin in vite.config.ts.
export function registerSw(): void {
  if (!import.meta.env.PROD) return
  if (!('serviceWorker' in navigator)) return
  window.addEventListener('load', () => {
    // A page already controlled at load → any controllerchange after this is a
    // genuine update, not the first-install claim. Captured before register().
    const hadController = !!navigator.serviceWorker.controller

    navigator.serviceWorker
      .register('/sw.js')
      .then((reg) => {
        // An installed, always-open PWA (wall tablet / phone app) never
        // re-navigates, so the browser never re-fetches /sw.js on its own — a
        // deploy goes unseen until a hard close + cold reopen. Poll for a new
        // build on a timer and whenever the app regains focus, so a push is
        // picked up within ~a minute. update() is a cheap conditional GET.
        const check = () => {
          reg.update().catch(() => {
            /* offline / transient — the next tick retries */
          })
        }
        setInterval(check, 60_000)
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') check()
        })
      })
      .catch(() => {
        /* offline-first is an enhancement — a failed registration never blocks */
      })

    // The generated SW calls skipWaiting()+clients.claim(), so a new build takes
    // control of this open page and fires controllerchange. Reload once to swap
    // in the fresh HTML/JS — but never yank the page out from under someone who's
    // mid-edit: defer the reload until the field is blurred or the tab refocuses.
    if (!hadController) return
    let pending = false
    const reloadWhenIdle = () => {
      if (!pending) return
      const el = document.activeElement
      const typing =
        el instanceof HTMLElement &&
        (el.isContentEditable || el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')
      if (typing) return
      window.location.reload()
    }
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      pending = true
      reloadWhenIdle()
    })
    document.addEventListener('focusout', reloadWhenIdle)
    document.addEventListener('visibilitychange', reloadWhenIdle)
  })
}
