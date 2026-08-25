import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

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
// NoteEditorTiptap joins too — the opt-in BETA note-editing surface (a ~380 KB
// ProseMirror chunk). Precaching it would tax every kiosk install for a surface
// only beta devices open; online it loads on first use and runtime-caches like
// heic2any. The CLASSIC editor stays the offline path (flip BETA off).
const ONLINE_ONLY_CHUNKS = [/^assets\/heic2any-/, /^assets\/DevKit-/, /^assets\/NoteEditorTiptap-/]

// Caching-policy version, folded into the cache name (see serviceWorker()). Bump
// on ANY change to swSource's caching rules so the new SW evicts caches written
// under the old rules — the asset-list hash alone can't, since a policy-only fix
// leaves the asset list (and therefore the cache name) identical.
//   v2 — never cache/serve the SPA-fallback HTML under a subresource URL.
//   v3 — install() separates critical (the shell + this build's bundles: retried,
//        all-or-nothing) from optional (public/ files: still best-effort).
const SW_POLICY = 'v3-critical-precache-retry'

// Build-time service worker: emit /sw.js with the REAL hashed asset list baked
// in, so a freshly-installed kiosk precaches the whole shell and reboots fine
// offline (NFR-OFFLINE-1). Hand-rolled and dependency-free on purpose — the
// caching policy is a dozen lines (see swSource) and the asset list is the only
// thing a build truly knows better than runtime.
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
        caches.match(req).then((hit) =>
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
      caches.match(req).then((hit) =>
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
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).catch(() => caches.match('/')))
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
    caches.match(req).then((hit) =>
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
  },
  plugins: [react(), serviceWorker()],
  build: {
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
            // The family draw pad (#14, ~50 KB incl. perfect-freehand) is reachable
            // from BOTH the eager board (Notes/MemoControls' "Note rapide" composer)
            // and several lazy-only pages (CardDeckEditor, RoutineFormPage,
            // NoteEditor, DrawEditChoice, DrawingGalleryPage). Automatic chunking is
            // supposed to factor a module shared across entry chunks into its own
            // shared chunk, but that heuristic is graph-sensitive and quietly flipped
            // once before (C-13, bmad/10), landing DrawPad inside index-*.js and
            // pushing eager JS 15 KB over budget (run 28991809068). Pin it.
            {
              name: 'drawpad',
              test: /(node_modules[\\/]perfect-freehand[\\/]|[\\/]src[\\/](components[\\/]DrawPad\.tsx|lib[\\/](drawViewport|traceFont)\.ts)$)/,
            },
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
