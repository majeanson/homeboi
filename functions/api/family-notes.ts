import { badRequest, notFound, ok, readJson } from '../_lib/json'
import { authed } from '../_lib/route'
import { newId, nowSec } from '../_lib/ids'
import { profileMemberId } from '../_lib/profile'
import { deleteR2Blob } from '../_lib/r2'
import { isValidR2Key } from '../_lib/validate'

// « Le cercle » → Famille → "Notes & recommandations". iOS-Notes-style quick notes
// scoped to ONE household member (the "Moi" list) or to the whole Maisonnée (the
// family-wide list), each optionally carrying MEDIA (#38 audio memo / #14 drawing /
// #13 shared photo) uploaded via /api/note-media. DELIBERATELY separate from the
// board `notes` table: those are transient fridge memos on Aujourd'hui; these are
// durable directory notes living under the Famille tab.
//
//   GET    /api/family-notes  -> all live household notes (both scopes), newest first
//   POST   /api/family-notes  -> add { text?, scope, member_id?, media_kind?, media_key?, scene_key? }
//   PATCH  /api/family-notes  -> edit text and/or re-draw a drawing { id, text?, media_key?, scene_key? }
//   DELETE /api/family-notes  -> soft-clear one { id } (sets deleted_at; frees media)
//
// Scope is chosen on the composer (Moi / Maisonnée toggle) and sent EXPLICITLY, so
// it overrides the X-Profile header: scope==='family' -> member_id NULL; scope==='self'
// -> the picked member. author_member_id always records who wrote it (pick-your-face).

interface FamilyNoteRow {
  id: string
  member_id: string | null
  author_member_id: string | null
  text: string
  media_kind: string | null
  media_key: string | null
  scene_key: string | null
  created_at: number
  updated_at: number | null
}

const TEXT_CAP = 2000

export const onRequestGet = authed(async (ctx, actor) => {
  const rows = await ctx.env.DB.prepare(
    'SELECT id, member_id, author_member_id, text, media_kind, media_key, scene_key, created_at, updated_at FROM family_notes WHERE household_id = ? AND deleted_at IS NULL ORDER BY created_at DESC',
  )
    .bind(actor.householdId)
    .all<FamilyNoteRow>()
  return ok({ notes: rows.results })
})

export const onRequestPost = authed(async (ctx, actor) => {
  const body = await readJson<{
    text?: string
    scope?: string
    member_id?: string | null
    media_kind?: string
    media_key?: string
    scene_key?: string
  }>(ctx.request)
  const text = body?.text?.trim() ?? ''
  // A note is either a written line or a media memo: an audio clip (#38), a drawing
  // (#14), or a shared photo (#13 — 'image'). One of text/media must be present.
  const kind =
    body?.media_kind === 'audio' || body?.media_kind === 'drawing' || body?.media_kind === 'image'
      ? body.media_kind
      : null
  const mediaKey = kind ? body?.media_key?.trim() || null : null
  if (!text && !(kind && mediaKey)) return badRequest('Note vide.')
  // The editable drawing scene (#1) — only meaningful for a drawing.
  const sceneKey = kind === 'drawing' && isValidR2Key(body?.scene_key?.trim()) ? body!.scene_key!.trim() : null

  // Scope resolution — the composer toggle is authoritative over X-Profile.
  //   'family' -> Maisonnée note (member_id NULL)
  //   'self'   -> the picked member (validated to this household), else the actor's face
  let scopeMemberId: string | null = null
  if (body?.scope !== 'family') {
    const wanted = body?.member_id?.trim() || profileMemberId(ctx.request)
    if (wanted) {
      const m = await ctx.env.DB.prepare('SELECT 1 FROM members WHERE id = ? AND household_id = ?')
        .bind(wanted, actor.householdId)
        .first<{ 1: number }>()
      scopeMemberId = m ? wanted : null
    }
  }

  const id = newId()
  await ctx.env.DB.prepare(
    'INSERT INTO family_notes (id, household_id, member_id, author_member_id, text, media_kind, media_key, scene_key, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
  )
    .bind(
      id,
      actor.householdId,
      scopeMemberId,
      profileMemberId(ctx.request),
      text.slice(0, TEXT_CAP),
      kind,
      mediaKey,
      sceneKey,
      nowSec(),
    )
    .run()
  return ok({ ok: true, id })
})

export const onRequestPatch = authed(async (ctx, actor) => {
  // Edit a note in place: change the text (iOS Notes are editable) AND/OR re-draw a
  // drawing (swap media_key + scene, free the superseded blobs). Scope is NOT
  // editable here — delete + recreate to move a note between Moi and Maisonnée.
  const body = await readJson<{ id?: string; text?: string; media_key?: string; scene_key?: string }>(ctx.request)
  const id = body?.id?.trim()
  if (!id) return badRequest('id requis.')
  const hasText = typeof body?.text === 'string'
  const newMediaKey = body?.media_key?.trim()
  if (!hasText && !newMediaKey) return badRequest('Rien à modifier.')

  const row = await ctx.env.DB.prepare(
    'SELECT media_kind, media_key, scene_key FROM family_notes WHERE id = ? AND household_id = ? AND deleted_at IS NULL',
  )
    .bind(id, actor.householdId)
    .first<{ media_kind: string | null; media_key: string | null; scene_key: string | null }>()
  if (!row) return notFound('Note introuvable.')

  if (newMediaKey) {
    // Re-draw: only a drawing carries an editable media+scene. Free the old blobs.
    if (row.media_kind !== 'drawing') return badRequest('Cette note n’est pas un dessin.')
    const sceneKey = isValidR2Key(body?.scene_key?.trim()) ? body!.scene_key!.trim() : null
    if (row.media_key && row.media_key !== newMediaKey) await deleteR2Blob(ctx.env.PHOTOS, row.media_key)
    if (row.scene_key && row.scene_key !== sceneKey) await deleteR2Blob(ctx.env.PHOTOS, row.scene_key)
    await ctx.env.DB.prepare(
      'UPDATE family_notes SET media_key = ?, scene_key = ?, text = COALESCE(?, text), updated_at = ? WHERE id = ? AND household_id = ?',
    )
      .bind(newMediaKey, sceneKey, hasText ? body!.text!.trim().slice(0, TEXT_CAP) : null, nowSec(), id, actor.householdId)
      .run()
    return ok({ ok: true })
  }

  // Text-only edit.
  await ctx.env.DB.prepare('UPDATE family_notes SET text = ?, updated_at = ? WHERE id = ? AND household_id = ?')
    .bind(body!.text!.trim().slice(0, TEXT_CAP), nowSec(), id, actor.householdId)
    .run()
  return ok({ ok: true })
})

export const onRequestDelete = authed(async (ctx, actor) => {
  const body = await readJson<{ id?: string }>(ctx.request)
  const id = body?.id?.trim()
  if (!id) return badRequest('id requis.')
  // Free any R2 attachment first — a cleared note is never shown again, so the blob
  // is dead weight (mirrors the fridge-note + routine voice-clip cleanup).
  // Best-effort: a failed R2 delete must not block clearing the note.
  const row = await ctx.env.DB.prepare(
    'SELECT media_key, scene_key FROM family_notes WHERE id = ? AND household_id = ? AND deleted_at IS NULL',
  )
    .bind(id, actor.householdId)
    .first<{ media_key: string | null; scene_key: string | null }>()
  await deleteR2Blob(ctx.env.PHOTOS, row?.media_key)
  await deleteR2Blob(ctx.env.PHOTOS, row?.scene_key)
  await ctx.env.DB.prepare('UPDATE family_notes SET deleted_at = ? WHERE id = ? AND household_id = ?')
    .bind(nowSec(), id, actor.householdId)
    .run()
  return ok({ ok: true })
})
