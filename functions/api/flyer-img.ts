import type { Env } from '../_lib/env'
import { badRequest, notFound, serviceUnavailable } from '../_lib/json'

// Same-origin proxy for Flipp flyer clipping images. The clippings live on
// f.wishabi.net (cross-origin), which the service worker never caches — so a flyer
// reopened on poor signal (or after a manual "download for offline") would lose
// half its pictures. Routing them through /api/flyer-img makes them same-origin,
// so the SW caches them cache-first (vite.config sw) and they survive offline.
//
// Unauthenticated BY DESIGN, like img/[key]: a plain <img> (incl. on a token-only
// kiosk, which can't send the device-token header) must load it. It is NOT an open
// proxy — the only thing it can reach is an allowlisted public Flipp image host,
// and it only returns image content. Bytes are immutable, so we cache hard at the
// edge (caches.default) + browser, sparing repeat fetches.
const ALLOW = new Set(['f.wishabi.net', 'images.wishabi.net'])

export const onRequestGet: PagesFunction<Env> = async (ctx) => {
  const url = new URL(ctx.request.url)
  const src = url.searchParams.get('u')
  if (!src) return badRequest('Image requise.')

  let target: URL
  try {
    target = new URL(src)
  } catch {
    return badRequest('URL invalide.')
  }
  // Flipp serves clippings over http://; upgrade so an https app keeps them.
  if (target.protocol === 'http:') target.protocol = 'https:'
  if (target.protocol !== 'https:' || !ALLOW.has(target.hostname)) return notFound()

  // Edge cache keyed by the normalized target, so a second household device (or a
  // re-download) skips the upstream fetch entirely.
  const cache = (caches as unknown as { default: Cache }).default
  const cacheKey = new Request(target.toString())
  const hit = await cache.match(cacheKey)
  if (hit) return hit

  let res: Response
  try {
    res = await fetch(target.toString(), { headers: { accept: 'image/*' } })
  } catch {
    return serviceUnavailable('Image indisponible.')
  }
  if (!res.ok) return notFound()
  const ct = res.headers.get('content-type') ?? 'image/jpeg'
  if (!ct.startsWith('image/')) return notFound()

  const headers = new Headers()
  headers.set('content-type', ct)
  headers.set('cache-control', 'public, max-age=31536000, immutable')
  const out = new Response(res.body, { headers })
  ctx.waitUntil(cache.put(cacheKey, out.clone()))
  return out
}
