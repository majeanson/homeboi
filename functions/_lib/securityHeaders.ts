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

export const ENFORCED: ReadonlyArray<readonly [name: string, value: string]> = [
  ['Strict-Transport-Security', 'max-age=31536000; includeSubDomains'],
  ['X-Content-Type-Options', 'nosniff'],
  ['Referrer-Policy', 'strict-origin-when-cross-origin'],
  // The app uses the camera (photos, recipe OCR) and the microphone (voice) ITSELF;
  // nothing it frames needs either, and it never asks where the device is.
  ['Permissions-Policy', 'camera=(self), microphone=(self), geolocation=()'],
  ['Content-Security-Policy', "frame-ancestors 'self'"],
  ['Content-Security-Policy-Report-Only', CSP_REPORT_ONLY],
]

export function withSecurityHeaders(res: Response): Response {
  if (res.status === 101) return res
  const headers = new Headers(res.headers)
  for (const [name, value] of ENFORCED) headers.set(name, value)
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers })
}
