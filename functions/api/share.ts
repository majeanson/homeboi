import { ok, badRequest, notFound, readJson, parseJsonArray } from '../_lib/json'
import { authed } from '../_lib/route'
import { copyR2Blob } from '../_lib/r2'
import {
  isShareKind,
  clampSnapshotTtl,
  buildRecipeSnapshot,
  buildEventSnapshot,
  buildRoutineSnapshot,
  snapshotBlobKeys,
  remapSnapshotBlobKeys,
  type ShareKind,
} from '../_lib/shareSnapshots'
import { countLiveShares, insertShare, listLiveShares, readLiveShare, revokeShareById, MAX_SHARES } from '../_lib/shareStore'
import { materializeFamilyShare } from '../_lib/familyShare'

// « Partager » — the ONE generic snapshot-share endpoint (migration 0102). Hand any
// shareable thing (a recipe, a rendez-vous, a kid routine, a family) to a friend as a
// /partage/<id> link that opens a public read-only page. A one-time COPY, never a live
// link (that's « Voyage partagé »).
//
//   POST  { kind, ... }  → { id, url, expiresAt } (+ sharedPeople/totalPeople for family)  (operator)
//   GET                  → the sender's « Mes partages » ledger { shares:[...] } + expiry sweep
//   GET   ?s=<id>        → { kind, label, payload, sourceName } for a signed-in importer
//   DELETE { id }        → revoke early (frees the share-owned media copies)               (operator)
//
// Content kinds (recipe/event/routine) are snapshotted SERVER-SIDE from the sender's own
// household-scoped row, so the client never names an R2 key — no anti-exfiltration
// surface. Family keeps its client-materialized payload + ownership guard (a family isn't
// a row; see _lib/familyShare.ts). Media inside a payload is copied into share-owned `sh`
// blobs so the snapshot survives the source being edited/deleted; freed on revoke/expire.

interface ShareBody {
  kind?: string
  label?: string
  recipeId?: string
  eventId?: string
  routineId?: string
  payload?: unknown // family only (client-materialized)
}

const isStr = (v: unknown): v is string => typeof v === 'string'

// Copy every share-owned media key in a freshly-built payload into an `sh_` blob, then
// rewrite the payload to point at the copies. R2 unset → drop the owned keys (text
// degrade), https images pass through untouched. Family does its own copy (fs_) upstream.
async function copySnapshotMedia<T>(env: { PHOTOS?: R2Bucket }, kind: ShareKind, payload: T): Promise<T> {
  if (!env.PHOTOS) return remapSnapshotBlobKeys(kind, payload, () => null)
  const map = new Map<string, string | null>()
  for (const k of snapshotBlobKeys(kind, payload)) map.set(k, await copyR2Blob(env.PHOTOS, k, 'sh'))
  return remapSnapshotBlobKeys(kind, payload, (k) => map.get(k) ?? null)
}

// Build the stored payload + a sensible default label for a content share, reading the
// sender's own row. Returns null (→ 404) when the row isn't theirs. `label` falls back to
// the entity's own title/name so « Mes partages » reads without the sender re-typing it.
async function buildContentShare(
  env: { DB: D1Database; PHOTOS?: R2Bucket },
  hh: string,
  kind: 'recipe' | 'event' | 'routine',
  body: ShareBody,
): Promise<{ payloadJson: string; label: string } | null> {
  if (kind === 'recipe') {
    if (!isStr(body.recipeId)) return null
    const r = await env.DB.prepare(
      'SELECT title, ingredients_json, steps_json, servings, servings_unit, prep_min, cook_min, total_min, notes, source, image, tags_json, steps_images_json, lang FROM recipes WHERE id = ? AND household_id = ?',
    )
      .bind(body.recipeId, hh)
      .first<{
        title: string; ingredients_json: string; steps_json: string; servings: number | null; servings_unit: string | null
        prep_min: number | null; cook_min: number | null; total_min: number | null; notes: string | null
        source: string | null; image: string | null; tags_json: string; steps_images_json: string | null; lang: string | null
      }>()
    if (!r) return null
    const built = buildRecipeSnapshot({
      title: r.title,
      ingredients: parseJsonArray<string>(r.ingredients_json, isStr),
      steps: parseJsonArray<string>(r.steps_json, isStr),
      servings: r.servings,
      servingsUnit: r.servings_unit,
      prepMin: r.prep_min,
      cookMin: r.cook_min,
      totalMin: r.total_min,
      notes: r.notes,
      source: r.source,
      image: r.image,
      stepImages: parseJsonArray<string>(r.steps_images_json, isStr),
      tags: parseJsonArray<string>(r.tags_json, isStr),
      lang: r.lang,
    })
    const copied = await copySnapshotMedia(env, 'recipe', built)
    return { payloadJson: JSON.stringify(copied), label: built.title }
  }

  if (kind === 'event') {
    if (!isStr(body.eventId)) return null
    const e = await env.DB.prepare(
      `SELECT e.title, e.start_at, e.all_day,
              (SELECT name FROM businesses WHERE businesses.id = e.business_id) AS business_name,
              (SELECT first_name FROM contacts WHERE contacts.id = e.contact_id) AS contact_name,
              (SELECT display_name FROM members WHERE members.id = e.member_id) AS member_name
         FROM events e WHERE e.id = ? AND e.household_id = ?`,
    )
      .bind(body.eventId, hh)
      .first<{ title: string; start_at: number; all_day: number; business_name: string | null; contact_name: string | null; member_name: string | null }>()
    if (!e) return null
    const built = buildEventSnapshot({
      title: e.title,
      startAt: e.start_at,
      allDay: e.all_day,
      // Display name only — never the underlying member/contact/business id.
      whoLabel: e.business_name ?? e.contact_name ?? e.member_name ?? null,
    })
    return { payloadJson: JSON.stringify(built), label: built.title }
  }

  // routine
  if (!isStr(body.routineId)) return null
  const rt = await env.DB.prepare(
    'SELECT name, time_of_day, cards_json, cards_photo_json FROM routines WHERE id = ? AND household_id = ?',
  )
    .bind(body.routineId, hh)
    .first<{ name: string; time_of_day: string | null; cards_json: string; cards_photo_json: string | null }>()
  if (!rt) return null
  const built = buildRoutineSnapshot({
    name: rt.name,
    timeOfDay: rt.time_of_day,
    cards: parseJsonArray<unknown>(rt.cards_json),
    cardsPhoto: parseJsonArray<string>(rt.cards_photo_json, isStr),
    // Narration clips deliberately not read — a parent's voice isn't shared (v1).
  })
  const copied = await copySnapshotMedia(env, 'routine', built)
  return { payloadJson: JSON.stringify(copied), label: built.name }
}

export const onRequestPost = authed(async (ctx, actor) => {
  const body = await readJson<ShareBody>(ctx.request)
  const kind = body?.kind
  if (!isShareKind(kind)) return badRequest('kind invalide.')
  const hh = actor.householdId

  if ((await countLiveShares(ctx.env, hh)) >= MAX_SHARES) {
    return badRequest('Trop de partages actifs. Retires-en un d’abord.')
  }
  const origin = new URL(ctx.request.url).origin

  if (kind === 'family') {
    const snap = await materializeFamilyShare(ctx.env, hh, body?.payload)
    if (!snap) return badRequest('Famille vide (au moins une personne avec un prénom).')
    const label = isStr(body?.label) ? body.label : ''
    const { id, expiresAt } = await insertShare(ctx.env, hh, 'family', label, snap.payloadJson, clampSnapshotTtl('family', null))
    return ok({ id, url: `${origin}/partage/${id}`, expiresAt, sharedPeople: snap.sharedPeople, totalPeople: snap.totalPeople })
  }

  const built = await buildContentShare(ctx.env, hh, kind, body!)
  if (!built) return notFound('Introuvable.')
  const label = isStr(body?.label) && body.label.trim() ? body.label : built.label
  const { id, expiresAt } = await insertShare(ctx.env, hh, kind, label, built.payloadJson, clampSnapshotTtl(kind, null))
  return ok({ id, url: `${origin}/partage/${id}`, expiresAt })
}, 'operator')

// GET ?s=<id> → the snapshot for a signed-in importer (add-to-my-book / agenda /
// routines, or the /cercle/import family merge). Any account: the id is the capability.
// GET (no id) → the sender's own live shares, all kinds (« Mes partages » manage list).
export const onRequestGet = authed(async (ctx, actor) => {
  const id = new URL(ctx.request.url).searchParams.get('s')
  if (id) {
    const share = await readLiveShare(ctx.env, id)
    if (!share) return notFound('Ce partage n’existe plus.')
    let payload: unknown = null
    try {
      payload = JSON.parse(share.payload)
    } catch {
      return notFound('Ce partage n’existe plus.')
    }
    return ok({ kind: share.kind, label: share.label, payload, sourceName: share.sourceName })
  }
  const shares = await listLiveShares(ctx.env, actor.householdId)
  return ok({ shares })
})

export const onRequestDelete = authed(async (ctx, actor) => {
  const body = await readJson<{ id?: string }>(ctx.request)
  if (!body?.id) return badRequest('id requis.')
  const done = await revokeShareById(ctx.env, actor.householdId, body.id)
  if (!done) return notFound('Partage introuvable.')
  return ok({ ok: true })
}, 'operator')
