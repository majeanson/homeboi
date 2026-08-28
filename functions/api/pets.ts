import { badRequest, notFound, ok, readJson, serviceUnavailable } from '../_lib/json'
import { authed } from '../_lib/route'
import { newId, nowSec } from '../_lib/ids'
import { deleteR2Blob, uploadR2Media } from '../_lib/r2'
import { birthdayOrNull } from '../_lib/birthdayRule'

// « Le cercle » → Pets: the household's animals, returned as PEOPLE in the circle (a
// 'pet' PersonKind merged into the SPA's people set, like contacts + members). A pet
// carries care fields (species/breed, microchip, feeding, sitter notes, a weight log)
// and an optional VET that points at a Business (vet_business_id). Soft-delete + R2
// photo mirror /api/businesses.
//
//   GET    /api/pets -> all live pets, A→Z
//   POST   /api/pets -> image blob → upload a photo, return { key }
//                    -> JSON → create a pet
//   PATCH  /api/pets -> edit one { id, …fields } (frees a replaced photo)
//   DELETE /api/pets -> soft-clear one { id } (sets deleted_at; frees photo)
//
// CALM: `weights` is a dated health log (JSON), never an inventory count/stock; no
// streaks. authed() makes a guest read-only structurally; photo upload degrades to 503
// when R2 is unbound (the client keeps the initials/emoji tile).

const MAX_PHOTO_BYTES = 3 * 1024 * 1024
const NAME_CAP = 200
const TEXT_CAP = 2000

interface PetRow {
  id: string
  name: string
  species: string | null
  breed: string | null
  photo_key: string | null
  colour: string | null
  birthday: string | null
  microchip: string | null
  feeding: string | null
  sitter_notes: string | null
  vet_business_id: string | null
  weights: string
  notes: string | null
}

interface WeightEntry {
  date: string
  kg: number
  note?: string | null
}

const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null)

// A weight log is a small array of {date, kg, note}. Kept tolerant: bad rows drop, so
// a malformed client payload can never corrupt the column. Stringified for storage.
function cleanWeights(v: unknown): string {
  if (!Array.isArray(v)) return '[]'
  const out: WeightEntry[] = []
  for (const w of v) {
    if (!w || typeof w !== 'object') continue
    const date = str((w as Record<string, unknown>).date)
    const kg = Number((w as Record<string, unknown>).kg)
    if (!date || !Number.isFinite(kg)) continue
    out.push({ date, kg, note: str((w as Record<string, unknown>).note) })
  }
  return JSON.stringify(out.slice(0, 200))
}

export const onRequestGet = authed(async (ctx, actor) => {
  const rows = await ctx.env.DB.prepare(
    `SELECT id, name, species, breed, media_key AS photo_key, colour, birthday, microchip, feeding, sitter_notes, vet_business_id, weights, notes
       FROM pets WHERE household_id = ? AND deleted_at IS NULL ORDER BY name COLLATE NOCASE`,
  )
    .bind(actor.householdId)
    .all<PetRow>()
  return ok({
    pets: rows.results.map((p) => ({
      id: p.id,
      name: p.name,
      species: p.species,
      breed: p.breed,
      photoKey: p.photo_key,
      colour: p.colour,
      birthday: p.birthday,
      microchip: p.microchip,
      feeding: p.feeding,
      sitterNotes: p.sitter_notes,
      vetBusinessId: p.vet_business_id,
      weights: ((): WeightEntry[] => {
        try {
          const parsed = JSON.parse(p.weights)
          return Array.isArray(parsed) ? parsed : []
        } catch {
          return []
        }
      })(),
      notes: p.notes,
    })),
  })
})

// POST wears two hats by content-type (mirrors /api/cercle + /api/businesses):
//   image/*  → upload a pet photo to R2, return { key }
//   JSON     → create a pet
export const onRequestPost = authed(async (ctx, actor) => {
  const type = ctx.request.headers.get('content-type') ?? ''

  if (type.startsWith('image/')) {
    if (!ctx.env.PHOTOS) return serviceUnavailable('Stockage photo indisponible ici.')
    const up = await uploadR2Media(ctx.env.PHOTOS, ctx.request, { prefix: 'pet', maxBytes: MAX_PHOTO_BYTES, accept: () => true })
    if ('error' in up) return up.error
    return ok({ key: up.key })
  }

  const body = await readJson<Record<string, unknown>>(ctx.request)
  const name = str(body?.name)?.slice(0, NAME_CAP)
  if (!name) return badRequest('Nom requis.')

  const id = newId()
  const ts = nowSec()
  await ctx.env.DB.prepare(
    `INSERT INTO pets
       (id, household_id, name, species, breed, media_key, colour, birthday, microchip, feeding, sitter_notes, vet_business_id, weights, notes, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      id,
      actor.householdId,
      name,
      str(body?.species),
      str(body?.breed),
      str(body?.photoKey),
      str(body?.colour),
      birthdayOrNull(body?.birthday),
      str(body?.microchip),
      str(body?.feeding)?.slice(0, TEXT_CAP) ?? null,
      str(body?.sitterNotes)?.slice(0, TEXT_CAP) ?? null,
      str(body?.vetBusinessId),
      cleanWeights(body?.weights),
      str(body?.notes)?.slice(0, TEXT_CAP) ?? null,
      ts,
      ts,
    )
    .run()
  return ok({ id })
})

export const onRequestPatch = authed(async (ctx, actor) => {
  const body = await readJson<Record<string, unknown>>(ctx.request)
  if (!body) return badRequest('id requis.')
  const id = str(body.id)
  if (!id) return badRequest('id requis.')

  const owns = await ctx.env.DB.prepare('SELECT media_key AS photo_key FROM pets WHERE id = ? AND household_id = ? AND deleted_at IS NULL')
    .bind(id, actor.householdId)
    .first<{ photo_key: string | null }>()
  if (!owns) return notFound('Animal introuvable.')

  const sets: string[] = []
  const binds: unknown[] = []
  const setIf = (present: boolean, col: string, value: unknown) => {
    if (present) {
      sets.push(`${col} = ?`)
      binds.push(value)
    }
  }
  if (body.name !== undefined) {
    const n = str(body.name)?.slice(0, NAME_CAP)
    if (!n) return badRequest('Nom requis.')
    setIf(true, 'name', n)
  }
  setIf('species' in body, 'species', str(body.species))
  setIf('breed' in body, 'breed', str(body.breed))
  setIf('photoKey' in body, 'media_key', str(body.photoKey))
  setIf('colour' in body, 'colour', str(body.colour))
  setIf('birthday' in body, 'birthday', birthdayOrNull(body.birthday))
  setIf('microchip' in body, 'microchip', str(body.microchip))
  setIf('feeding' in body, 'feeding', str(body.feeding)?.slice(0, TEXT_CAP) ?? null)
  setIf('sitterNotes' in body, 'sitter_notes', str(body.sitterNotes)?.slice(0, TEXT_CAP) ?? null)
  setIf('vetBusinessId' in body, 'vet_business_id', str(body.vetBusinessId))
  setIf('weights' in body, 'weights', cleanWeights(body.weights))
  setIf('notes' in body, 'notes', str(body.notes)?.slice(0, TEXT_CAP) ?? null)

  if (sets.length) {
    sets.push('updated_at = ?')
    binds.push(nowSec(), id, actor.householdId)
    await ctx.env.DB.prepare(`UPDATE pets SET ${sets.join(', ')} WHERE id = ? AND household_id = ?`)
      .bind(...binds)
      .run()
  }

  if ('photoKey' in body && ctx.env.PHOTOS) {
    const next = str(body.photoKey)
    if (owns.photo_key !== next) await deleteR2Blob(ctx.env.PHOTOS, owns.photo_key)
  }
  return ok({ ok: true })
})

export const onRequestDelete = authed(async (ctx, actor) => {
  const body = await readJson<{ id?: string }>(ctx.request)
  if (!body?.id) return badRequest('id requis.')
  const owns = await ctx.env.DB.prepare('SELECT media_key AS photo_key FROM pets WHERE id = ? AND household_id = ? AND deleted_at IS NULL')
    .bind(body.id, actor.householdId)
    .first<{ photo_key: string | null }>()
  await deleteR2Blob(ctx.env.PHOTOS, owns?.photo_key)
  await ctx.env.DB.prepare('UPDATE pets SET deleted_at = ? WHERE id = ? AND household_id = ?')
    .bind(nowSec(), body.id, actor.householdId)
    .run()
  return ok({ ok: true })
})
