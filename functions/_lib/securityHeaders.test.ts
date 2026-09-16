import { describe, it, expect } from 'vitest'
import { CSP_REPORT_ONLY, ENFORCED, withSecurityHeaders } from './securityHeaders'

describe('security headers', () => {
  it('sets every enforced header on a JSON response and keeps the body + status', async () => {
    const res = withSecurityHeaders(new Response('{"ok":true}', { status: 201, headers: { 'content-type': 'application/json' } }))
    expect(res.status).toBe(201)
    expect(await res.text()).toBe('{"ok":true}')
    expect(res.headers.get('content-type')).toBe('application/json')
    for (const [name, value] of ENFORCED) expect(res.headers.get(name), name).toBe(value)
  })

  it('keeps a redirect a redirect (the http→https bounce, /tv/<code>)', () => {
    const res = withSecurityHeaders(Response.redirect('https://x.test/board', 301))
    expect(res.status).toBe(301)
    expect(res.headers.get('location')).toBe('https://x.test/board')
    expect(res.headers.get('strict-transport-security')).toContain('max-age=')
  })

  it('leaves a WebSocket upgrade (101) untouched — it cannot be re-wrapped', () => {
    const upgrade = { status: 101, headers: new Headers() } as unknown as Response
    expect(withSecurityHeaders(upgrade)).toBe(upgrade)
  })

  it('the report-only policy names the report door and every host the code loads from', () => {
    expect(CSP_REPORT_ONLY).toContain('report-uri /api/csp-report')
    for (const host of ['https://fonts.googleapis.com', 'https://fonts.gstatic.com', 'https://cdn.jsdelivr.net', 'https://flipp.com']) {
      expect(CSP_REPORT_ONLY, host).toContain(host)
    }
    expect(CSP_REPORT_ONLY).toContain("frame-ancestors 'self'")
    // The ENFORCED CSP is frame-ancestors ONLY — the rest stays report-only until a
    // week of reports says the policy above matches the app.
    expect(ENFORCED.find(([n]) => n === 'Content-Security-Policy')?.[1]).toBe("frame-ancestors 'self'")
  })
})
