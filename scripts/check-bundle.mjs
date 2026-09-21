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
//      LAZY_CAPS is a separate list: chunks that DO need precaching but are too
//      big for the generic per-chunk budget.
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
  // 2026-09-09, and the whole story is worth keeping because it happened in one hour.
  // The « ~386 KB » that stood here was two months stale, so a chunk sitting at 420.0 KB
  // against a 420 KB cap — 181 bytes — read as comfortable. It wasn't: the glossary mark,
  // a Réglages-only component, went over the line on its own.
  //
  // Then the eager graph was actually WALKED instead of guessed at, and « Mois » and
  // « Année » turned out to be statically imported by the board even though both sit
  // behind a view switch the board does not open on. Making the two lazy took the entry
  // chunk 430 KB → **340 KB**: 82 KB, four times the two files' own weight, because they
  // dragged the whole month/year helper set with them.
  //
  // Ratcheted here, in the same commit that earned it: **365 KB** (~25 KB of room).
  // The rule is unchanged — reach for `lazy()` before you reach for a bigger number.
  { re: /^index-/, cap: 365 * KB, label: 'eager entry' }, // today ~340 KB
  { re: /^react-vendor-/, cap: 280 * KB, label: 'eager react-vendor' }, // today ~227 KB
  // today ~99 KB under a 110 KB cap. THE NOTE THAT USED TO SIT HERE HAS BEEN CASHED.
  //
  // It read: « today ~130 KB — i.e. AT the cap », after « Les remarques » (0136) pushed it
  // 112 bytes over and went red, and it said the honest fix was to lazy-load part of the FR
  // dictionary the way i18n.en already is — NOT to nudge the number up. That is what
  // happened on 2026-09-21: the `operator` namespace (703 lines, 21% of the French
  // dictionary) moved to src/i18n.operator.ts and out of the boot path. 130 → 99 KB, and
  // the eager total 586 → 555 KB.
  //
  // AND THE CAP CAME DOWN WITH IT, 130 → 110. A budget that keeps its old ceiling after a
  // win is not a budget, it is a memory of one: it hands the next thirty kilobytes back
  // without anyone deciding to spend them. Same rule as every other ratchet here — it may
  // fall, never rise. The 11 KB left is room to write copy in, not room to re-fill.
  { re: /^i18n-/, cap: 110 * KB, label: 'eager i18n (FR only — EN + Réglages lazy-load as their own chunks)' },
]
// Ratcheted 700 → 620 by the door-closure pass (STATE §4-L L4, 2026-09-16): making
// HubLayout + Board lazy took the entry chunk 227 KB → the combined three to ~582 KB.
// The rule is unchanged — reach for lazy() before you reach for a bigger number — and
// the closure check below is now the one that actually measures the door.
const EAGER_TOTAL_BUDGET = 620 * KB // combined index + react-vendor + i18n (today ~582 KB)
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
  //
  // 105 → 120 KB later the same day: the fixture switch (« Données : Exemple ») and the
  // first four board-card specimens it unlocks took it to 104 KB, which leaves no room
  // for the next entry. The catalogue is SUPPOSED to keep growing — that is the whole
  // point of the parity guard — so the cap is set with headroom rather than being nudged
  // by a kilobyte per specimen. The e2e fixtures themselves are NOT in here: they sit
  // behind `import.meta.env.DEV` and compile out (`grep "Clinique dentaire Sourire"
  // dist/assets` finds nothing — that string exists only in e2e/mocks.ts).
  //
  // 90 → 105 KB on 2026-09-09: the parity pass added the eight specimens
  // COMPONENTS.md already claimed were gallery-suitable (FormScene, Loading/
  // PairPrompt, TopBar, HelpDot, SectionIntro, SwipeDeletePane, DocUploadButton,
  // DrawPad) and it landed at 94 KB. Almost all of that is the specimen PROSE,
  // which is the point of the page. Raised deliberately, not to unblock a push —
  // this chunk is lazy, un-precached, and reachable only from Réglages ▸ Système.
  { re: /^DevKit-/, cap: 120 * KB },
]

// Lazy chunks that ARE required in the precache (unlike ONLINE_ONLY) but are too
// big for the generic CHUNK_BUDGET — each gets its own explicit cap instead.
const LAZY_CAPS = [
  // THE note editor (TipTap/ProseMirror, ~380 KB) — no longer opt-in BETA
  // (2026-09-04): every note open loads it now, so it must stay precached like
  // any other lazy route (NFR-OFFLINE-1). Keep in sync with vite.config.ts.
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
  const lazyCap = LAZY_CAPS.find((c) => c.re.test(f))
  if (lazyCap) {
    if (size > lazyCap.cap) failures.push(`${f} exceeds its budget: ${kb} KB > ${Math.round(lazyCap.cap / KB)} KB (lazy, custom cap)`)
    continue
  }
  if (size > CHUNK_BUDGET)
    failures.push(`${f} exceeds its budget: ${kb} KB > ${Math.round(CHUNK_BUDGET / KB)} KB (lazy chunk)`)
}

if (eagerTotal > EAGER_TOTAL_BUDGET)
  failures.push(`combined eager JS (index + react-vendor + i18n) is ${Math.round(eagerTotal / KB)} KB > ${Math.round(EAGER_TOTAL_BUDGET / KB)} KB budget`)

// 2-bis. THE DOOR'S STATIC CLOSURE — every chunk the browser must fetch before it can
// run one line of the marketing page (STATE §4-L L4). The three-chunk "eager" total
// above is an accounting convention and it UNDERCOUNTS: Rolldown's shared-commons chunk
// (emitted under the `drawpad` group's name) rides the entry too, and until 2026-09-16
// so did the whole hub — HubLayout and Board were static imports in router.tsx "for the
// kiosk's offline boot", so a stranger downloaded a household planner to read one
// headline: **70 chunks, 1131 KB raw**, which a 400 ms link turns into eleven seconds.
// Making the two lazy took it to **7 chunks, 726 KB** — 63 round trips the door no
// longer pays for. The SW precaches every lazy chunk (check 2 above is what makes that
// true), so the kiosk's offline reboot is unaffected; `npm run e2e:sw` proves it.
//
// Walked from Vite's own manifest, so it cannot drift from what ships. Both numbers are
// RATCHETS: they may fall, never rise. A new static import in router.tsx is the exact
// mistake this catches, and it catches it as a number rather than a code review.
const CLOSURE_CHUNK_CAP = 10 // today 7
const CLOSURE_BUDGET = 800 * KB // today ~726 KB
const LAZY_BY_NAME = ['src/components/HubLayout.tsx', 'src/pages/Board.tsx']
const manifestPath = join(DIST, '.vite', 'manifest.json')
if (!existsSync(manifestPath)) {
  failures.push('dist/.vite/manifest.json is missing — set build.manifest in vite.config.ts (the door-closure check reads it)')
} else {
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  const entryKey = Object.keys(manifest).find((k) => manifest[k].isEntry)
  const closure = new Set()
  const walk = (k) => {
    if (!k || closure.has(k)) return
    closure.add(k)
    for (const dep of manifest[k]?.imports ?? []) walk(dep)
  }
  walk(entryKey)
  let closureBytes = 0
  for (const k of closure) {
    const f = manifest[k]?.file
    if (f && existsSync(join(DIST, f))) closureBytes += statSync(join(DIST, f)).size
  }
  if (closure.size > CLOSURE_CHUNK_CAP)
    failures.push(
      `the door's static closure is ${closure.size} chunks > ${CLOSURE_CHUNK_CAP} — something became a STATIC import of the entry; make it lazy() (see router.tsx)`,
    )
  if (closureBytes > CLOSURE_BUDGET)
    failures.push(`the door's static closure is ${Math.round(closureBytes / KB)} KB > ${Math.round(CLOSURE_BUDGET / KB)} KB — see above`)
  // …and the two that were the whole problem, by name: each must be its OWN chunk (a
  // dynamic-import boundary gets a manifest key; a static import is folded into the
  // entry and has none) and must not be reachable statically from the door.
  for (const name of LAZY_BY_NAME) {
    if (!manifest[name]) failures.push(`${name} has no chunk of its own — it is a STATIC import again, and the door pays for it`)
    else if (closure.has(name)) failures.push(`${name} is in the door's static closure — it must be reached by lazy() only`)
  }
  console.log(`door: ${closure.size} chunks / ${Math.round(closureBytes / KB)} KB in the entry's static closure.`)
}

// 2-ter. THE _headers FILE — the security headers for everything the Worker never sees.
// Cloudflare's assets router serves a request that MATCHES A REAL FILE (`/` → index.html,
// `/manifest.webmanifest`) straight from the edge without invoking the Worker, so
// `withSecurityHeaders` cannot reach them: production answered `/` with ZERO security
// headers while /board and /api/health had all six (2026-09-17). vite.config.ts emits
// this file from the same ENFORCED list; if the plugin is ever dropped, the door goes
// bare again and nothing else would say so.
const headersFile = join(DIST, '_headers')
if (!existsSync(headersFile)) {
  failures.push('dist/_headers is missing — the securityHeadersFile() plugin in vite.config.ts is what covers the static-asset responses the Worker never sees')
} else {
  const src = readFileSync(headersFile, 'utf8')
  for (const name of ['Strict-Transport-Security', 'X-Content-Type-Options', 'Referrer-Policy', 'Permissions-Policy', 'Content-Security-Policy']) {
    if (!src.includes(name + ':')) failures.push(`dist/_headers does not set ${name} — see functions/_lib/securityHeaders.ts`)
  }
  // …and it must NOT be precached: Cloudflare consumes _headers and never serves it, so
  // a CRITICAL precache entry for it 404s and the kiosk cannot boot offline. Same for
  // .vite/manifest.json, which is this script's own input and never the app's.
  for (const u of ['/_headers', '/.vite/manifest.json']) {
    if (sw.includes(`"${u}"`)) failures.push(`${u} is in the sw.js precache — it is build metadata, not an app asset (Cloudflare does not even serve _headers, so install() would 404 on it)`)
  }
}

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
