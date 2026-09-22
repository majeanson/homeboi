// Security headers on every response (STATE.md §4-L, item L6, 2026-09-16).
//
// Until then the Worker sent none: no HSTS, no nosniff, no referrer policy, no
// frame-ancestors, no CSP. Four are safe to ENFORCE from the code as it stands; the full
// Content-Security-Policy ships REPORT-ONLY first, with a report door
// (functions/api/csp-report.ts) that logs what the real app trips, so the enforced
// policy is written from a week of facts rather than from a guess — enforcing blind
// would be the cut corner (a broken font or a blocked OCR worker in production).
//
// What the SPA actually loads, from the code (grep 2026-09-16):
//   · Google Fonts (styles + woff2), the two hosts index.html preconnects;
//   · tesseract.js: worker + WASM core from cdn.jsdelivr.net, trained data from the same
//     CDN (src/worker-script/index.js) — scripts, workers AND fetches;
//   · images from anywhere over https (flyer cut-outs on wishabi, NASA's photo of the
//     day, recipe imports keep their source image URL), plus data:/blob: previews;
//   · media (voice memos, routine clips) as blob: and same-origin R2 proxies;
//   · one cross-origin frame (FlippPager frames flipp.com) and same-origin frames
//     (CarnetDocs frames /api/img PDFs);
//   · the realtime socket on the same origin (wss:).
// frame-ancestors is ENFORCED (nothing legitimate frames us from another origin; /cast
// and /tv/<code> are opened directly). A 101 (the WebSocket upgrade) is returned
// untouched: an upgrade Response cannot be re-wrapped.

// Two corrections the LIVE report-only policy earned on its first night (the stranger
// walk read the visitor's console, 2026-09-16):
//   · `frame-ancestors` is IGNORED in a report-only policy and the browser says so in
//     every console — it belongs only to the enforced header below, where it already is;
//   · Cloudflare's RUM beacon (static.cloudflareinsights.com/beacon.min.js) is injected
//     by the EDGE, not by our HTML, so a policy written from our source alone would have
//     blocked analytics the moment it was enforced. Exactly what report-only is for.
export const CSP_REPORT_ONLY = [
  "default-src 'self'",
  "script-src 'self' https://cdn.jsdelivr.net https://static.cloudflareinsights.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com data:",
  "img-src 'self' data: blob: https:",
  "media-src 'self' blob: data:",
  "connect-src 'self' https://cdn.jsdelivr.net wss:",
  "worker-src 'self' blob: https://cdn.jsdelivr.net",
  "frame-src 'self' https://flipp.com https://*.flipp.com",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
  'report-uri /api/csp-report',
].join('; ')

// THE ENFORCED POLICY (2026-09-22) — everything the report-only one says, except that
// `script-src` also allows INLINE.
//
// The week of facts the report-only header was shipped to collect came back with one
// finding, and it is not ours: the edge injects inline scripts into the marketing page
// (two on one run, none on the next — Cloudflare's RUM beacon and its challenge
// machinery). A strict `script-src 'self'` would therefore break the door
// INTERMITTENTLY, in production, while passing every local test — the worst shape a
// security header can have, and the reason this was never enforced blind.
//
// So the split is deliberate: enforce every directive that had zero violations all week
// (that is eleven of them, including `default-src 'self'`, `object-src 'none'`,
// `base-uri` and `form-action` — the ones that actually stop an injected page from
// phoning home or rewriting its own base), and keep scripts permissive enough for the
// edge. `'unsafe-inline'` is a real concession and it is worth naming what survives it:
// a remote script from an origin nobody allowed still cannot load, which is the vector
// that matters for a stolen-CDN or a compromised-dependency attack.
//
// The REPORT-ONLY header stays, with the STRICT `script-src` — so the evidence keeps
// coming and a future session can tighten it the day the edge stops injecting, with the
// same kind of data this decision was made from rather than a guess.
const ENFORCED_CSP = [
  ...CSP_REPORT_ONLY.split('; ').map((d) =>
    d.startsWith('script-src ') ? `${d} 'unsafe-inline'` : d,
  ),
  "frame-ancestors 'self'",
].join('; ')

export const ENFORCED: ReadonlyArray<readonly [name: string, value: string]> = [
  ['Strict-Transport-Security', 'max-age=31536000; includeSubDomains'],
  ['X-Content-Type-Options', 'nosniff'],
  ['Referrer-Policy', 'strict-origin-when-cross-origin'],
  // The app uses the camera (photos, recipe OCR) and the microphone (voice) ITSELF;
  // nothing it frames needs either, and it never asks where the device is.
  ['Permissions-Policy', 'camera=(self), microphone=(self), geolocation=()'],
  ['Content-Security-Policy', ENFORCED_CSP],
  ['Content-Security-Policy-Report-Only', CSP_REPORT_ONLY],
]

// THE OTHER HALF OF THE SAME GUARANTEE — and it is not optional (verified on production
// 2026-09-17, after the deploy). Cloudflare's assets router serves a request that MATCHES
// A REAL FILE — `/` → index.html, `/index.html`, `/manifest.webmanifest` — **without
// invoking the Worker at all** ("Cloudflare will first attempt to serve static assets if
// one matches the incoming request"). So `withSecurityHeaders` never ran for the
// marketing door: `/board` and `/api/health` answered with all six headers while `/`
// answered with none.
//
// A `_headers` file in the assets directory is the layer that reaches those responses —
// and ONLY those, since Cloudflare documents that _headers rules are not applied to
// Worker-generated responses. The two halves are complementary, which is why this string
// is built from the SAME `ENFORCED` list the wrapper uses: one source, two delivery
// paths. vite.config.ts emits it into dist/ at build time, like sw.js;
// securityHeaders.test.ts pins that the emitted file carries every enforced header.
export function headersFileSource(): string {
  const lines = [
    '# Generated by vite.config.ts from functions/_lib/securityHeaders.ts — do not edit.',
    // Every path. The Worker's own responses ignore this file (Cloudflare applies
    // _headers only to static assets), so the wildcard cannot double-set anything.
    '/*',
    ...ENFORCED.map(([name, value]) => `  ${name}: ${value}`),
    '',
  ]
  return lines.join('\n')
}

export function withSecurityHeaders(res: Response): Response {
  if (res.status === 101) return res
  const headers = new Headers(res.headers)
  for (const [name, value] of ENFORCED) headers.set(name, value)
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers })
}
