// THE DOOR'S COLD START, MEASURED ON PRODUCTION — `npm run perf:door`, on demand.
//
// What a stranger pays to see the marketing headline: the entry's static closure as
// the WIRE sees it (requests, compressed bytes, first paint, LCP, the headline visible,
// load), on an iPhone 13 profile with a FRESH context per run — empty cache, no service
// worker — under Chrome DevTools' own throttling presets, applied through CDP. Median
// of RUNS (3) per condition; `BABILLARD_URL` overrides the target, `RUNS` the count.
//
// WHY THE PRESETS ARE WRITTEN DOWN HERE. STATE §4-K wave 2 measured the door twice by
// hand (11.2 s, then 7.1 s after the hub went lazy) and never recorded the throttle it
// used, so the third measurement could not be compared to either: at DevTools' « Slow
// 4G » the same door read 13.0 s. A stopwatch without its preset is not a number. The
// BYTES are the comparable figure across sessions — 78 requests / 487 KB on 2026-09-16,
// 15 / 305 KB on 2026-09-25 — and this script prints both, so the next run compares.
//
// The presets are DevTools' (renamed Slow/Fast 3G → 4G in 2024; the numbers did not
// move — Chromium's MobileThrottling conditions):
//   Fast 4G: 1.6 Mbit/s × 0.9 down, 750 kbit/s × 0.9 up, 150 ms × 3.75 latency
//   Slow 4G: 500 kbit/s × 0.8 down and up, 400 ms × 5 latency
// CDP throttling shares bandwidth EQUALLY across in-flight requests and ignores HTTP/2
// priority, so under it the render-blocking stylesheet finishes with the last chunk
// and first paint reads pessimistic. Real links deliver the CSS earlier. Read the
// waterfall this prints — one parallel wave from the HTML, or a chained round trip? —
// before reading the stopwatch.
//
// Reads production and writes nothing: no session, no sandbox mint, no household. Not in
// CI: it is a measurement someone reads, not a gate (the bundle gate is check-bundle.mjs).
import { chromium, devices } from '@playwright/test'

const BASE = process.env.BABILLARD_URL || 'https://babillard.marcportal.com'
const RUNS = Number(process.env.RUNS || 3)
const CONDITIONS = {
  'no throttle': null,
  'Fast 4G': { downloadThroughput: ((1.6 * 1000 * 1000) / 8) * 0.9, uploadThroughput: ((750 * 1000) / 8) * 0.9, latency: 150 * 3.75 },
  'Slow 4G': { downloadThroughput: ((500 * 1000) / 8) * 0.8, uploadThroughput: ((500 * 1000) / 8) * 0.8, latency: 400 * 5 },
}

const origin = new URL(BASE).origin
const median = (a) => {
  const s = [...a].sort((x, y) => x - y)
  return s[Math.floor(s.length / 2)]
}
const kb = (n) => (n / 1024).toFixed(0)
// OUR requests: same origin, minus Cloudflare's own edge paths (the RUM beacon, the bot
// challenge) — the stranger walk draws the same line.
const ours = (url) => url.startsWith(origin) && !new URL(url).pathname.startsWith('/cdn-cgi/')

async function once(browser, cond) {
  const ctx = await browser.newContext({ ...devices['iPhone 13'] })
  const page = await ctx.newPage()
  const cdp = await ctx.newCDPSession(page)
  await cdp.send('Network.enable')
  await cdp.send('Network.clearBrowserCache')
  if (cond) await cdp.send('Network.emulateNetworkConditions', { offline: false, ...cond })

  const reqs = new Map()
  let t0 = 0
  cdp.on('Network.requestWillBeSent', (e) => {
    if (!t0) t0 = e.timestamp
    reqs.set(e.requestId, { url: e.request.url, type: e.type, start: e.timestamp - t0, bytes: 0 })
  })
  cdp.on('Network.loadingFinished', (e) => {
    const r = reqs.get(e.requestId)
    if (r) {
      r.bytes = e.encodedDataLength
      r.end = e.timestamp - t0
    }
  })

  const started = Date.now()
  await page.goto(BASE + '/', { waitUntil: 'load' })
  // The door's headline — what the stranger is actually waiting for.
  await page.locator('h1').first().waitFor({ state: 'visible' })
  const headline = Date.now() - started
  await page.waitForLoadState('networkidle').catch(() => {})
  const idle = Date.now() - started

  const nav = await page.evaluate(
    () =>
      new Promise((resolve) => {
        const n = performance.getEntriesByType('navigation')[0]
        const paint = Object.fromEntries(performance.getEntriesByType('paint').map((p) => [p.name, p.startTime]))
        let lcp = 0
        try {
          new PerformanceObserver((l) => {
            for (const e of l.getEntries()) lcp = e.startTime
          }).observe({ type: 'largest-contentful-paint', buffered: true })
        } catch {
          /* no LCP on this engine — 0 says so */
        }
        setTimeout(() => resolve({ load: n.loadEventEnd, fcp: paint['first-contentful-paint'] ?? 0, lcp }), 300)
      }),
  )

  const all = [...reqs.values()]
  const mine = all.filter((r) => ours(r.url))
  const third = all.filter((r) => !ours(r.url))
  const out = {
    reqOurs: mine.length,
    reqThird: third.length,
    jsChunks: mine.filter((r) => /\.js(\?|$)/.test(r.url)).length,
    bytesOurs: mine.reduce((n, r) => n + r.bytes, 0),
    bytesThird: third.reduce((n, r) => n + r.bytes, 0),
    fcp: nav.fcp,
    lcp: nav.lcp,
    headline,
    load: nav.load,
    idle,
  }
  await ctx.close()
  return { out, all }
}

const browser = await chromium.launch()
const rows = []
let waterfall = null
for (const [name, cond] of Object.entries(CONDITIONS)) {
  const runs = []
  for (let i = 0; i < RUNS; i++) {
    const { out, all } = await once(browser, cond)
    runs.push(out)
    // The waterfall worth reading is the SLOW one: that is where a chained round trip shows.
    if (name === 'Slow 4G' && !waterfall) waterfall = all
    process.stderr.write(`${name} #${i + 1}: headline ${out.headline} ms · ${out.reqOurs} req · ${kb(out.bytesOurs)} KB\n`)
  }
  const m = (k) => median(runs.map((r) => r[k]))
  rows.push({
    condition: name,
    'req (ours)': m('reqOurs'),
    'req (3rd)': m('reqThird'),
    'js chunks': m('jsChunks'),
    'KB ours (wire)': kb(m('bytesOurs')),
    'KB 3rd': kb(m('bytesThird')),
    'FCP ms': Math.round(m('fcp')),
    'LCP ms': Math.round(m('lcp')),
    'headline ms': m('headline'),
    'load ms': Math.round(m('load')),
    'idle ms': m('idle'),
  })
}
await browser.close()

console.log(`\n${BASE} — the door, iPhone 13 profile, fresh context per run, median of ${RUNS}\n`)
console.table(rows)
if (waterfall) {
  console.log('\nSlow 4G waterfall (first run) — start → end, wire bytes, type, path:')
  for (const r of [...waterfall].sort((a, b) => a.start - b.start)) {
    const path = r.url.startsWith('data:') ? 'data:…' : r.url.replace(origin, '')
    console.log(`  ${r.start.toFixed(2).padStart(6)} → ${(r.end ?? 0).toFixed(2).padStart(6)} s  ${kb(r.bytes).padStart(4)} KB  ${(r.type ?? '').padEnd(10)} ${path.slice(0, 90)}`)
  }
}
