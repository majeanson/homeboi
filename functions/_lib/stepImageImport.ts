import type { Env } from './env'
import { putR2Blob } from './r2'
import { charge } from './usage'
import { fetchPublic } from './publicUrl'

// STEP PHOTOS FROM THE SITE (C3, 2026-10-27). A WP Recipe Maker recipe (and others)
// ships a photo per step in its JSON-LD (`HowToStep.image`). A recipe's step photos are
// R2 keys (`steps_images_json`, migration 0041 — « a step photo is always an upload »),
// so an imported one is fetched ONCE and kept, like the cook's own: the recipe then never
// depends on the site staying up, and cook mode shows the same picture offline.
//
// Bounded on every axis: https only, a raster `image/*` answer (no SVG), at most 3 MB each (a Worker
// cannot resize without a library — a bigger one is skipped, not shrunk), at most 20 per
// recipe, 8 s each, and every byte charged to the household's daily upload budget
// (_lib/usage) BEFORE it is stored — over budget, the import stops there and keeps what
// already landed. R2 unbound → nothing is fetched. Returns keys aligned to `urls` ('' for
// a step without a photo, or whose photo did not come).
//
// Orphans: a key stored here belongs to no recipe until the form is saved. The form frees
// what it holds on cancel (RecipeForm → recipe-step-image DELETE); a save keeps them.

const MAX_EACH = 3 * 1024 * 1024
const MAX_COUNT = 20
// Raster only: an `image/svg+xml` kept here is served same-origin by /api/img and can carry
// script. Anything else is skipped like a photo that did not come.
const RASTER = /^image[/](jpeg|png|webp|gif)$/i

export async function importStepImages(env: Env, urls: (string | null)[], opts: { maxEach?: number; max?: number } = {}): Promise<string[]> {
  const keys = urls.map(() => '')
  if (!env.PHOTOS) return keys
  const maxEach = opts.maxEach ?? MAX_EACH
  let left = opts.max ?? MAX_COUNT
  for (let i = 0; i < urls.length && left > 0; i++) {
    const u = urls[i]
    if (!u || !/^https:\/\//i.test(u)) continue
    left--
    try {
      const res = await fetchPublic(u, { signal: AbortSignal.timeout(8_000) })
      const type = (res.headers.get('content-type') ?? '').split(';')[0].trim()
      if (!res.ok || !RASTER.test(type)) continue
      const declared = Number(res.headers.get('content-length') ?? 0)
      if (declared > maxEach) continue
      const buf = await res.arrayBuffer()
      if (!buf.byteLength || buf.byteLength > maxEach) continue
      const verdict = await charge(env, 'upload', buf.byteLength)
      if (!verdict.allowed) break
      keys[i] = await putR2Blob(env.PHOTOS, buf, type, 'rsi')
    } catch {
      /* a photo that does not come is a step without a photo — never a failed import */
    }
  }
  return keys
}
