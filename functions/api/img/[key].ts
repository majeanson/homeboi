import type { Env } from '../../_lib/env'
import { notFound } from '../../_lib/json'
import { mediaHeaders } from '../../_lib/r2'
import { resolveActor } from '../../_lib/household'
import { nowSec } from '../../_lib/ids'

// Serve a stored image from R2 by its opaque key.
//
// SCOPED, NOT EXPIRING (review 2026-11-17, P0 #7; Marc's call). The key used to be the
// whole capability: anyone who had ever seen a URL — a sitter whose link was revoked, a
// screenshot, a borrowed phone's history — could load the photo forever. A blob with an
// owner (`media_owners`, 0158) is now served only to:
//   · its own household — an operator's session cookie, or a kiosk's / guest link's token.
//     A plain <img> cannot send the X-Device-Token header, so the client mirrors that
//     token into the `bb_media` cookie, scoped to this path (src/lib/device.ts);
//   · anyone, while it is part of a LIVE share of that household (/partage, its preview
//     card, an import): a share is public by link, and its pictures exactly as long as it;
//   · a household on the same shared trip, for the trip's notes and cover; and a live
//     trip's cover to anyone (the invite preview shows it before joining).
// Anything else is a 404, never a 403: whether a key exists is not the asker's business.
// A key with NO owner (a legacy blob the 0158 backfill could not see) is served as
// before — the price of not breaking old pictures. URLs stay stable, so the offline
// kiosk's cache-first copy (vite.config sw) is untouched; bytes already cached on a
// device stay there — scoping stops the NEXT load, not the last one.
export const onRequestGet: PagesFunction<Env, 'key'> = async (ctx) => {
  if (!ctx.env.PHOTOS) return notFound()
  const key = ctx.params.key
  if (typeof key !== 'string') return notFound()

  if (!(await mayRead(ctx.env, ctx.request, key))) return notFound()

  const obj = await ctx.env.PHOTOS.get(key)
  if (!obj) return notFound()

  // NOT writeHttpMetadata: the stored type is re-checked against the allowlist on every
  // serve, so a blob stored as SVG/HTML before the rule comes out as a download, never
  // as a page on our origin (review 2026-11-17, P0 #1 — `_lib/r2.ts` safeMediaType).
  const headers = mediaHeaders(obj.httpMetadata?.contentType)
  headers.set('etag', obj.httpEtag)
  // `private`: the answer depends on who asks now, so no shared cache may keep it.
  headers.set('cache-control', 'private, max-age=31536000, immutable')
  return new Response(obj.body, { headers })
}

const MEDIA_COOKIE = 'bb_media'

function mediaCookie(request: Request): string | null {
  for (const part of (request.headers.get('Cookie') ?? '').split(';')) {
    const [k, ...v] = part.trim().split('=')
    if (k === MEDIA_COOKIE) return decodeURIComponent(v.join('='))
  }
  return null
}

async function viewer(env: Env, request: Request): Promise<string | null> {
  // The session cookie (an operator), else the mirrored device/guest token — through the
  // SAME resolveActor every endpoint uses, so a revoked link or device reads nothing.
  const direct = await resolveActor(env, request)
  if (direct) return direct.householdId
  const token = mediaCookie(request)
  if (!token) return null
  const headers = new Headers(request.headers)
  headers.set('X-Device-Token', token)
  const viaToken = await resolveActor(env, new Request(request.url, { headers }))
  return viaToken?.householdId ?? null
}

async function mayRead(env: Env, request: Request, key: string): Promise<boolean> {
  const owned = await env.DB.prepare('SELECT household_id FROM media_owners WHERE media_key = ?').bind(key).first<{ household_id: string }>()
  if (!owned) return true // legacy, unowned: served as before (see above)
  const now = nowSec()
  // Public while shared: a live share of the owning household whose snapshot names it.
  const shared = await env.DB.prepare(
    `SELECT 1 AS ok FROM shares WHERE source_household_id = ? AND revoked_at IS NULL
       AND (expires_at IS NULL OR expires_at > ?) AND instr(payload, ?) > 0 LIMIT 1`,
  )
    .bind(owned.household_id, now, key)
    .first()
  if (shared) return true
  // A live shared trip's cover: its invite preview shows it to someone not yet on it.
  const cover = await env.DB.prepare('SELECT 1 AS ok FROM shared_trips WHERE media_key = ? AND deleted_at IS NULL LIMIT 1').bind(key).first()
  if (cover) return true
  const who = await viewer(env, request)
  if (!who) return false
  if (who === owned.household_id) return true
  // A co-traveller: the key is on a live shared trip this household is on.
  const trip = await env.DB.prepare(
    `SELECT 1 AS ok FROM shared_trip_notes n
       JOIN shared_trip_members m ON m.shared_trip_id = n.shared_trip_id
      WHERE (n.media_key = ?1 OR n.scene_key = ?1) AND n.deleted_at IS NULL
        AND m.household_id = ?2 AND m.revoked_at IS NULL
      LIMIT 1`,
  )
    .bind(key, who)
    .first()
  return trip != null
}
