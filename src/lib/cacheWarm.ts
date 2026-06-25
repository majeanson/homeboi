// Warm a set of same-origin URLs into the service worker's cache-first store by simply
// fetch()-ing each one. On iOS/iPadOS PWA (WebKit) there is NO Background Fetch API —
// so a plain in-session fetch() is how we populate the cache. The SW's cache-first rule
// for /api/flyer-img + /api/img/* puts every successful response in the cache (see
// vite.config.ts), so a later re-open or an offline visit reads from disk instantly.
//
// Best-effort by design: every failure is swallowed (a warm-up is never load-bearing).
// A small concurrency pool keeps it off the critical path without flooding the proxy —
// the browser already caps itself at ~6 connections per origin. `onTick` reports
// progress (count done) for callers that show a download bar; silent callers omit it.
export async function warmImageCache(
  urls: string[],
  concurrency = 6,
  onTick?: (done: number) => void,
): Promise<void> {
  const queue = urls.filter(Boolean)
  if (!queue.length) return
  let next = 0
  let done = 0
  const pull = async () => {
    while (next < queue.length) {
      const u = queue[next++]
      await fetch(u).catch(() => {})
      done++
      onTick?.(done)
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, queue.length) }, pull))
}
