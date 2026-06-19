import { badRequest, notFound, ok, serviceUnavailable } from '../../_lib/json'
import { authed } from '../../_lib/route'
import { newId } from '../../_lib/ids'
import { deleteR2Blob } from '../../_lib/r2'

// Set a member's avatar to a PHOTO (operator). Raw image body, member id in the
// query: POST /api/members/avatar?id=<memberId>. Stores the resized image in R2
// and points the member at it (avatar_kind='photo', avatar_ref=key) while the
// member keeps its `colour` for board tinting. Replaces any prior photo blob so
// orphans don't pile up. Reverting to a colour avatar is members PATCH
// { clearPhoto: true }.
const MAX_BYTES = 1 * 1024 * 1024 // avatars are tiny after the 256px client resize

export const onRequestPost = authed(async (ctx, actor) => {
  if (!ctx.env.PHOTOS) return serviceUnavailable('Stockage photo indisponible ici.')
  const id = new URL(ctx.request.url).searchParams.get('id')
  if (!id) return badRequest('id requis.')
  const type = ctx.request.headers.get('content-type') ?? ''
  if (!type.startsWith('image/')) return badRequest('Image requise.')

  const member = await ctx.env.DB.prepare(
    'SELECT avatar_kind, avatar_ref FROM members WHERE id = ? AND household_id = ?',
  )
    .bind(id, actor.householdId)
    .first<{ avatar_kind: string; avatar_ref: string }>()
  if (!member) return notFound('Membre introuvable.')

  const buf = await ctx.request.arrayBuffer()
  if (buf.byteLength === 0 || buf.byteLength > MAX_BYTES) return badRequest('Image vide ou trop grande.')

  // Flat, URL-safe key (single path segment so /api/img/[key] serves it).
  const key = `av_${newId()}`
  await ctx.env.PHOTOS.put(key, buf, { httpMetadata: { contentType: type } })
  if (member.avatar_kind === 'photo') await deleteR2Blob(ctx.env.PHOTOS, member.avatar_ref)
  await ctx.env.DB.prepare("UPDATE members SET avatar_kind = 'photo', avatar_ref = ? WHERE id = ? AND household_id = ?")
    .bind(key, id, actor.householdId)
    .run()
  return ok({ key })
}, 'operator')
