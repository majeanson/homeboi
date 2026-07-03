import { ok, badRequest, forbidden, readJson } from '../../_lib/json'
import { authed } from '../../_lib/route'
import { newId, nowSec } from '../../_lib/ids'
import { isValidR2Key } from '../../_lib/validate'
import { ownedStagedKeys } from '../../_lib/stagedMedia'

// Cap pending quarantine rows per household — a stateless, broadly-shareable link has
// no early revoke, so this bounds row/R2 flooding from a leaked link. Well above any
// honest use; drains as the operator reviews.
const MAX_PENDING = 200

// The ONE message a 'postbox' link writes — « La boîte aux lettres » (#postbox,
// migration 0085). A relative names themselves and leaves a word / voice clip /
// drawing / photo. It's QUARANTINED as a `pending` row the operator later turns into
// a board fridge note (functions/api/postbox.ts). Gated like intake: guestScope.ts
// pins a postbox token to this path (+ the media-stage path) and route.ts lets only a
// postbox/intake guest past the read-only guard. The household comes from the SIGNED
// token, never the client body, so a message can only ever land in the household that
// issued its link. The explicit kind check below is defence-in-depth.

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
  let mediaKey = kind && isValidR2Key(body?.media_key?.trim()) ? body!.media_key!.trim() : null
  let sceneKey = kind === 'drawing' && isValidR2Key(body?.scene_key?.trim()) ? body!.scene_key!.trim() : null

  // Ownership: a submitted key must be one THIS guest actually staged (guest/postbox-
  // media), not an arbitrary/guessed R2 path. Drop anything unowned — the whole
  // attachment if the media blob itself isn't ours (a scene without its drawing is
  // meaningless), or just the scene if only it is unowned.
  if (mediaKey || sceneKey) {
    const owned = await ownedStagedKeys(
      ctx.env.DB,
      actor.householdId,
      'postbox',
      actor.guestId ?? '',
      [mediaKey, sceneKey].filter((k): k is string => !!k),
    )
    if (mediaKey && !owned.has(mediaKey)) {
      mediaKey = null
      sceneKey = null
    } else if (sceneKey && !owned.has(sceneKey)) {
      sceneKey = null
    }
  }
  // The attachment only counts if its media blob survived the ownership check.
  const effKind = mediaKey ? kind : null

  // Self-identify is required (the operator chose an open link many relatives share).
  if (!senderName) return badRequest('Ton nom est requis.')
  if (!text && !(effKind && mediaKey)) return badRequest('Message vide.')

  const pending = await ctx.env.DB.prepare(
    "SELECT COUNT(*) AS n FROM postbox_submissions WHERE household_id = ? AND status = 'pending'",
  )
    .bind(actor.householdId)
    .first<{ n: number }>()
  if ((pending?.n ?? 0) >= MAX_PENDING) {
    return forbidden('Trop de messages en attente. Réessaie plus tard.')
  }

  await ctx.env.DB.prepare(
    'INSERT INTO postbox_submissions (id, household_id, guest_id, sender_name, text, media_kind, media_key, scene_key, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  )
    .bind(
      newId(),
      actor.householdId,
      actor.guestId ?? '',
      senderName,
      text,
      effKind,
      effKind ? mediaKey : null,
      effKind === 'drawing' ? sceneKey : null,
      'pending',
      nowSec(),
    )
    .run()

  return ok({ ok: true })
})
