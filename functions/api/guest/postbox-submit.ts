import { ok, badRequest, forbidden, readJson } from '../../_lib/json'
import { authed } from '../../_lib/route'
import { newId, nowSec } from '../../_lib/ids'

// The ONE message a 'postbox' link writes — « La boîte aux lettres » (#postbox,
// migration 0085). A relative names themselves and leaves a word / voice clip /
// drawing / photo. It's QUARANTINED as a `pending` row the operator later turns into
// a board fridge note (functions/api/postbox.ts). Gated like intake: guestScope.ts
// pins a postbox token to this path (+ the media-stage path) and route.ts lets only a
// postbox/intake guest past the read-only guard. The household comes from the SIGNED
// token, never the client body, so a message can only ever land in the household that
// issued its link. The explicit kind check below is defence-in-depth.
const keyish = (v: unknown): v is string => typeof v === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(v.trim())

export const onRequestPost = authed(async (ctx, actor) => {
  if (!(actor.scope === 'guest' && actor.guestKind === 'postbox')) {
    return forbidden('Ce lien ne permet pas d’envoyer un message.')
  }

  const body = await readJson<{
    senderName?: string
    text?: string
    media_kind?: string
    media_key?: string
    scene_key?: string
  }>(ctx.request)

  const senderName = (body?.senderName ?? '').trim().slice(0, 80)
  const text = (body?.text ?? '').trim().slice(0, 280)
  // A message is a written word and/or one media memo: audio (#38), drawing (#14),
  // or a photo (#13 — 'image'). The sender's scene picks which.
  const kind =
    body?.media_kind === 'audio' || body?.media_kind === 'drawing' || body?.media_kind === 'image'
      ? body.media_kind
      : null
  const mediaKey = kind && keyish(body?.media_key) ? body!.media_key!.trim() : null
  const sceneKey = kind === 'drawing' && keyish(body?.scene_key) ? body!.scene_key!.trim() : null

  // Self-identify is required (the operator chose an open link many relatives share).
  if (!senderName) return badRequest('Ton nom est requis.')
  if (!text && !(kind && mediaKey)) return badRequest('Message vide.')

  await ctx.env.DB.prepare(
    'INSERT INTO postbox_submissions (id, household_id, guest_id, sender_name, text, media_kind, media_key, scene_key, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  )
    .bind(
      newId(),
      actor.householdId,
      actor.guestId ?? '',
      senderName,
      text,
      kind,
      kind ? mediaKey : null,
      kind === 'drawing' ? sceneKey : null,
      'pending',
      nowSec(),
    )
    .run()

  return ok({ ok: true })
})
