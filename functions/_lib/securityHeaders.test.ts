import { describe, it, expect } from 'vitest'
import { CSP_REPORT_ONLY, ENFORCED, headersFileSource, withSecurityHeaders } from './securityHeaders'

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

  it('the _headers file covers the responses the Worker never sees, from the same list', () => {
    // Cloudflare's assets router answers a request matching a real file WITHOUT invoking
    // the Worker, so `/` shipped with none of these while /board had all six (measured
    // on production 2026-09-17). This file is that half — generated, never hand-written.
    const src = headersFileSource()
    const lines = src.split(/\r?\n/)
    expect(lines[1]).toBe('/*')
    for (const [name, value] of ENFORCED) expect(src, name).toContain(`  ${name}: ${value}`)
    // Cloudflare's limits: 100 rules, 2000 characters a line.
    for (const line of lines) expect(line.length, line.slice(0, 40)).toBeLessThan(2000)
  })

  it('the report-only policy names the report door and every host the code loads from', () => {
    expect(CSP_REPORT_ONLY).toContain('report-uri /api/csp-report')
    for (const host of ['https://fonts.googleapis.com', 'https://fonts.gstatic.com', 'https://cdn.jsdelivr.net', 'https://flipp.com', 'https://static.cloudflareinsights.com']) {
      expect(CSP_REPORT_ONLY, host).toContain(host)
    }
    // `frame-ancestors` is IGNORED in a report-only policy — the browser warns about it
    // in every console, which the live walk read on night one. It belongs to the
    // ENFORCED header only, where it is the whole enforced policy for now (the rest
    // stays report-only until a week of reports says it matches the app).
    expect(CSP_REPORT_ONLY).not.toContain('frame-ancestors')
    expect(ENFORCED.find(([n]) => n === 'Content-Security-Policy')?.[1]).toBe("frame-ancestors 'self'")
    // The edge injects Cloudflare's RUM beacon into our HTML; a policy written from our
    // own source alone would have blocked it the day it was enforced.
    expect(CSP_REPORT_ONLY).toContain('https://static.cloudflareinsights.com')
  })
})
