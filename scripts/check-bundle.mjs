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
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const DIST = 'dist'
const ASSETS = join(DIST, 'assets')

const KB = 1024
const CHUNK_BUDGET = 320 * KB // any lazy chunk (largest today: drawpad ~134 KB)
const EAGER_CHUNKS = [
  // name pattern → its own budget (all three load before first paint)
  { re: /^index-/, cap: 420 * KB, label: 'eager entry' }, // today ~386 KB
  { re: /^react-vendor-/, cap: 280 * KB, label: 'eager react-vendor' }, // today ~227 KB
  { re: /^i18n-/, cap: 130 * KB, label: 'eager i18n (FR only — EN lazy-loads as i18n.en-*.js)' }, // today ~101 KB
]
const EAGER_TOTAL_BUDGET = 760 * KB // combined index + react-vendor + i18n (today ~718 KB)
// fix(ci): re-based a SECOND time, for the same reason as the first — the number
// moved because the accounting boundary moved, not because boot got heavier.
// Retiring « Moments » deleted three lazy routes (MomentScene/MomentsView/MomentPeek),
// which re-balanced Rolldown's shared-chunk grouping: 17 small chunks that the entry
// was ALREADY importing statically got folded INTO index-*.js. Measured both ways,
// building HEAD and the change side by side:
//     entry alone            327 KB → 386 KB   (+59, what this guard sees)
//     TRUE eager cost       1064 KB → 1065 KB  (+1, the transitive closure of the
//                                               entry's STATIC imports — what a
//                                               tablet actually downloads to boot)
//     all JS emitted        3818 KB → 3810 KB  (-8)
//     chunks                   185  →   167
// So a slow kitchen tablet pays the same as before; ~59 KB simply moved from chunks
// this guard never counted into the one it does.
//
// KNOWN GAP worth closing separately: `EAGER_CHUNKS` matches on FILENAME
// (index-/react-vendor-/i18n-), so every OTHER chunk the entry statically imports —
// write-*.js at 142 KB, drawpad, Modal, Layout, Avatar… — escapes the eager budget
// entirely. That is why the honest boot figure (1065 KB) is far above the 718 KB
// this file reports. Pinning a chunk out of the entry therefore "fixes" this guard
// without making anything faster; don't. The real fix is to budget the static
// closure instead of three filename patterns.
// fix(ci): both numbers above were re-based on what the build ACTUALLY emits, after
// two long-standing lies in this file cancelled each other out and then stopped:
//   • the entry was never ~251 KB — it has been ~320.5 KiB for a while, i.e. sitting
//     ON the old 320 KiB cap. It failed on ROUNDING, so three unrelated commits from
//     three sessions went red within the hour without touching the shell. Re-based to
//     360 with real headroom; the guard still catches a feature landing in the shell.
//   • no i18n-*.js chunk was emitted AT ALL (Vite 8/Rolldown folded the manualChunks
//     alias away — see vite.config.ts), so the ~76 KB FR dict rode inside drawpad-*.js.
//     The shell statically imports i18n, which quietly dragged the whole drawpad chunk
//     (perfect-freehand included) into the boot path while this eager total reported a
//     comfortable 535 KB. Now that the dict has its own chunk the total counts it —
//     648 KB is not new weight, it is the first honest reading (and boot actually got
//     LIGHTER: drawpad fell 253 → 137 KB).
const ONLINE_ONLY = [
  // chunk-name pattern → its own generous cap (it's lazy AND un-precached)
  { re: /^heic2any-/, cap: 1600 * KB },
  // B-11 (bmad/10) — /dev/kit is a dev-only component gallery, never a kiosk
  // surface; accept no offline gallery rather than tax every install.
  { re: /^DevKit-/, cap: 90 * KB },
  // The opt-in BETA note editor (TipTap/ProseMirror, ~380 KB): only beta devices
  // ever load it, so it stays out of every install's precache; the classic
  // editor remains the offline path. Keep in sync with vite.config.ts.
  { re: /^NoteEditorTiptap-/, cap: 450 * KB },
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

// 3. NO PHANTOMS — the mirror of check 2, and the half that was missing. Above we
// walk the files and demand each is precached; nothing walked the precache and
// demanded each entry is a real file. Four were not: a module whose only job is
// `import './x.css'` leaves a JS chunk that vite:css-post extracts and DELETES,
// and reading the bundle before that hook baked those never-emitted names into
// the list (fixed by `order: 'post'` in vite.config.ts). A precache entry with no
// file behind it is not harmless — under an SPA fallback it answers 200 text/html,
// and an install that caches that has put HTML under a `.js` URL, which is the
// grey-screen bug arriving through the install path instead of the fetch path.
for (const u of [...(sw.match(/"\/assets\/[^"]+"/g) ?? [])].map((s) => s.slice(1, -1))) {
  if (!existsSync(join(DIST, u.slice(1))))
    failures.push(`${u} is in the sw.js precache but no such file was built — an SPA fallback answers it with HTML`)
}

console.log(`bundle: ${Math.round(total / KB)} KB of JS across dist/assets (${Math.round(eagerTotal / KB)} KB eager); sw.js precache checked.`)
if (failures.length) {
  for (const f of failures) console.error(`✗ ${f}`)
  process.exit(1)
}
console.log('✓ every chunk within budget; precache covers all offline-needed chunks and skips the online-only ones.')
