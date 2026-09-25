import { describe, it, expect } from 'vitest'
import { ENFORCED_CSP, ENFORCED, headersFileSource, withSecurityHeaders } from './securityHeaders'

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

  it('the enforced policy names every host the code loads from, frames nothing foreign, and concedes inline scripts to the edge only', () => {
    for (const host of ['https://fonts.googleapis.com', 'https://fonts.gstatic.com', 'https://cdn.jsdelivr.net', 'https://flipp.com', 'https://static.cloudflareinsights.com']) {
      expect(ENFORCED_CSP, host).toContain(host)
    }
    const enforced = ENFORCED.find(([n]) => n === 'Content-Security-Policy')?.[1] ?? ''
    expect(enforced).toBe(ENFORCED_CSP)
    expect(enforced).toContain("default-src 'self'")
    expect(enforced).toContain("object-src 'none'")
    expect(enforced).toContain("frame-ancestors 'self'")
    // The ONE deliberate concession: the edge injects inline scripts into the door, so a
    // strict script-src would break it intermittently in production while passing every
    // test here. A remote script from an origin nobody allowed still cannot load.
    expect(enforced).toContain("script-src 'self' https://cdn.jsdelivr.net https://static.cloudflareinsights.com 'unsafe-inline'")
    // No report-only twin and no report door since 2026-09-25 (securityHeaders.ts says why):
    // red against re-adding either — a twin is two POSTs per visitor for an answer we have.
    expect(ENFORCED.some(([n]) => n === 'Content-Security-Policy-Report-Only')).toBe(false)
    expect(enforced).not.toContain('report-uri')
  })
})
