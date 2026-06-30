import { badRequest, notFound, ok, readJson } from '../_lib/json'
import { authed } from '../_lib/route'
import { newId, nowSec } from '../_lib/ids'
import { profileMemberId } from '../_lib/profile'
import { deleteR2Blob } from '../_lib/r2'
import { isValidR2Key } from '../_lib/validate'

// « Laisse un mot » — the household's INTERNAL answering machine on the fridge. A member
// leaves a short mot (a typed line and/or a voice clip #38 / drawing #14 / photo #13)
// ADDRESSED to another member or the whole Maisonnée; it waits, unopened, until the
// recipient picks their face and opens it. DELIBERATELY separate from « La boîte aux
// lettres » (postbox = guest/outsider → household moderation) and from family_notes /
// board notes: a mot is a one-to-one(-or-all) ADDRESSED message with an opened/unopened
// lifecycle (and an optional « Gardé » keepsake stamp).
//
//   GET    /api/mots  -> all live mots (both scopes, opened + unopened); the client filters
//   POST   /api/mots  -> leave { recipient_id?, text?, media_kind?, media_key?, scene_key? }
//   PATCH  /api/mots  -> { id, opened?:true, saved?:bool, text? } (stamp opened / keep / edit)
//   DELETE /api/mots  -> soft-clear one { id } (sets deleted_at; frees media)
//
// member_id = the RECIPIENT (NULL = Maisonnée), chosen EXPLICITLY in the composer.
// author_member_id = the SENDER, from the X-Profile face. opened_at NULL = still waiting.

interface MotRow {
  id: string
  member_id: string | null
  author_member_id: string | null
  text: string
  media_kind: string | null
  media_key: string | null
  scene_key: string | null
  created_at: number
  updated_at: number | null
  opened_at: number | null
  saved_at: number | null
}

const TEXT_CAP = 2000

export const onRequestGet = authed(async (ctx, actor) => {
  const rows = await ctx.env.DB.prepare(
    'SELECT id, member_id, author_member_id, text, media_kind, media_key, scene_key, created_at, updated_at, opened_at, saved_at FROM mots WHERE household_id = ? AND deleted_at IS NULL ORDER BY created_at DESC',
  )
    .bind(actor.householdId)
    .all<MotRow>()
  return ok({ mots: rows.results })
})

export const onRequestPost = authed(async (ctx, actor) => {
  const body = await readJson<{
    recipient_id?: string | null
    text?: string
    media_kind?: string
    media_key?: string
    scene_key?: string
  }>(ctx.request)
  const text = body?.text?.trim() ?? ''
  // A mot is a written line and/or a media memo: an audio clip (#38), a drawing (#14),
  // or a shared photo (#13 — 'image'). At least one of text / media must be present.
  const kind =
    body?.media_kind === 'audio' || body?.media_kind === 'drawing' || body?.media_kind === 'image'
      ? body.media_kind
      : null
  const mediaKey = kind ? body?.media_key?.trim() || null : null
  if (!text && !(kind && mediaKey)) return badRequest('Mot vide.')
  // The editable drawing scene (#1) — only meaningful for a drawing.
  const sceneKey = kind === 'drawing' && isValidR2Key(body?.scene_key?.trim()) ? body!.scene_key!.trim() : null

  // Recipient resolution — the composer picks a face EXPLICITLY (it does NOT follow the
  // X-Profile sender): NULL/absent → Maisonnée; a non-null id is validated to this
  // household (an addressed feature rejects an unknown recipient rather than dropping it).
  let recipientId: string | null = null
  const wanted = body?.recipient_id?.trim()
  if (wanted) {
    const m = await ctx.env.DB.prepare('SELECT 1 FROM members WHERE id = ? AND household_id = ?')
      .bind(wanted, actor.householdId)
      .first<{ 1: number }>()
    if (!m) return badRequest('Destinataire inconnu.')
    recipientId = wanted
  }

  const id = newId()
  await ctx.env.DB.prepare(
    'INSERT INTO mots (id, household_id, member_id, author_member_id, text, media_kind, media_key, scene_key, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
  )
    .bind(
      id,
      actor.householdId,
      recipientId,
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
  // Stamp the mot OPENED (the recipient heard/read it), KEEP it as a keepsake (saved), and/or
  // edit a still-unopened text mot. Opening is idempotent (first open wins). The author is
  // never rewritten; re-scoping a mot isn't supported (it's addressed at send time).
  //   { id, opened?: true, saved?: boolean, text? }
  const body = await readJson<{ id?: string; opened?: boolean; saved?: boolean; text?: string }>(ctx.request)
  const id = body?.id?.trim()
  if (!id) return badRequest('id requis.')
  const hasOpened = body?.opened === true
  const hasSaved = typeof body?.saved === 'boolean'
  const hasText = typeof body?.text === 'string'
  if (!hasOpened && !hasSaved && !hasText) return badRequest('Rien à modifier.')

  const row = await ctx.env.DB.prepare('SELECT id FROM mots WHERE id = ? AND household_id = ? AND deleted_at IS NULL')
    .bind(id, actor.householdId)
    .first<{ id: string }>()
  if (!row) return notFound('Mot introuvable.')

  const now = nowSec()
  await ctx.env.DB.prepare(
    'UPDATE mots SET opened_at = CASE WHEN ? = 1 THEN COALESCE(opened_at, ?) ELSE opened_at END, saved_at = CASE WHEN ? = 1 THEN ? ELSE saved_at END, text = COALESCE(?, text), updated_at = ? WHERE id = ? AND household_id = ?',
  )
    .bind(
      hasOpened ? 1 : 0,
      now,
      hasSaved ? 1 : 0,
      hasSaved && body!.saved ? now : null,
      hasText ? body!.text!.trim().slice(0, TEXT_CAP) : null,
      now,
      id,
      actor.householdId,
    )
    .run()
  return ok({ ok: true })
})

export const onRequestDelete = authed(async (ctx, actor) => {
  const body = await readJson<{ id?: string }>(ctx.request)
  const id = body?.id?.trim()
  if (!id) return badRequest('id requis.')
  // Free any R2 attachment first — a cleared mot is never shown again, so the blob is
  // dead weight (mirrors the family-note + fridge-note cleanup). Best-effort.
  const row = await ctx.env.DB.prepare(
    'SELECT media_key, scene_key FROM mots WHERE id = ? AND household_id = ? AND deleted_at IS NULL',
  )
    .bind(id, actor.householdId)
    .first<{ media_key: string | null; scene_key: string | null }>()
  await deleteR2Blob(ctx.env.PHOTOS, row?.media_key)
  await deleteR2Blob(ctx.env.PHOTOS, row?.scene_key)
  await ctx.env.DB.prepare('UPDATE mots SET deleted_at = ? WHERE id = ? AND household_id = ?')
    .bind(nowSec(), id, actor.householdId)
    .run()
  return ok({ ok: true })
})
