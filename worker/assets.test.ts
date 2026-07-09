import { describe, it, expect } from 'vitest'
import worker from './index'

// A hashed chunk under /assets/ must never answer with the SPA shell.
//
// wrangler.toml sets not_found_handling = "single-page-application", so the ASSETS
// binding answers a MISSING file with index.html + 200. That is right for a client
// route (/board, /kitchen…) and catastrophic for /assets/index-<hash>.js: a stale
// shell (an old build's HTML, or a kiosk that skipped a deploy) asks for a chunk
// that no longer exists, gets 200 text/html, and both the browser and our
// cache-first service-worker asset handler store HTML under a .js URL. The entry
// module then parses as HTML, React never mounts, and the PWA boots to a blank grey
// page on every reload — permanently, because the SW serves that cache entry first.
//
// A missing chunk must fail as a missing chunk. Keep this green.

/** The ASSETS binding as Cloudflare implements it with SPA fallback. */
function assetsStub(files: Record<string, { body: string; type: string }>) {
  return {
    fetch: async (request: Request) => {
      const path = new URL(request.url).pathname
      const hit = files[path]
      if (hit) return new Response(hit.body, { status: 200, headers: { 'content-type': hit.type } })
      // not_found_handling = "single-page-application"
      return new Response(files['/index.html'].body, {
        status: 200,
        headers: { 'content-type': 'text/html' },
      })
    },
  }
}

const SHELL = '<!doctype html><html lang="fr"><head></head><body><div id="root"></div></body></html>'

const env = {
  ENVIRONMENT: 'development', // skip the https bounce
  ASSETS: assetsStub({
    '/index.html': { body: SHELL, type: 'text/html' },
    '/assets/index-LIVE.js': { body: 'export const live = 1', type: 'text/javascript' },
  }),
} as never

const ctx = { waitUntil: () => {}, passThroughOnException: () => {} } as never

const get = (path: string) =>
  worker.fetch(new Request(`http://localhost${path}`) as never, env, ctx)

describe('static asset serving', () => {
  it('serves a hashed chunk that exists', async () => {
    const res = await get('/assets/index-LIVE.js')
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('javascript')
    expect(await res.text()).toContain('export const live')
  })

  it('404s a hashed chunk from a previous build instead of serving the SPA shell', async () => {
    const res = await get('/assets/index-STALEHASH.js')
    expect(res.status, 'a deleted chunk must 404, not fall back to index.html').toBe(404)
    expect(res.headers.get('content-type') ?? '').not.toContain('text/html')
    expect(await res.text()).not.toContain('<!doctype html')
  })

  it('404s a stale hashed stylesheet too', async () => {
    const res = await get('/assets/index-STALEHASH.css')
    expect(res.status).toBe(404)
    expect(await res.text()).not.toContain('<!doctype html')
  })

  it('still falls back to the SPA shell for a client route', async () => {
    const res = await get('/board')
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('text/html')
    expect(await res.text()).toContain('id="root"')
  })
})
