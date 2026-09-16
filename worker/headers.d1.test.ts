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
      expect(res.headers.get('content-security-policy'), path).toBe("frame-ancestors 'self'")
      expect(res.headers.get('content-security-policy-report-only'), path).toContain('report-uri /api/csp-report')
    }
  })

  it('a 401 from an authed route still carries them (the wrapper is outside the boundary)', async () => {
    const res = await anon('/api/board')
    expect(res.status).toBe(401)
    expect(res.headers.get('x-content-type-options')).toBe('nosniff')
  })

  it('the CSP report door takes the browser’s POST with no CSRF header, from anyone, and answers 204', async () => {
    const report = { 'csp-report': { 'document-uri': 'https://babillard.test/board', 'violated-directive': 'script-src', 'blocked-uri': 'https://evil.test/x.js' } }
    const res = await anon('/api/csp-report', { method: 'POST', headers: { 'content-type': 'application/csp-report' }, body: report })
    expect(res.status).toBe(204)
    // …and a signed-in operator's browser too, still without the CSRF echo.
    const a = await household('csp')
    const res2 = await anon('/api/csp-report', { method: 'POST', body: report, headers: { Cookie: a.cookie } })
    expect(res2.status).toBe(204)
    // Garbage is swallowed, never a 500.
    const res3 = await anon('/api/csp-report', { method: 'POST', headers: { 'content-type': 'text/plain' }, body: 'not json' })
    expect(res3.status).toBe(204)
  })
})
