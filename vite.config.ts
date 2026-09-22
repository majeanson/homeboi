import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { execFileSync } from 'node:child_process'
import { headersFileSource } from './functions/_lib/securityHeaders'

/**
 * The commit this bundle was built from, short form. CI sets GITHUB_SHA; locally we
 * ask git; anything else answers 'dev'.
 *
 * FAILS SOFT, ALWAYS. A build from an exported tarball has no .git, and git may not be
 * on PATH at all. A missing build stamp is a small loss — a build that refuses to run
 * because it could not find one is a large one, so every failure lands on 'dev'.
 */
function buildSha(): string {
  const fromCi = process.env.GITHUB_SHA
  if (fromCi && /^[0-9a-f]{7,64}$/i.test(fromCi)) return fromCi.slice(0, 12)
  try {
    return execFileSync('git', ['rev-parse', '--short=12', 'HEAD'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() || 'dev'
  } catch {
    return 'dev'
  }
}

// SPA build. The app is a Cloudflare Worker with static assets: worker/index.ts
// serves dist/ and routes /api/* to the handlers in functions/. Local full-stack
// dev is `npm run cf:dev` (wrangler dev — serves assets + Worker on :8787);
// plain `vite` gives a frontend-only loop with HMR and the API proxied to that
// wrangler instance. Test config lives in vitest.config.ts (kept separate so the
// two vite copies don't clash in tsc).

// Files Vite copies from public/ (not part of the bundle object) that the app
// shell needs offline — keep in sync with public/.
const PUBLIC_SHELL = [
  '/',
  '/manifest.webmanifest',
  '/theme-bootstrap.js',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-maskable-512.png',
  '/icons/apple-touch-icon.png',
]

// C-23 (bmad/08): chunks deliberately EXCLUDED from the kiosk precache because
// their feature is ONLINE-ONLY — an offline reboot can never need them, and
// precaching them taxes every install. heic2any is the ~1.3 MB wasm HEIC
// decoder used only while UPLOADING an iPhone photo (Blob writes never queue —
// OFFLINE.md); it still loads on first use online and the SW's cache-first
// asset handler runtime-caches it then. Every OTHER lazy chunk MUST stay
// precached (a kiosk rebooting offline must open every lazy route) — the
// load-bearing constraint scripts/check-bundle.mjs enforces BOTH sides of in CI.
// Keep this list in sync with ONLINE_ONLY in that script.
// B-11 (bmad/10): DevKit (/dev/kit) joins the list — a dev-only component
// gallery, never a kiosk surface; accept no offline /dev/kit rather than tax
// every install with its specimen chrome. guideContent stays precached — it's
// the real offline-facing surface (the in-app Guide).
// NoteEditorTiptap is DELIBERATELY NOT here (2026-09-04): it used to be the
// opt-in BETA note-editing surface, excluded like heic2any because only beta
// devices ever loaded it. It's now the ONLY note editor — every note open needs
// it — so it must stay in the precache like every other lazy route
// (NFR-OFFLINE-1); its real ~380 KB just gets its own cap in check-bundle.mjs's
// LAZY_CAPS instead of the generic per-chunk budget.
const ONLINE_ONLY_CHUNKS = [/^assets\/heic2any-/, /^assets\/DevKit-/]

// Caching-policy version, folded into the cache name (see serviceWorker()). Bump
// on ANY change to swSource's caching rules so the new SW evicts caches written
// under the old rules — the asset-list hash alone can't, since a policy-only fix
// leaves the asset list (and therefore the cache name) identical.
//   v2 — never cache/serve the SPA-fallback HTML under a subresource URL.
//   v3 — install() separates critical (the shell + this build's bundles: retried,
//        all-or-nothing) from optional (public/ files: still best-effort).
//   v4 — a navigation RE-CACHES the shell it just fetched (so the stale-asset
//        branch's delete heals), never answers respondWith with undefined (that is
//        a failed navigation, which an installed PWA paints black), and gives the
//        network-first fetch a 4s leash before taking the cache.
const SW_POLICY = 'v4-shell-refresh-and-offline-page'

// Build-time service worker: emit /sw.js with the REAL hashed asset list baked
// in, so a freshly-installed kiosk precaches the whole shell and reboots fine
// offline (NFR-OFFLINE-1). Hand-rolled and dependency-free on purpose — the
// caching policy is a dozen lines (see swSource) and the asset list is the only
// thing a build truly knows better than runtime.
// The security headers for the responses the WORKER NEVER SEES. Cloudflare's assets
// router answers a request matching a real file straight from the edge, without invoking
// the Worker — so the marketing door shipped without a single security header while
// every other route had all six (measured on production, 2026-09-17). A `_headers` file
// in the assets directory is the layer that covers them. Generated, never hand-written:
// the source is the same ENFORCED list the Worker's wrapper uses.
function securityHeadersFile(): Plugin {
  return {
    name: 'babillard-headers',
    apply: 'build',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: '_headers', source: headersFileSource() })
    },
  }
}

function serviceWorker(): Plugin {
  return {
    name: 'babillard-sw',
    apply: 'build',
    // `order: 'post'` so this reads the bundle AFTER Vite's own generateBundle
    // hooks — vite:css-post above all. A module whose only job is `import
    // './x.css'` leaves a JS chunk that css-post extracts the CSS out of and then
    // DELETES from the bundle. Reading the bundle before that showed four such
    // phantoms (carnets · cercle · handoff · intake) — names that never become
    // files — and they went into the precache, where the SPA fallback answered
    // them with 200 text/html and `c.add` wrote that HTML under a `.js` URL: the
    // grey-screen shape (SW_POLICY v2) arriving through install instead of fetch.
    // Nothing imports those URLs, so it stayed invisible until install() began
    // refusing html-under-.js.
    generateBundle: {
      order: 'post',
      handler(_opts, bundle) {
      const assets = Object.keys(bundle)
        .filter((f) => !f.endsWith('.map') && f !== 'index.html')
        // BUILD METADATA, not app assets — and precaching either is a real hazard, not
        // clutter. `_headers` is CONSUMED by Cloudflare and never served, so install()
        // would 404 on a CRITICAL entry and the kiosk could not boot offline (the
        // NFR-OFFLINE-1 failure this whole list exists to prevent); `.vite/manifest.json`
        // is the door-closure check's input (scripts/check-bundle.mjs), read at build
        // time from disk and never by the app. Both arrived with 2026-09-17's work and
        // both are excluded here, at the source, rather than filtered downstream.
        // NOTE the sw harness cannot catch this one: `vite preview` serves dist/
        // verbatim, `_headers` included, so only production tells the truth.
        .filter((f) => f !== '_headers' && !f.startsWith('.vite/'))
        .filter((f) => !ONLINE_ONLY_CHUNKS.some((re) => re.test(f)))
        .map((f) => '/' + f)
      // Two tiers, decided HERE because only the build knows which is which.
      // CRITICAL: the shell entry plus this build's own hashed bundles — miss any
      // one and the tablet cannot boot offline, so install() must not settle for a
      // partial set. OPTIONAL: the public/ files (manifest, icons, the theme
      // bootstrap) — nice offline, never load-bearing, and a renamed one must not
      // take the shell down with it.
      const critical = ['/', ...assets]
      const optional = PUBLIC_SHELL.filter((u) => u !== '/')
      const precache = [...PUBLIC_SHELL, ...assets]
      // djb2 over the precache list AND the caching-policy version → a stable
      // per-build cache version, so a redeploy installs fresh and activate()
      // drops the old cache. SW_POLICY is folded in because a policy fix that
      // leaves the asset list untouched would otherwise hash to the SAME cache
      // name — and so never evict the caches the old policy corrupted. Bump it
      // whenever swSource's caching rules change.
      let h = 5381
      for (const c of [SW_POLICY, ...precache].join('|')) h = ((h * 33) ^ c.charCodeAt(0)) >>> 0
      this.emitFile({ type: 'asset', fileName: 'sw.js', source: swSource(h.toString(36), critical, optional) })
      },
    },
  }
}

const swSource = (version: string, critical: string[], optional: string[]) => `// Generated by vite.config.ts (babillard-sw) — do not edit.
// Offline app shell for the wall tablet / iPad PWA:
//   • precache: the built shell (this build's hashed assets + public files)
//   • navigations: network-first, falling back to the cached shell offline
//   • /api/img/* and /api/flyer-img: cache-first (immutable bytes — capability-key
//     photos, and Flipp clippings the "download for offline" step pre-warms)
//   • every other /api/*: untouched — data freshness stays TanStack's job
//     (it already keeps the last good frame + the "offline" stamp)
//   • Google Fonts: cache-as-you-go so type survives wifi loss
const CACHE = 'babillard-${version}'
// The shell entry + this build's hashed bundles. Miss ONE and the tablet cannot
// boot offline, so install() insists on the whole set (retrying to get it).
const PRECACHE_CRITICAL = ${JSON.stringify(critical, null, 1)}
// public/ files — nice offline, never load-bearing. Best-effort, as before.
const PRECACHE_OPTIONAL = ${JSON.stringify(optional, null, 1)}

// Fetch one shell entry into the cache, retrying a transient failure.
//
// c.add() does this in one call but can express neither half of what we need: it
// gives up after a single attempt, and it accepts ANY ok response — including the
// SPA-fallback HTML that the fetch handler below already refuses to serve under a
// subresource URL (SW_POLICY v2, the grey-screen bug). Install is the one moment
// we can still decline to WRITE that.
function cacheOne(c, url, tries) {
  return fetch(url)
    .then(function (res) {
      if (!res.ok) throw new Error('precache ' + url + ' -> ' + res.status)
      // '/' IS html; anything else answering as html is a build that's gone.
      var type = res.headers.get('content-type') || ''
      if (url !== '/' && type.indexOf('text/html') !== -1) throw new Error('precache ' + url + ' -> html')
      return c.put(url, res)
    })
    .catch(function (err) {
      if (tries <= 1) throw err
      return new Promise(function (r) { setTimeout(r, 300) }).then(function () { return cacheOne(c, url, tries - 1) })
    })
}

self.addEventListener('install', (e) => {
  // Two tiers, because "tolerate a failure here" is right for exactly one of them.
  //
  // OPTIONAL stays best-effort (allSettled): a renamed icon must never take the
  // shell down — which is why this stopped being addAll, whose one rejection would
  // leave NOTHING cached and no offline boot at all (NFR-OFFLINE-1).
  //
  // CRITICAL is all-or-nothing. The old code gave these the same tolerance, on the
  // reasoning that they "always exist for this build" — true, but that is a
  // BUILD-time fact, not a runtime one: the fetch can still fail (a blip, a loaded
  // server refusing a connection). allSettled swallowed it, skipWaiting ran anyway,
  // and the worker activated and claimed the page around a shell with a hole in it.
  // Nothing looked wrong until the tablet next rebooted with no network — possibly
  // months later — and came up blank with no way to tell why.
  //
  // So: retry, and if a critical entry still won't land, let install FAIL. That is
  // the safe outcome — the browser retries later, the previous worker and its cache
  // keep serving, and online the app is unaffected. skipWaiting only ever runs on a
  // shell that is actually whole.
  e.waitUntil(
    caches.open(CACHE)
      .then((c) =>
        Promise.all(PRECACHE_CRITICAL.map((u) => cacheOne(c, u, 3)))
          .then(() => Promise.allSettled(PRECACHE_OPTIONAL.map((u) => cacheOne(c, u, 2)))),
      )
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE && k !== 'babillard-share').map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

// THE LAST PAGE BEFORE NOTHING. Served only when a navigation has no network AND no
// cached shell to fall back on — the state an installed PWA used to render as a black
// rectangle. Deliberately one file, no assets, no fonts: it must work when nothing
// else does. FR first with the English under it, since the SW cannot know the locale
// the app was set to.
const OFFLINE_HTML = \`<!doctype html><html lang="fr"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>Babillard</title><style>
:root{color-scheme:light dark}
body{margin:0;min-height:100dvh;display:grid;place-items:center;padding:2rem;
background:#FBF3E4;color:#3c3730;text-align:center;
font:1rem/1.55 "Hanken Grotesk",system-ui,-apple-system,sans-serif}
main{max-width:22rem}h1{font-size:1.35rem;margin:0 0 .6rem}p{margin:0 0 .8rem}
.en{opacity:.6;font-size:.9rem}
button{margin-top:.6rem;font:inherit;padding:.6rem 1.2rem;border:0;border-radius:999px;
background:#E8A33D;color:#2b2620;cursor:pointer}
@media (prefers-color-scheme:dark){body{background:#1b1712;color:#e8e0d4}
button{background:#E8A33D;color:#2b2620}}
</style></head><body><main>
<h1>Babillard</h1>
<p>Pas de réseau, et le babillard n'est pas encore gardé sur cet appareil.</p>
<p>Rouvre-le une fois connecté&nbsp;: après ça, il s'ouvre même sans réseau.</p>
<p class="en">No network yet, and this device has not kept a copy. Open it once while connected.</p>
<button onclick="location.reload()">Réessayer</button>
</main></body></html>\`

// A navigation fallback is ALWAYS a Response. \`caches.match\` resolving undefined and
// being handed to respondWith() is a failed navigation, which an installed PWA paints
// as nothing at all.
function shellFallback() {
  return caches.match('/', { ignoreVary: true }).then(function (hit) {
    return hit || new Response(OFFLINE_HTML, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } })
  })
}

// Network-first, but on a leash, and it KEEPS what it gets.
//
// The SPA answers every route with the same index.html, so any HTML navigation
// response IS the shell — re-caching it under '/' keeps the offline entry fresh
// after a deploy and heals the one the stale-asset branch deletes. The exception is
// /partage/*, where the Worker injects per-share OG tags: that HTML is about one
// recipe, not about the app, and must not become everybody's shell.
function navigateWithShell(req, url) {
  var settled = false
  var live = fetch(req).then(function (res) {
    var type = res.headers.get('content-type') || ''
    if (res.ok && type.indexOf('text/html') !== -1 && url.pathname.indexOf('/partage/') !== 0) {
      var copy = res.clone()
      caches.open(CACHE).then(function (c) { return c.put('/', copy) }).catch(function () {})
    }
    settled = true
    return res
  })
  // A wifi that is connected but dead (captive portal, a dead spot in the kitchen)
  // makes fetch hang rather than fail, and network-first with no deadline means the
  // launch stares at nothing until the OS gives up. Four seconds, then the cache.
  var patience = new Promise(function (resolve) {
    setTimeout(function () { resolve(settled ? live : shellFallback()) }, 4000)
  })
  return Promise.race([live, patience]).catch(function () { return shellFallback() })
}

// EVERY cache lookup below passes { ignoreVary: true }. This SW stores exactly ONE
// variant per URL and never content-negotiates, so a Vary check on a lookup can only
// ever produce a FALSE miss — turning "the entry is right there" into "not found",
// which offline means a 504 and a blank board.
//
// Honesty about what this is: HARDENING, not a diagnosed fix. It was written as the
// suspected cause of the intermittent offline-boot failure (CI run 32971111746:
// /assets/index-*.js precached, missed, 504, React never mounted) — and then
// DISPROVED by the property test in e2e/sw.spec.ts, which stores a Vary-carrying
// response and finds it served either way. The reason: Accept-Encoding is a
// forbidden header name, added by the network stack BELOW the Cache API, so it is
// absent from both Requests being compared and the Vary check trivially matches.
//
// It stays because it is strictly-more-permissive and costs nothing, and because a
// future Vary (on a header that IS visible, e.g. Accept) would reintroduce exactly
// this failure. The real cause of the offline miss is still open — the spec now
// probes the cache at the moment of failure to name it.
//
// (Storing a synthetic new Request(url) instead would NOT help — its headers are
// empty too, which is the half of the comparison that would fail.)
self.addEventListener('fetch', (e) => {
  const req = e.request
  const url = new URL(req.url)

  // PWA share-target (#13 photos): the OS POSTs the shared payload to /share. A
  // POST navigation body can't be read by the SPA, so we intercept it here, stash
  // the image + text fields in a side cache, and 303-redirect to a GET the page
  // can read. SharePage drains 'babillard-share' on load.
  if (req.method === 'POST' && url.pathname === '/share') {
    e.respondWith((async () => {
      try {
        const form = await req.formData()
        const cache = await caches.open('babillard-share')
        const file = form.get('files')
        if (file && typeof file !== 'string' && file.size > 0) {
          await cache.put('/__share/file', new Response(file, { headers: { 'content-type': file.type || 'application/octet-stream' } }))
        } else {
          await cache.delete('/__share/file')
        }
        const meta = { title: form.get('title') || '', text: form.get('text') || '', url: form.get('url') || '' }
        await cache.put('/__share/meta', new Response(JSON.stringify(meta), { headers: { 'content-type': 'application/json' } }))
      } catch (_) { /* malformed share — fall through to an empty /share */ }
      return Response.redirect('/share?shared=1', 303)
    })())
    return
  }

  if (req.method !== 'GET') return

  // Cross-origin: only the font CDNs, cached as they're fetched. The stylesheet
  // is a render-blocking <link> in index.html (script execution after it in the
  // head waits for it to settle), so — like every other handler below — a failed
  // fetch MUST resolve to a real (if degraded) Response rather than leave the
  // promise passed to respondWith() rejected: this was the one handler in the
  // file without that fallback, an inconsistency that risks an unresolved
  // blocking-stylesheet wait on a slow/offline reload instead of failing fast.
  if (url.origin !== location.origin) {
    if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
      e.respondWith(
        caches.match(req, { ignoreVary: true }).then((hit) =>
          hit ?? fetch(req).then((res) => {
            const copy = res.clone()
            caches.open(CACHE).then((c) => c.put(req, copy))
            return res
          }).catch(() => new Response('', { status: 504 })),
        ),
      )
    }
    return
  }

  // Immutable image bytes → cache-first: capability-keyed photos (/api/img/) and
  // proxied Flipp clippings (/api/flyer-img), which the offline download pre-warms.
  // On a network-level fetch reject (upstream unreachable, connection dropped) fall
  // back to any cached copy, else a synthetic 504 — never let respondWith reject, or
  // the browser logs "ServiceWorker intercepted the request and encountered an
  // unexpected error" and the <img> breaks with no clean failure.
  if (url.pathname.startsWith('/api/img/') || url.pathname.startsWith('/api/flyer-img')) {
    e.respondWith(
      caches.match(req, { ignoreVary: true }).then((hit) =>
        hit ?? fetch(req).then((res) => {
          if (res.ok) {
            const copy = res.clone()
            caches.open(CACHE).then((c) => c.put(req, copy))
          }
          return res
        }).catch(() => new Response('', { status: 504 })),
      ),
    )
    return
  }

  // Live data: hands off — the query layer owns freshness and offline grace.
  if (url.pathname.startsWith('/api/')) return

  // App navigations: try the network (fresh HTML after a deploy), fall back to
  // the cached shell so an offline reboot still boots the board.
  //
  // THE BLACK SCREEN (Marc, 2026-09-14: « opening the app while offline it was all
  // black »). This line used to be exactly:
  //
  //     e.respondWith(fetch(req).catch(() => caches.match('/', { ignoreVary: true })))
  //
  // and it had two holes, both of which only ever show on the launch nobody tests —
  // a cold start with no network:
  //
  //  1. IT THREW THE FRESH SHELL AWAY. A successful navigation is the app's own
  //     HTML, in hand, and nothing put it back in the cache. So the '/' entry only
  //     ever came from install() — and the « Stale asset » branch below DELETES it
  //     on purpose (right, online: the next navigation must fetch fresh HTML). On a
  //     repo that deploys on every push, a still-open tab asking for a retired chunk
  //     is an ordinary Tuesday, so the shell gets dropped and stays dropped until
  //     the next build installs. Between those two moments every offline launch has
  //     no shell at all. Now: a navigation that comes back as HTML re-caches '/', so
  //     the drop heals on the very next online navigation (the preloadError reload
  //     in main.tsx is usually that navigation, within the same beat).
  //  2. WITH '/' GONE, caches.match RESOLVED UNDEFINED — and respondWith(undefined)
  //     is a FAILED navigation. In a browser tab that is the dinosaur page; in an
  //     installed PWA with no chrome it is a black rectangle with no way out, which
  //     is precisely what was reported. A fallback must always be a Response.
  //
  // …and a third, which is not a hole but a hang: network-FIRST has no deadline, so
  // a wifi that is connected-but-dead (a captive portal, the kitchen dead spot) left
  // the launch staring at nothing for as long as the OS took to give up. Race the
  // fetch against a short timer and take the cache when it wins.
  if (req.mode === 'navigate') {
    e.respondWith(navigateWithShell(req, url))
    return
  }

  // Static assets (hashed → immutable): cache-first, populate on miss. A failed
  // fetch falls back to cache, else a 504 — never let respondWith reject.
  //
  // THE TRAP: the origin serves the SPA with not_found_handling =
  // "single-page-application", so a request for a hashed asset that no longer
  // exists (a previous build's chunk, asked for by a stale shell) does NOT 404 —
  // it answers 200 text/html with index.html. res.ok is therefore TRUE, and
  // caching that writes HTML under a .js URL. Because this handler is cache-first
  // that entry then wins forever: the entry module parses as HTML, React never
  // mounts, and the app boots to a blank page on every reload, online or off.
  // So: a subresource that comes back as HTML means "this build is gone", never
  // "here is your script". Refuse to cache it, fail the request cleanly, and drop
  // the cached shell that pointed at it so the next navigation must hit the
  // network for fresh HTML (which references chunks that do exist).
  const wantsHtml = req.mode === 'navigate' || req.destination === 'document'

  e.respondWith(
    caches.match(req, { ignoreVary: true }).then((hit) =>
      hit ?? fetch(req).then((res) => {
        const isHtml = (res.headers.get('content-type') || '').includes('text/html')
        if (isHtml && !wantsHtml) {
          caches.open(CACHE).then((c) => c.delete('/')).catch(() => {})
          return new Response('', { status: 504, statusText: 'Stale asset' })
        }
        if (res.ok) {
          const copy = res.clone()
          caches.open(CACHE).then((c) => c.put(req, copy))
        }
        return res
      }).catch(() => new Response('', { status: 504 })),
    ),
  )
})
`

export default defineConfig({
  // Stamp the build moment into the bundle so Réglages ▸ Debug can show "last
  // updated" — a proxy for the last push (CI builds + deploys on every push to
  // main). Evaluated once when the build starts; in dev it's the dev-server start.
  define: {
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
    // …and WHICH COMMIT, because a timestamp is not one. « Les remarques » (0136)
    // stamps every report with the build it was seen on, so the fix starts from that
    // code rather than from whatever HEAD happens to be — and a timestamp makes that a
    // guess (`git log --before=…`, and two deploys on one day look alike).
    // CI hands us GITHUB_SHA; locally we ask git; a build from a tarball with no .git
    // gets 'dev'. Never throws — a missing stamp must not be able to fail a build.
    __BUILD_SHA__: JSON.stringify(buildSha()),
  },
  plugins: [react(), serviceWorker(), securityHeadersFile()],
  build: {
    // The build manifest is what lets scripts/check-bundle.mjs walk the ENTRY'S STATIC
    // CLOSURE — every chunk the browser fetches before it can run a line of the door —
    // rather than guess at it from three chunk names. That guess is how « eager » came
    // to undercount the real cost by hundreds of KB (STATE §4-K wave 2), and how the
    // hub sat in the marketing page's download for months.
    manifest: true,
    rollupOptions: {
      output: {
        // B-11 (bmad/10) — pull the framework + i18n out of the eager entry into
        // their own named chunks: react/-dom/-router-dom rarely change build to
        // build so they cache across deploys instead of re-downloading inside a
        // renamed index-*.js every time app code changes; i18n.ts (the FR dict —
        // EN lazy-loads separately, see src/i18n.ts) is sizeable and cache-worthy
        // on its own. Everything else keeps the bundler's automatic chunking.
        //
        // fix(ci): these were `manualChunks`, which under Vite 8 (Rolldown) is a
        // COMPAT SHIM whose chunk alias Rolldown may fold into a neighbouring group.
        // It quietly did: no i18n-*.js chunk was emitted at all, and the ~76 KB FR
        // dict floated between index-*.js and drawpad-*.js from build to build with
        // the module graph. Whenever it landed in index the eager entry sat AT its
        // 320 KiB cap — which is why three unrelated commits went red on
        // check:bundle within an hour without touching the shell. `advancedChunks`
        // is Rolldown's AUTHORITATIVE grouping: a group here is binding, so each
        // chunk is emitted every build and the entry can't flip-flop. It also
        // REPLACES manualChunks wholesale — every group we rely on must be listed
        // here, or it silently collapses back into the entry.
        advancedChunks: {
          groups: [
            { name: 'react-vendor', test: /node_modules[\\/](react|react-dom|react-router|react-router-dom)[\\/]/ },
            { name: 'i18n', test: /[\\/]src[\\/]i18n\.ts$/ },
            // THE `drawpad` GROUP USED TO BE HERE. It was removed on 2026-09-22, and
            // the reason is worth the paragraph, because the pin had turned into the
            // thing it was written to prevent.
            //
            // It pinned DrawPad + perfect-freehand into their own group because the
            // draw pad was reachable from the EAGER board (Notes/MemoControls) as well
            // as from five lazy pages, and Rolldown's automatic shared-chunk heuristic
            // is graph-sensitive: it had flipped once before (C-13) and landed DrawPad
            // inside `index-*.js`.
            //
            // Then §4-L L4 made HubLayout + Board lazy (2026-09-17), so nothing eager
            // reaches the draw pad any more — and the pin outlived its reason in the
            // worst way. A NAMED group is a chunk that exists on every build, which
            // makes it a home for shared modules: `drawpad-*.js` grew to **141 KB**
            // and was imported by ~180 chunks INCLUDING the entry. The door was
            // downloading perfect-freehand to render a marketing headline, under a
            // filename that made it look like the draw pad's own weight. A previous
            // session lost an hour lazy-loading `DrawPad` to fix it and measured no
            // change — of course: the file it chased was 3 KB of the 141.
            //
            // Removing the group: **door 700 KB → 645 KB in 7 → 9 chunks**, DrawPad
            // back to its own 51 KB lazy chunk, and the shared code where it belongs
            // (the entry grew 230 → 309 KB, which is the same bytes accounted
            // honestly). `check-bundle.mjs` now asserts by NAME that DrawPad stays out
            // of the door's closure, which is what the pin was really protecting —
            // said as an assertion instead of as a side effect of chunk naming.
          ],
        },
      },
    },
  },
  server: {
    // Pre-transform the lazy route modules at dev-server start. The app code-splits
    // ~40 pages via React.lazy; the FIRST hit on each cold-compiles in Vite, and
    // under the e2e suite's parallel workers that cold-compile can stall a
    // concurrent navigation → "failed to fetch dynamically imported module" /
    // ERR_CONNECTION_REFUSED flakes mid-run. Warming the page modules at boot races
    // them transformed before the tests hit them (non-blocking for server-ready;
    // also makes interactive first-navigation snappier). Pages pull their own
    // imports, so listing the route entries covers the split boundaries.
    warmup: {
      clientFiles: ['./src/main.tsx', './src/pages/**/*.tsx'],
    },
    proxy: {
      // Defaults to the local wrangler instance. Override with BABILLARD_API_PROXY
      // to point the frontend dev loop at a deployed Worker (e.g. real-data e2e
      // against prod) — changeOrigin so the Worker sees its own Host; the host-only
      // session cookies then land on 127.0.0.1 so login persists across the proxy.
      '/api': {
        target: process.env.BABILLARD_API_PROXY || 'http://127.0.0.1:8787',
        changeOrigin: true,
        secure: true,
      },
    },
  },
})
