import type { Env } from '../../_lib/env'
import { notFound } from '../../_lib/json'
import { mediaHeaders } from '../../_lib/r2'

// Serve a stored image from R2 by its opaque key. Unauthenticated BY DESIGN: the
// key is a random, unguessable capability id (newId, ~71 bits), so a plain <img>
// on the kiosk works without the device-token header, and keys are never listed
// publicly. Bytes for a key never change, so we cache hard — this also spares R2
// reads, keeping the wall board inside the free tier. 404 when R2 is unbound or
// the key is unknown.
export const onRequestGet: PagesFunction<Env, 'key'> = async (ctx) => {
  if (!ctx.env.PHOTOS) return notFound()
  const key = ctx.params.key
  if (typeof key !== 'string') return notFound()

  const obj = await ctx.env.PHOTOS.get(key)
  if (!obj) return notFound()

  // NOT writeHttpMetadata: the stored type is re-checked against the allowlist on every
  // serve, so a blob stored as SVG/HTML before the rule comes out as a download, never
  // as a page on our origin (review 2026-11-17, P0 #1 — `_lib/r2.ts` safeMediaType).
  const headers = mediaHeaders(obj.httpMetadata?.contentType)
  headers.set('etag', obj.httpEtag)
  headers.set('cache-control', 'public, max-age=31536000, immutable')
  return new Response(obj.body, { headers })
}
