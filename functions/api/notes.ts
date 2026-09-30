import { badRequest, notFound, ok, readJson } from '../_lib/json'
import { authed } from '../_lib/route'
import { newId, nowSec } from '../_lib/ids'
import { profileMemberId } from '../_lib/profile'
import { deleteR2Blob } from '../_lib/r2'
import { isValidR2Key } from '../_lib/validate'
import { CAP_SQL, capped } from '../_lib/listCap'
import { transcribeMot } from '../_lib/motTranscript'

// « Mots » — the fridge. ONE table since 2026-09-29 (migration 0142): a paper on the
// fridge that MAY be addressed to one face. Notes are usually born from the capture
// router (the catch-all 'note' type) or the ＋ « Mot » composer; the postbox, the share
// target and the drawings write here too. A note may carry MEDIA (#38 audio memo / #14
// drawn note / #13 photo): media_kind + media_key (R2, via /api/note-media), in which
// case text may be empty.
//
// What « Laisse un mot » (the old `mots` table) brought, with the same meaning:
//   · for_member_id — the RECIPIENT; NULL = the whole Maisonnée. `member_id` stays the
//     AUTHOR (the face that left it), as it always was on notes.
//   · opened_at     — the recipient first opened it; NULL = still waiting on their face.
//   · saved_at      — « Garder »: on the Souvenirs shelf. Retiring a kept note from the
//     fridge does NOT free its media — the shelf still shows it.
//   · surface_at    — « Plus tard » / « Sa fête »: hidden from the fridge until then.
//   · transcript    — a voice note's words, filled in the background.
//
//   GET    /api/notes  -> every live note, scheduled ones included (the author's outbox
//                         needs them; the fridge hides them until surface_at) — plus the
//                         KEPT ones already retired from the fridge (`dismissed_at` set),
//                         which only the Souvenirs shelf shows
//   POST   /api/notes  -> { text?, media_kind?, media_key?, scene_key?, recipient_id?, surface_at? }
//   PATCH  /api/notes  -> re-draw a drawing { id, media_key, scene_key? } (anyone can add
//                         to a family doodle — Notes.tsx / DrawPad #14), OR
//                         { id, opened?: true, saved?: bool, text?, surface_at? }
//   DELETE /api/notes  -> clear one { id } (soft: sets dismissed_at; frees media unless kept)

interface NoteRow {
  id: string
  text: string
  member_id: string | null
  created_at: number
  media_kind: string | null
  media_key: string | null
  scene_key: string | null
  // Who left it, when it came from « La boîte aux lettres » (#postbox) — « — Papi ».
  // NULL for ordinary household notes. Set server-side by the postbox accept only.
  author_label: string | null
  for_member_id: string | null
  opened_at: number | null
  saved_at: number | null
  surface_at: number | null
  transcript: string | null
  updated_at: number | null
  dismissed_at: number | null
}

// The fridge is a paper, not a letter: short. (A mot allowed 2 000; the ones that came
// across in 0142 keep their words — the cap is only on what is written from now on.)
const TEXT_CAP = 280

export const onRequestGet = authed(async (ctx, actor) => {
  const rows = await ctx.env.DB.prepare(
    `SELECT id, text, member_id, created_at, media_kind, media_key, scene_key, author_label,
            for_member_id, opened_at, saved_at, surface_at, transcript, updated_at, dismissed_at
       FROM notes WHERE household_id = ? AND (dismissed_at IS NULL OR saved_at IS NOT NULL)
      ORDER BY created_at DESC ${CAP_SQL}`,
  )
    .bind(actor.householdId)
    .all<NoteRow>()
  const { rows: notes, more } = capped(rows.results)
  return ok({ notes, more })
})

export const onRequestPost = authed(async (ctx, actor) => {
  const body = await readJson<{
    text?: string
    media_kind?: string
    media_key?: string
    scene_key?: string
    recipient_id?: string | null
    surface_at?: number | null
  }>(ctx.request)
  const text = body?.text?.trim() ?? ''
  const kind =
    body?.media_kind === 'audio' || body?.media_kind === 'drawing' || body?.media_kind === 'image'
      ? body.media_kind
      : null
  const mediaKey = kind ? body?.media_key?.trim() || null : null
  if (!text && !(kind && mediaKey)) return badRequest('Note vide.')
  const sceneKey = kind === 'drawing' && isValidR2Key(body?.scene_key?.trim()) ? body!.scene_key!.trim() : null

  // A recipient must be a member of THIS household — never trust a posted id.
  let recipientId: string | null = null
  const wanted = body?.recipient_id?.trim()
  if (wanted) {
    const m = await ctx.env.DB.prepare('SELECT 1 FROM members WHERE id = ? AND household_id = ?')
      .bind(wanted, actor.householdId)
      .first<{ 1: number }>()
    if (!m) return badRequest('Destinataire inconnu.')
    recipientId = wanted
  }
  // « Plus tard »: only a moment still ahead counts; anything else surfaces now.
  const surfaceAt =
    typeof body?.surface_at === 'number' && Number.isFinite(body.surface_at) && body.surface_at > nowSec()
      ? Math.floor(body.surface_at)
      : null

  const id = newId()
  await ctx.env.DB.prepare(
    'INSERT INTO notes (id, household_id, text, member_id, created_at, media_kind, media_key, scene_key, for_member_id, surface_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  )
    .bind(id, actor.householdId, text.slice(0, TEXT_CAP), profileMemberId(ctx.request), nowSec(), kind, mediaKey, sceneKey, recipientId, surfaceAt)
    .run()

  // A voice note gets its words in the background — the fridge can then show what it
  // SAYS instead of « Mémo vocal ». Metered like every model call (runModel).
  if (kind === 'audio' && mediaKey) ctx.waitUntil(transcribeMot(ctx.env, actor.householdId, id, mediaKey, ctx.request))
  return ok({ ok: true, id })
})

export const onRequestPatch = authed(async (ctx, actor) => {
  const body = await readJson<{
    id?: string
    media_key?: string
    scene_key?: string
    opened?: boolean
    saved?: boolean
    text?: string
    surface_at?: number | null
  }>(ctx.request)
  const id = body?.id?.trim()
  if (!id) return badRequest('id requis.')

  // ---- Re-draw a drawing note (a family doodle anyone can add to) -------------------
  const mediaKey = body?.media_key?.trim()
  if (mediaKey) {
    const sceneKey = isValidR2Key(body?.scene_key?.trim()) ? body!.scene_key!.trim() : null
    const row = await ctx.env.DB.prepare(
      "SELECT media_key, scene_key FROM notes WHERE id = ? AND household_id = ? AND media_kind = 'drawing' AND dismissed_at IS NULL",
    )
      .bind(id, actor.householdId)
      .first<{ media_key: string | null; scene_key: string | null }>()
    if (!row) return notFound('Dessin introuvable.')
    if (row.media_key && row.media_key !== mediaKey) await deleteR2Blob(ctx.env.PHOTOS, row.media_key)
    if (row.scene_key && row.scene_key !== sceneKey) await deleteR2Blob(ctx.env.PHOTOS, row.scene_key)
    await ctx.env.DB.prepare('UPDATE notes SET media_key = ?, scene_key = ?, member_id = ?, created_at = ? WHERE id = ? AND household_id = ?')
      .bind(mediaKey, sceneKey, profileMemberId(ctx.request), nowSec(), id, actor.householdId)
      .run()
    return ok({ ok: true })
  }

  // ---- Open / keep / edit / reschedule --------------------------------------------------
  const hasOpened = body?.opened === true
  const hasSaved = typeof body?.saved === 'boolean'
  const hasText = typeof body?.text === 'string'
  const hasSurface = body != null && Object.prototype.hasOwnProperty.call(body, 'surface_at')
  if (!hasOpened && !hasSaved && !hasText && !hasSurface) return badRequest('Rien à modifier.')

  // A kept note stays reachable after it left the fridge — the Souvenirs shelf can still
  // un-keep it. Anything else retired is gone.
  const row = await ctx.env.DB.prepare(
    'SELECT id, dismissed_at, media_key, scene_key FROM notes WHERE id = ? AND household_id = ? AND (dismissed_at IS NULL OR saved_at IS NOT NULL)',
  )
    .bind(id, actor.householdId)
    .first<{ id: string; dismissed_at: number | null; media_key: string | null; scene_key: string | null }>()
  if (!row) return notFound('Mot introuvable.')
  // The POST rule, held on the edit too (2026-09-30): a note is words OR a memo. An edit
  // that empties a TEXT note left a blank card on the fridge — `COALESCE('', text)` keeps
  // the '' — so it is refused; a memo's caption may go, its media is the note.
  if (hasText && !body!.text!.trim() && !row.media_key) return badRequest('Note vide.')

  const now = nowSec()
  const surfaceAt =
    typeof body?.surface_at === 'number' && Number.isFinite(body.surface_at) && body.surface_at > now
      ? Math.floor(body.surface_at)
      : null
  await ctx.env.DB.prepare(
    `UPDATE notes SET
       opened_at  = CASE WHEN ? = 1 THEN COALESCE(opened_at, ?) ELSE opened_at END,
       saved_at   = CASE WHEN ? = 1 THEN ? ELSE saved_at END,
       text       = COALESCE(?, text),
       surface_at = CASE WHEN ? = 1 THEN ? ELSE surface_at END,
       updated_at = ?
     WHERE id = ? AND household_id = ?`,
  )
    .bind(
      hasOpened ? 1 : 0,
      now,
      hasSaved ? 1 : 0,
      hasSaved && body!.saved ? now : null,
      hasText ? body!.text!.trim().slice(0, TEXT_CAP) : null,
      hasSurface ? 1 : 0,
      surfaceAt,
      now,
      id,
      actor.householdId,
    )
    .run()
  // Un-keeping a note that already left the fridge: nothing shows it any more, so its
  // media goes the way a retired note's always did.
  if (hasSaved && !body!.saved && row.dismissed_at != null) {
    await deleteR2Blob(ctx.env.PHOTOS, row.media_key)
    await deleteR2Blob(ctx.env.PHOTOS, row.scene_key)
  }
  return ok({ ok: true })
})

export const onRequestDelete = authed(async (ctx, actor) => {
  const body = await readJson<{ id?: string }>(ctx.request)
  const id = body?.id?.trim()
  if (!id) return badRequest('id requis.')
  const row = await ctx.env.DB.prepare(
    'SELECT media_key, scene_key, saved_at FROM notes WHERE id = ? AND household_id = ? AND dismissed_at IS NULL',
  )
    .bind(id, actor.householdId)
    .first<{ media_key: string | null; scene_key: string | null; saved_at: number | null }>()
  // A KEPT note leaves the fridge but stays on the Souvenirs shelf — so its media stays.
  if (row && !row.saved_at) {
    await deleteR2Blob(ctx.env.PHOTOS, row.media_key)
    await deleteR2Blob(ctx.env.PHOTOS, row.scene_key)
  }
  await ctx.env.DB.prepare('UPDATE notes SET dismissed_at = ? WHERE id = ? AND household_id = ?')
    .bind(nowSec(), id, actor.householdId)
    .run()
  return ok({ ok: true })
})
