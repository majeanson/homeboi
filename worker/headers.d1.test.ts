import { describe, it, expect } from 'vitest'
import { anon, household } from '../functions/test/d1'
import { ENFORCED } from '../functions/_lib/securityHeaders'

// Every response leaves the Worker with the security headers (STATE.md §4-L L6) —
// checked through the real entry, on an API answer, on the SPA shell, and on the
// CSP report door itself.
describe('security headers', () => {
  it('an API answer carries every enforced header', async () => {
    const res = await anon('/api/health')
    expect(res.status).toBe(200)
    for (const [name, value] of ENFORCED) expect(res.headers.get(name), name).toBe(value)
  })

  it('the SPA shell and a client route carry them too', async () => {
    for (const path of ['/', '/board']) {
      const res = await anon(path)
      expect(res.status, path).toBe(200)
      expect(res.headers.get('content-type'), path).toContain('text/html')
      expect(res.headers.get('strict-transport-security'), path).toContain('max-age=')
      // The ENFORCED policy is the whole thing now (2026-09-22), not just
      // `frame-ancestors`. Asserted by the directives that MATTER rather than by the
      // literal string: a byte-for-byte compare here would fail on every future
      // allow-list edit and teach nothing, while these four are the properties the
      // enforcement was for — and `script-src` carrying `'unsafe-inline'` is pinned
      // deliberately, because dropping it is a decision (the edge injects inline
      // scripts into the door), not a tidy-up.
      const csp = res.headers.get('content-security-policy') ?? ''
      expect(csp, path).toContain("default-src 'self'")
      expect(csp, path).toContain("object-src 'none'")
      expect(csp, path).toContain("frame-ancestors 'self'")
      expect(csp, path).toContain("script-src 'self' https://cdn.jsdelivr.net https://static.cloudflareinsights.com 'unsafe-inline'")
      // No report-only twin any more (2026-09-25): its only findings were the edge's own
      // scripts, and it cost two POSTs per visitor. Red against its return.
      expect(res.headers.get('content-security-policy-report-only'), path).toBeNull()
      expect(csp, path).not.toContain('report-uri')
    }
  })

  it('a 401 from an authed route still carries them (the wrapper is outside the boundary)', async () => {
    const res = await anon('/api/board')
    expect(res.status).toBe(401)
    expect(res.headers.get('x-content-type-options')).toBe('nosniff')
  })

  it('the retired CSP report door is not a door any more — no 204, no 500', async () => {
    // The report-only twin and its endpoint went on 2026-09-25 (securityHeaders.ts says
    // why). A browser with a stale tab may still POST here for a while; it must meet a
    // plain refusal, never the old 204 (that would mean the door came back) and never a
    // 500 (that would be a crash on unauthenticated input).
    const report = { 'csp-report': { 'document-uri': 'https://babillard.test/board', 'violated-directive': 'script-src', 'blocked-uri': 'https://evil.test/x.js' } }
    const res = await anon('/api/csp-report', { method: 'POST', headers: { 'content-type': 'application/csp-report' }, body: report })
    expect([403, 404]).toContain(res.status)
  })
})
