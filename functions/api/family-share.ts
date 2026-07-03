import { ok, badRequest, notFound, readJson } from '../_lib/json'
import { authed } from '../_lib/route'
import { clampSnapshotTtl } from '../_lib/shareSnapshots'
import { countLiveShares, insertShare, listLiveShares, readLiveShare, revokeShareById, MAX_SHARES } from '../_lib/shareStore'
import { materializeFamilyShare } from '../_lib/familyShare'
import type { IntakeSubmission } from '../_lib/intake'

// « Partager une famille » (migration 0100 → generalized onto `shares`, migration 0102).
// This route is now a THIN ADAPTER over the generic snapshot rail (_lib/shareStore +
// _lib/familyShare) that keeps the cercle UI's wire shapes BYTE-IDENTICAL: FamilyShareModal
// (POST → { id, url, sharedPeople, totalPeople }; GET → { shares }) and FamilyImportPage
// (GET ?s= → { label, payload, sourceName }) don't change. The share id + its
// /cercle/import?s=<id> URL are unchanged too, so links already texted to a friend live on.
//
// A family isn't a stored row — it's a subgraph the sender's client materializes into an
// IntakeSubmission snapshot (see _lib/familyShare.ts, which keeps the owned-photo guard).
// A one-time COPY, merged client-side via /api/cercle*. (New kinds — recipe/event/routine
// — go through /api/share and its public /partage page instead.)

export const onRequestPost = authed(async (ctx, actor) => {
  const body = await readJson<{ label?: string; payload?: unknown }>(ctx.request)
  const hh = actor.householdId
  if ((await countLiveShares(ctx.env, hh)) >= MAX_SHARES) return badRequest('Trop de familles partagées. Retires-en une d’abord.')
  const snap = await materializeFamilyShare(ctx.env, hh, body?.payload)
  if (!snap) return badRequest('Famille vide (au moins une personne avec un prénom).')
  const label = typeof body?.label === 'string' ? body.label : ''
  const { id } = await insertShare(ctx.env, hh, 'family', label, snap.payloadJson, clampSnapshotTtl('family', null))
  const origin = new URL(ctx.request.url).origin
  return ok({ id, url: `${origin}/cercle/import?s=${id}`, sharedPeople: snap.sharedPeople, totalPeople: snap.totalPeople })
}, 'operator')

// GET ?s=<id> → the snapshot for the recipient to preview + merge (any account: the id is
// the capability). GET with no id → the sender's own live family shares (manage list).
export const onRequestGet = authed(async (ctx, actor) => {
  const id = new URL(ctx.request.url).searchParams.get('s')
  if (id) {
    const share = await readLiveShare(ctx.env, id)
    if (!share || share.kind !== 'family') return notFound('Ce partage n’existe plus.')
    let payload: IntakeSubmission | null = null
    try {
      payload = JSON.parse(share.payload) as IntakeSubmission
    } catch {
      payload = null
    }
    if (!payload) return notFound('Ce partage n’existe plus.')
    return ok({ label: share.label, payload, sourceName: share.sourceName })
  }
  const shares = await listLiveShares(ctx.env, actor.householdId, ['family'])
  return ok({ shares: shares.map((s) => ({ id: s.id, label: s.label, createdAt: s.createdAt, expiresAt: s.expiresAt })) })
})

export const onRequestDelete = authed(async (ctx, actor) => {
  const body = await readJson<{ id?: string }>(ctx.request)
  if (!body?.id) return badRequest('id requis.')
  const done = await revokeShareById(ctx.env, actor.householdId, body.id)
  if (!done) return notFound('Partage introuvable.')
  return ok({ ok: true })
}, 'operator')
