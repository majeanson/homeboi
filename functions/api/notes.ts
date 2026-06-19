import { badRequest, notFound, ok, readJson } from '../_lib/json'
import { authed } from '../_lib/route'
import { newId, nowSec } from '../_lib/ids'
import { profileMemberId } from '../_lib/profile'
import { deleteR2Blob } from '../_lib/r2'

// Fridge notes — short household notes shown on the Aujourd'hui board until
// cleared. Notes are usually born from the capture router (the catch-all 'note'
// type), but this endpoint also lets a note be added directly and cleared. A note
// may also carry MEDIA (#38 audio memo / #14 drawn note): media_kind +
// media_key (R2, uploaded via /api/note-media), in which case text may be empty.
//
//   GET    /api/notes  -> active notes (newest first)
//   POST   /api/notes  -> add a note { text?, media_kind?, media_key? }
//   PATCH  /api/notes  -> re-draw a drawing note { id, media_key } (a family doodle
//                         anyone can add to — see Notes.tsx / DrawPad #14)
//   DELETE /api/notes  -> clear one  { id }  (soft: sets dismissed_at; frees media)

interface NoteRow {
  id: string
  text: string
  member_id: string | null
  created_at: number
  media_kind: string | null
  media_key: string | null
}

export const onRequestGet = authed(async (ctx, actor) => {
  const rows = await ctx.env.DB.prepare(
    'SELECT id, text, member_id, created_at, media_kind, media_key FROM notes WHERE household_id = ? AND dismissed_at IS NULL ORDER BY created_at DESC',
  )
    .bind(actor.householdId)
    .all<NoteRow>()
  return ok({ notes: rows.results })
})

export const onRequestPost = authed(async (ctx, actor) => {
  const body = await readJson<{ text?: string; media_kind?: string; media_key?: string }>(ctx.request)
  const text = body?.text?.trim() ?? ''
  // A note is either a written line or a media memo: an audio clip (#38), a drawing
  // (#14), or a shared photo (#13 — 'image'). One of text/media must be present.
  const kind =
    body?.media_kind === 'audio' || body?.media_kind === 'drawing' || body?.media_kind === 'image'
      ? body.media_kind
      : null
  const mediaKey = kind ? body?.media_key?.trim() || null : null
  if (!text && !(kind && mediaKey)) return badRequest('Note vide.')
  const id = newId()
  await ctx.env.DB.prepare(
    'INSERT INTO notes (id, household_id, text, member_id, created_at, media_kind, media_key) VALUES (?, ?, ?, ?, ?, ?, ?)',
  )
    .bind(id, actor.householdId, text.slice(0, 280), profileMemberId(ctx.request), nowSec(), kind, mediaKey)
    .run()
  return ok({ ok: true, id })
})

export const onRequestPatch = authed(async (ctx, actor) => {
  // Re-draw an existing drawing note in place: anyone in the household can re-open
  // a drawing (DrawPad `initial`), add to it, and save back. We swap media_key,
  // re-tint to whoever just contributed, and bump created_at so the freshly-touched
  // doodle resurfaces — no counts/ranks (calm), just "someone added to it".
  const body = await readJson<{ id?: string; media_key?: string }>(ctx.request)
  const id = body?.id?.trim()
  const mediaKey = body?.media_key?.trim()
  if (!id || !mediaKey) return badRequest('id et media_key requis.')
  const row = await ctx.env.DB.prepare(
    "SELECT media_key FROM notes WHERE id = ? AND household_id = ? AND media_kind = 'drawing' AND dismissed_at IS NULL",
  )
    .bind(id, actor.householdId)
    .first<{ media_key: string | null }>()
  if (!row) return notFound('Dessin introuvable.')
  // Free the superseded blob first (keeps the free tier lean; best-effort).
  if (row.media_key && row.media_key !== mediaKey) await deleteR2Blob(ctx.env.PHOTOS, row.media_key)
  await ctx.env.DB.prepare('UPDATE notes SET media_key = ?, member_id = ?, created_at = ? WHERE id = ? AND household_id = ?')
    .bind(mediaKey, profileMemberId(ctx.request), nowSec(), id, actor.householdId)
    .run()
  return ok({ ok: true })
})

export const onRequestDelete = authed(async (ctx, actor) => {
  const body = await readJson<{ id?: string }>(ctx.request)
  const id = body?.id?.trim()
  if (!id) return badRequest('id requis.')
  // Free any R2 attachment first — a cleared memo is never shown again, so the
  // blob is dead weight (keeps the free tier lean; mirrors the routine voice-clip
  // cleanup). Best-effort: a failed R2 delete must not block clearing the note.
  const row = await ctx.env.DB.prepare(
    'SELECT media_key FROM notes WHERE id = ? AND household_id = ? AND dismissed_at IS NULL',
  )
    .bind(id, actor.householdId)
    .first<{ media_key: string | null }>()
  await deleteR2Blob(ctx.env.PHOTOS, row?.media_key)
  // Soft clear (dismissed_at), scoped to the household so a kiosk can clear too.
  await ctx.env.DB.prepare('UPDATE notes SET dismissed_at = ? WHERE id = ? AND household_id = ?')
    .bind(nowSec(), id, actor.householdId)
    .run()
  return ok({ ok: true })
})
