// PWA service-worker registration — prod builds only. Dev (Vite/e2e) never
// registers: the SW would fight HMR and make test runs stateful. /sw.js itself
// is generated at build time by the babillard-sw plugin in vite.config.ts.
export function registerSw(): void {
  if (!import.meta.env.PROD) return
  if (!('serviceWorker' in navigator)) return
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      /* offline-first is an enhancement — a failed registration never blocks */
    })
  })
}
