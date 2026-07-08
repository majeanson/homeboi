// C-23 (bmad/08) — the offline-aware bundle guard, run by CI after `npm run build`.
//
// Two things must never drift, and both have quietly broken elsewhere before:
//   1. SIZE — the eager entry (index-*.js) and every lazy chunk stay under a
//      budget, so a slow kitchen tablet keeps booting fast and a new import
//      can't silently drag a megabyte into the shell.
//   2. OFFLINE (load-bearing) — every JS chunk EXCEPT the online-only allowlist
//      is present in the generated sw.js PRECACHE list. The app lazy-loads ~40
//      routes; a kiosk that reboots OFFLINE must still open every one of them,
//      which only works if the service worker precached every lazy chunk.
//      Conversely the allowlisted online-only chunks (the 1.3 MB HEIC upload
//      decoder) must NOT be precached — that's the whole point of excluding
//      them. Keep ONLINE_ONLY in sync with ONLINE_ONLY_CHUNKS in vite.config.ts.
//
// Budgets are ~15-25% above today's real sizes — headroom for normal growth,
// tight enough that "oops, the whole guide landed in the shell" fails loudly.
//
// B-11 (bmad/10) — `vite.config.ts` manualChunks pulls react/-dom/-router-dom and
// i18n.ts (the FR dict) out of index-*.js into their own named chunks so they cache
// across deploys instead of re-downloading inside a renamed entry file. All three
// (index-, react-vendor-, i18n-) still load EAGERLY (main.tsx's static import
// chain), so they're budgeted individually AND as a combined eager total — the
// real boot cost a slow tablet pays before first paint. `i18n.en-*.js` (the EN
// dict) is a SEPARATE lazy chunk — src/i18n.ts dynamic-import()s it only when
// lang==='en' — so it's checked as an ordinary lazy chunk below, not eager.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const DIST = 'dist'
const ASSETS = join(DIST, 'assets')

const KB = 1024
const CHUNK_BUDGET = 320 * KB // any lazy chunk (largest today: i18n.en ~81 KB)
const EAGER_CHUNKS = [
  // name pattern → its own budget (all three load before first paint)
  { re: /^index-/, cap: 320 * KB, label: 'eager entry' }, // today ~251 KB
  { re: /^react-vendor-/, cap: 280 * KB, label: 'eager react-vendor' }, // today ~223 KB
  { re: /^i18n-/, cap: 130 * KB, label: 'eager i18n (FR only — EN lazy-loads as i18n.en-*.js)' }, // today ~101 KB
]
const EAGER_TOTAL_BUDGET = 620 * KB // combined index + react-vendor + i18n (today ~575 KB)
const ONLINE_ONLY = [
  // chunk-name pattern → its own generous cap (it's lazy AND un-precached)
  { re: /^heic2any-/, cap: 1600 * KB },
]

const sw = readFileSync(join(DIST, 'sw.js'), 'utf8')
const failures = []
let total = 0
let eagerTotal = 0

for (const f of readdirSync(ASSETS).filter((f) => f.endsWith('.js'))) {
  const size = statSync(join(ASSETS, f)).size
  total += size
  const kb = Math.round(size / KB)
  const precached = sw.includes(`/assets/${f}`)
  const online = ONLINE_ONLY.find((o) => o.re.test(f))

  if (online) {
    if (precached) failures.push(`${f} is ONLINE-ONLY but landed in the sw.js precache (${kb} KB on every kiosk install)`)
    if (size > online.cap) failures.push(`${f} exceeds its online-only cap: ${kb} KB > ${Math.round(online.cap / KB)} KB`)
    continue
  }
  if (!precached)
    failures.push(`${f} is missing from the sw.js precache — a kiosk rebooting offline cannot open its route (NFR-OFFLINE-1)`)
  const eager = EAGER_CHUNKS.find((e) => e.re.test(f))
  if (eager) {
    eagerTotal += size
    if (size > eager.cap) failures.push(`${f} exceeds its budget: ${kb} KB > ${Math.round(eager.cap / KB)} KB (${eager.label})`)
    continue
  }
  if (size > CHUNK_BUDGET)
    failures.push(`${f} exceeds its budget: ${kb} KB > ${Math.round(CHUNK_BUDGET / KB)} KB (lazy chunk)`)
}

if (eagerTotal > EAGER_TOTAL_BUDGET)
  failures.push(`combined eager JS (index + react-vendor + i18n) is ${Math.round(eagerTotal / KB)} KB > ${Math.round(EAGER_TOTAL_BUDGET / KB)} KB budget`)

console.log(`bundle: ${Math.round(total / KB)} KB of JS across dist/assets (${Math.round(eagerTotal / KB)} KB eager); sw.js precache checked.`)
if (failures.length) {
  for (const f of failures) console.error(`✗ ${f}`)
  process.exit(1)
}
console.log('✓ every chunk within budget; precache covers all offline-needed chunks and skips the online-only ones.')
