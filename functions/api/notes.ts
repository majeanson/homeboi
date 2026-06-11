import { badRequest, ok, readJson } from '../_lib/json'
import { authed } from '../_lib/route'
import { newId, nowSec } from '../_lib/ids'
import { profileMemberId } from '../_lib/profile'

// Fridge notes — short household notes shown on the Aujourd'hui board until
// cleared. Notes are usually born from the capture router (the catch-all 'note'
// type), but this endpoint also lets a note be added directly and cleared.
//
//   GET    /api/notes  -> active notes (newest first)
//   POST   /api/notes  -> add a note { text }
//   DELETE /api/notes  -> clear one  { id }  (soft: sets dismissed_at)

interface NoteRow {
  id: string
  text: string
  member_id: string | null
  created_at: number
}

export const onRequestGet = authed(async (ctx, actor) => {
  const rows = await ctx.env.DB.prepare(
    'SELECT id, text, member_id, created_at FROM notes WHERE household_id = ? AND dismissed_at IS NULL ORDER BY created_at DESC',
  )
    .bind(actor.householdId)
    .all<NoteRow>()
  return ok({ notes: rows.results })
})

export const onRequestPost = authed(async (ctx, actor) => {
  const body = await readJson<{ text?: string }>(ctx.request)
  const text = body?.text?.trim()
  if (!text) return badRequest('Note vide.')
  const id = newId()
  await ctx.env.DB.prepare(
    'INSERT INTO notes (id, household_id, text, member_id, created_at) VALUES (?, ?, ?, ?, ?)',
  )
    .bind(id, actor.householdId, text.slice(0, 280), profileMemberId(ctx.request), nowSec())
    .run()
  return ok({ ok: true, id })
})

export const onRequestDelete = authed(async (ctx, actor) => {
  const body = await readJson<{ id?: string }>(ctx.request)
  const id = body?.id?.trim()
  if (!id) return badRequest('id requis.')
  // Soft clear (dismissed_at), scoped to the household so a kiosk can clear too.
  await ctx.env.DB.prepare('UPDATE notes SET dismissed_at = ? WHERE id = ? AND household_id = ?')
    .bind(nowSec(), id, actor.householdId)
    .run()
  return ok({ ok: true })
})
