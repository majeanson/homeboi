import type { Env } from '../_lib/env'
import { clientIp, overLimit } from '../_lib/rateLimit'

// POST /api/csp-report — where the browser sends Content-Security-Policy-Report-Only
// violations (functions/_lib/securityHeaders.ts, STATE.md §4-L L6).
//
// Unauthenticated BY DESIGN (a guest's or a stranger's browser reports too), CSRF-exempt
// (the browser sends it with no header of ours), rate-limited per address (L2's flood
// bound), body capped, and it answers 204 whatever it gets. It only LOGS — the point is
// that observability keeps what the real app trips over, so the enforced policy is
// written from a week of facts. Nothing about a household is in a report: the
// violated directive, the blocked host and the page's own path.
const MAX_BYTES = 8 * 1024

export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  if (await overLimit(ctx.env, 'ip', clientIp(ctx.request))) return new Response(null, { status: 204 })
  let text = ''
  try {
    text = (await ctx.request.text()).slice(0, MAX_BYTES)
  } catch {
    return new Response(null, { status: 204 })
  }
  try {
    const parsed = JSON.parse(text) as { 'csp-report'?: Record<string, unknown> } | Array<{ body?: Record<string, unknown> }>
    // Two wire shapes: the legacy `report-uri` envelope, and the Reporting API array.
    const reports = Array.isArray(parsed) ? parsed.map((r) => r.body ?? {}) : [parsed['csp-report'] ?? {}]
    for (const r of reports) {
      const pick = (...keys: string[]) => keys.map((k) => r[k]).find((v) => typeof v === 'string') as string | undefined
      console.warn(
        '[csp]',
        JSON.stringify({
          directive: pick('effective-directive', 'effectiveDirective', 'violated-directive'),
          blocked: pick('blocked-uri', 'blockedURL'),
          page: pick('document-uri', 'documentURL'),
          sample: pick('script-sample', 'sample')?.slice(0, 80),
        }),
      )
    }
  } catch {
    console.warn('[csp] unparseable report', text.slice(0, 200))
  }
  return new Response(null, { status: 204 })
}
