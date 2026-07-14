import { badRequest, notFound, ok, readJson } from '../_lib/json'
import { authed } from '../_lib/route'
import { newId, nowSec } from '../_lib/ids'
import { STICKERS } from '../../src/lib/stickers'

// Routine sticker wall (feature: opt-in reward, only surfaced when « Mode calme » is
// OFF client-side). A child places a sticker here when they finish a routine; the wall
// is a permanent per-member grid. Kiosk-allowed (the toddler taps it at the finish).
//
// Deliberately count-free: we return the rows, the client renders a grid — no tally,
// no ranking between children. The closed sticker set is validated here so the column
// can't hold arbitrary text — and it is the SAME list the client offers from
// (src/lib/stickers.ts, imported rather than mirrored: a drift between the two lists
// would 400 a child's tap silently). The client only OFFERS a rotating slice of the
// catalog per (day, routine) (`stickersFor`); the whitelist stays the whole catalog.
const stickerOrNull = (v: unknown): string | null =>
  typeof v === 'string' && (STICKERS as readonly string[]).includes(v) ? v : null

export const onRequestGet = authed(async (ctx, actor) => {
  const { results } = await ctx.env.DB.prepare(
    'SELECT id, member_id, sticker, routine_id, created_at FROM routine_stickers WHERE household_id = ? ORDER BY created_at',
  )
    .bind(actor.householdId)
    .all<{ id: string; member_id: string | null; sticker: string; routine_id: string | null; created_at: number }>()
  return ok({
    stickers: results.map((r) => ({
      id: r.id,
      memberId: r.member_id,
      sticker: r.sticker,
      routineId: r.routine_id,
      createdAt: r.created_at,
    })),
  })
})

export const onRequestPost = authed(async (ctx, actor) => {
  const body = await readJson<{ memberId?: string; sticker?: string; routineId?: string }>(ctx.request)
  const sticker = stickerOrNull(body?.sticker)
  if (!sticker) return badRequest('sticker requis.')
  const id = newId()
  await ctx.env.DB.prepare(
    'INSERT INTO routine_stickers (id, household_id, member_id, sticker, routine_id, created_at) VALUES (?, ?, ?, ?, ?, ?)',
  )
    .bind(
      id,
      actor.householdId,
      typeof body?.memberId === 'string' && body.memberId ? body.memberId : null,
      sticker,
      typeof body?.routineId === 'string' && body.routineId ? body.routineId : null,
      nowSec(),
    )
    .run()
  return ok({ id })
})

// Remove one sticker (curate the wall). Scoped to the household so a stray id can't
// delete another home's row.
export const onRequestDelete = authed(async (ctx, actor) => {
  const body = await readJson<{ id?: string }>(ctx.request)
  if (!body?.id) return badRequest('id requis.')
  const row = await ctx.env.DB.prepare('SELECT id FROM routine_stickers WHERE id = ? AND household_id = ?')
    .bind(body.id, actor.householdId)
    .first<{ id: string }>()
  if (!row) return notFound('Autocollant introuvable.')
  await ctx.env.DB.prepare('DELETE FROM routine_stickers WHERE id = ? AND household_id = ?')
    .bind(body.id, actor.householdId)
    .run()
  return ok({ ok: true })
})
