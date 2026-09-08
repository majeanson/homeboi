import { badRequest, notFound, ok, parseJsonArray, readJson } from '../_lib/json'
import { authed } from '../_lib/route'
import { localDayStart, newId, nowSec } from '../_lib/ids'
import { deleteR2Blob } from '../_lib/r2'
import { isValidR2Key } from '../_lib/validate'
import { foldCardMedia, cardMediaKeys, type RoutineCard } from '../_lib/routineCards'

// Kid-view visual routines. GET returns each routine with TODAY's completion
// set (which resets daily — the day empties, NFR-CALM-4). "Today" is the
// household's LOCAL day (America/Toronto via localDayStart), so a finished
// routine clears at local MIDNIGHT and can be done again the next morning —
// not at UTC midnight (≈8 PM local), which used to reset it mid-bedtime. POST creates a
// routine (operator). PATCH toggles one card done for today (kiosk-friendly:
// the three-year-old taps it) — or, operator-only, retags the routine's
// time-of-day cue.
// The card shape (with its media ON the card — see _lib/routineCards).
type Card = RoutineCard

const isNumber = (v: unknown): v is number => typeof v === 'number'

// Cards are stored as the client sends them, EXCEPT the two fields a bad payload
// could wedge a surface with: the per-step timer (clamped to a whole number of
// seconds in a calm range, or dropped) and the per-step tip (trimmed + length-capped,
// or dropped — it gets SPOKEN aloud and drawn in a bubble, so an unbounded string is
// both a wall of text on a tablet and a very long thing to say to a three-year-old).
// Every other field (icon / label / narration) passes through unchanged, as it always has.
// The two media keys ON the card (clipKey / photoKey, Wave D) are validated as
// R2-key-shaped tokens and dropped otherwise, so a client can't stuff junk in.
const MAX_TIMER = 3600 // an hour: a sane ceiling — no routine step needs more
const MAX_TIP = 200 // a trick is one sentence a child can hold, not a paragraph
function sanitizeCards(cards: Card[]): Card[] {
  return cards.map((c) => {
    const { seconds, tip, clipKey, photoKey, ...rest } = c ?? ({} as Card)
    const okSecs = typeof seconds === 'number' && Number.isFinite(seconds) && seconds > 0
    const trimmed = typeof tip === 'string' ? tip.trim().slice(0, MAX_TIP) : ''
    return {
      ...rest,
      ...(okSecs ? { seconds: Math.min(Math.round(seconds as number), MAX_TIMER) } : {}),
      ...(trimmed ? { tip: trimmed } : {}),
      ...(isValidR2Key(clipKey) ? { clipKey } : {}),
      ...(isValidR2Key(photoKey) ? { photoKey } : {}),
    }
  })
}
// Legacy payload shape: a client from before Wave D sends the two media arrays
// beside the deck. Fold them onto the cards so the one write path serves both.
function foldLegacyArrays(cards: Card[], narration: unknown, photo: unknown): Card[] {
  const n = Array.isArray(narration) ? narration : []
  const p = Array.isArray(photo) ? photo : []
  return cards.map((c, i) => ({
    ...c,
    ...(c.clipKey === undefined && isValidR2Key(n[i]) ? { clipKey: n[i] as string } : {}),
    ...(c.photoKey === undefined && isValidR2Key(p[i]) ? { photoKey: p[i] as string } : {}),
  }))
}
// Per-step countdown timer state, persisted on today's run row so a tap-to-start
// timer survives leaving + reopening the app. A RUNNING (or just-finished) timer is
// stored as { endsAt } — the unix second it hits zero — so the player derives the
// real remaining from the wall clock on load, not a counter that froze when the app
// closed. A PAUSED one is { left } — the banked seconds remaining. Keyed by card idx.
type TimerEntry = { endsAt: number } | { left: number }
function normalizeTimer(v: unknown): TimerEntry | null {
  if (!v || typeof v !== 'object') return null
  const o = v as Record<string, unknown>
  if (typeof o.endsAt === 'number' && Number.isFinite(o.endsAt)) return { endsAt: Math.round(o.endsAt) }
  if (typeof o.left === 'number' && Number.isFinite(o.left) && o.left >= 0)
    return { left: Math.min(Math.round(o.left), MAX_TIMER) }
  return null
}
function sanitizeTimers(json: string | null | undefined): Record<number, TimerEntry> {
  const out: Record<number, TimerEntry> = {}
  if (!json) return out
  try {
    const obj = JSON.parse(json) as Record<string, unknown>
    if (obj && typeof obj === 'object')
      for (const [k, v] of Object.entries(obj)) {
        const idx = Number(k)
        const e = normalizeTimer(v)
        if (Number.isInteger(idx) && idx >= 0 && e) out[idx] = e
      }
  } catch {
    /* corrupt JSON → no timers (the step just starts fresh) */
  }
  return out
}

// The time-of-day cue ('morning'|'afternoon'|'evening'); anything else → null
// (anytime). An ordering hint for the kid view, never a gate.
const todOrNull = (v: unknown): string | null =>
  v === 'morning' || v === 'afternoon' || v === 'evening' ? v : null

// NOTE (dormant columns): routine_runs still carries `feeling` + `feeling_photo`
// from migration 0104 — the « Comment était ta journée » check-in that was removed.
// Migrations are forward-only and filename-locked, so the columns stay; nothing
// reads or writes them any more (and no handler mints an `rsf_` blob), so they
// simply sit NULL. A future migration may drop them.

// Compat for a client from before Wave D that still reads the two positional
// arrays: derived from the cards, never stored. Drop once every device has
// refreshed past 2026-09-08.
const sideArrays = (cards: readonly Card[]) => ({
  cardsNarration: cards.map((c) => c.clipKey ?? ''),
  cardsPhoto: cards.map((c) => c.photoKey ?? ''),
})

export const onRequestGet = authed(async (ctx, actor) => {
  const today = localDayStart(new Date(Date.now()))

  const routines = await ctx.env.DB.prepare(
    `SELECT r.id, r.member_id, r.name, r.cards_json, r.cards_narration_json, r.cards_photo_json, r.time_of_day,
            m.display_name AS member_name,
            m.colour AS color, m.avatar_kind AS avatar_kind, m.avatar_ref AS avatar_photo, m.companion AS companion
       FROM routines r LEFT JOIN members m ON m.id = r.member_id
      WHERE r.household_id = ? ORDER BY r.created_at`,
  )
    .bind(actor.householdId)
    .all<{
      id: string
      member_id: string
      name: string
      cards_json: string
      cards_narration_json: string | null
      cards_photo_json: string | null
      time_of_day: string | null
      member_name: string | null
      color: string | null
      avatar_kind: string | null
      avatar_photo: string | null
      companion: string | null
    }>()

  // Today's runs in one query, keyed by routine.
  const runs = await ctx.env.DB.prepare(
    `SELECT routine_id, done_idx_json, timers_json FROM routine_runs
      WHERE date = ? AND routine_id IN (SELECT id FROM routines WHERE household_id = ?)`,
  )
    .bind(today, actor.householdId)
    .all<{
      routine_id: string
      done_idx_json: string
      timers_json: string | null
    }>()
  const doneByRoutine = new Map(runs.results.map((r) => [r.routine_id, r.done_idx_json]))
  // Per-step countdown state so a started timer keeps real time across an app close.
  const timersByRoutine = new Map(runs.results.map((r) => [r.routine_id, r.timers_json]))

  const out = routines.results.map((r) => {
    // The media rides ON each card (clipKey / photoKey); the two legacy side
    // columns are only a fallback for a deck saved before Wave D.
    const cards = foldCardMedia(r.cards_json, r.cards_narration_json, r.cards_photo_json)
    return {
      id: r.id,
      memberId: r.member_id,
      memberName: r.member_name,
      color: r.color,
      avatarPhoto: r.avatar_kind === 'photo' ? r.avatar_photo : null,
      name: r.name,
      timeOfDay: todOrNull(r.time_of_day),
      // The owning member's chosen routine companion ('fox'|… , null = none) — a
      // calm creature the player + screensaver show; bound to time-of-day, never
      // to progress (see lib/companions). Additive; older clients ignore it.
      companion: r.companion,
      cards,
      // Compat only (derived from the cards) — see sideArrays.
      ...sideArrays(cards),
      doneIdx: parseJsonArray<number>(doneByRoutine.get(r.id), isNumber),
      // Per-step countdown timers (card idx → {endsAt}|{left}); {} when none started.
      timers: sanitizeTimers(timersByRoutine.get(r.id)),
    }
  })
  return ok({ routines: out, date: today })
})

export const onRequestPost = authed(async (ctx, actor) => {
  const body = await readJson<{
    memberId?: string
    memberIds?: string[]
    name?: string
    cards?: Card[]
    // Parallel parent-voice clip keys (feature #17 A) — same length as cards.
    cardsNarration?: unknown
    // Parallel card photo keys (feature #17 C) — same length as cards.
    cardsPhoto?: unknown
    timeOfDay?: string
  }>(ctx.request)
  // One routine can be assigned to several toddlers at once (e.g. the SAME
  // bedtime for two kids). We create one routine row PER child with the same
  // deck, so each toddler gets independent daily completion — Maya ticking her
  // teeth doesn't tick Léo's. Accepts memberIds[]; falls back to a single
  // memberId for older callers.
  const memberIds = (body?.memberIds?.length ? body.memberIds : body?.memberId ? [body.memberId] : [])
    .filter((m): m is string => typeof m === 'string' && m.length > 0)
    .slice(0, 8)
  if (!memberIds.length || !body?.name?.trim()) return badRequest('memberId(s) + nom requis.')
  const cards = sanitizeCards(foldLegacyArrays((body.cards ?? []).slice(0, 12), body.cardsNarration, body.cardsPhoto))
  const name = body.name.trim()
  const cardsJson = JSON.stringify(cards)
  // The media lives ON the cards now; the two legacy side columns are written
  // blank so a read never falls back to them for this row.
  const narrationJson = '[]'
  const photoJson = '[]'
  const tod = todOrNull(body.timeOfDay)
  const ts = nowSec()
  const ids = memberIds.map(() => newId())
  await ctx.env.DB.batch(
    memberIds.map((memberId, i) =>
      ctx.env.DB.prepare(
        'INSERT INTO routines (id, household_id, member_id, name, cards_json, cards_narration_json, cards_photo_json, time_of_day, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      ).bind(ids[i], actor.householdId, memberId, name, cardsJson, narrationJson, photoJson, tod, ts),
    ),
  )
  return ok({ ids })
})

// PATCH wears two hats: toggle a card done for today (the toddler's tap —
// kiosk-allowed), or retag the routine's time-of-day cue (operator-only).
export const onRequestPatch = authed(async (ctx, actor) => {
  const body = await readJson<{
    routineId?: string
    cardIdx?: number
    done?: boolean
    name?: string
    cards?: Card[]
    // Parallel parent-voice clip keys (feature #17 A) — same length as cards.
    cardsNarration?: unknown
    // Parallel card photo keys (feature #17 C) — same length as cards.
    cardsPhoto?: unknown
    timeOfDay?: string | null
    // Clear today's run (the "Recommencer" affordance) — wipes every ✓ so the
    // routine can be played again the same day. Deliberate, not a streak hook.
    reset?: boolean
    // Persist one card's countdown timer (with cardIdx): {endsAt}|{left}, or null to
    // clear it. Survives leaving the app so the timer reads real elapsed on return.
    timer?: unknown
  }>(ctx.request)
  if (!body?.routineId) return badRequest('routineId requis.')

  // Ownership check: the routine must belong to this household. We also read the
  // current deck + clip/photo arrays so a media-only edit (or a deck edit that
  // doesn't resend them) can keep them aligned by position.
  const owns = await ctx.env.DB.prepare(
    'SELECT cards_json, cards_narration_json, cards_photo_json FROM routines WHERE id = ? AND household_id = ?',
  )
    .bind(body.routineId, actor.householdId)
    .first<{ cards_json: string; cards_narration_json: string | null; cards_photo_json: string | null }>()
  if (!owns) return notFound('Routine introuvable.')

  // "Recommencer" — wipe today's progress so the routine plays fresh again. We
  // clear the row rather than write an empty array (no row = empty doneIdx, the
  // same state a brand-new day starts in; the next ✓ re-INSERTs it). Checked BEFORE
  // the cardIdx-less edit branch below — a reset carries neither cardIdx nor an edit
  // field, so leaving it after that branch made it fall into the "nothing to edit"
  // badRequest (Recommencer silently no-op'd server-side, resurrected on the next poll).
  if (body.reset === true) {
    const day = localDayStart(new Date(Date.now()))
    await ctx.env.DB.prepare('DELETE FROM routine_runs WHERE routine_id = ? AND date = ?')
      .bind(body.routineId, day)
      .run()
    return ok({ doneIdx: [] })
  }

  // Edit the routine itself (name / card deck / time-of-day cue) — a settings
  // act, not a toddler tap. Any of these fields present means "edit"; the same ＋
  // form that builds a routine also edits it in place. The tod-only shape (the
  // Réglages chip cycle) still lands here unchanged. A parent-mode kiosk may edit
  // too (only member admin + device pairing stay operator-only) — the toddler tap
  // path below is unaffected.
  if (body.cardIdx === undefined) {
    const editsContent =
      'timeOfDay' in body ||
      body.name !== undefined ||
      body.cards !== undefined ||
      body.cardsNarration !== undefined ||
      body.cardsPhoto !== undefined
    if (!editsContent) return badRequest('cardIdx, name, cards, cardsNarration, cardsPhoto ou timeOfDay requis.')
    const sets: string[] = []
    const binds: unknown[] = []
    if (typeof body.name === 'string' && body.name.trim()) {
      sets.push('name = ?')
      binds.push(body.name.trim())
    }
    // The current deck, media folded on (side columns as fallback for an old row).
    const prevCards = foldCardMedia(owns.cards_json, owns.cards_narration_json, owns.cards_photo_json)
    // The next deck: freshly sent cards (a legacy client's side arrays folded on),
    // else the current one with a legacy media-only edit folded on. Either way the
    // media rides ON the cards, and the two side columns are written blank.
    let nextCards: Card[] | null = null
    if (Array.isArray(body.cards)) nextCards = sanitizeCards(foldLegacyArrays(body.cards.slice(0, 12), body.cardsNarration, body.cardsPhoto))
    else if (body.cardsNarration !== undefined || body.cardsPhoto !== undefined) {
      const stripped = prevCards.map((c) => {
        const { clipKey, photoKey, ...rest } = c
        return {
          ...rest,
          ...(body.cardsNarration === undefined && clipKey ? { clipKey } : {}),
          ...(body.cardsPhoto === undefined && photoKey ? { photoKey } : {}),
        } as Card
      })
      nextCards = sanitizeCards(foldLegacyArrays(stripped, body.cardsNarration, body.cardsPhoto))
    }
    if (nextCards) {
      sets.push('cards_json = ?', 'cards_narration_json = ?', 'cards_photo_json = ?')
      binds.push(JSON.stringify(nextCards), '[]', '[]')
    }
    if ('timeOfDay' in body) {
      sets.push('time_of_day = ?')
      binds.push(todOrNull(body.timeOfDay))
    }
    if (!sets.length) return ok({ ok: true })
    binds.push(body.routineId, actor.householdId)
    await ctx.env.DB.prepare(`UPDATE routines SET ${sets.join(', ')} WHERE id = ? AND household_id = ?`)
      .bind(...binds)
      .run()
    // Free every clip or photo this edit dropped (best-effort, mirrors the recipe
    // step-image cleanup) — a swapped, cleared or removed card's blob would leak.
    if (ctx.env.PHOTOS && nextCards) {
      const kept = new Set(cardMediaKeys(nextCards))
      for (const k of cardMediaKeys(prevCards)) if (!kept.has(k)) await deleteR2Blob(ctx.env.PHOTOS, k)
    }
    return ok({ ok: true })
  }

  if (typeof body.cardIdx !== 'number') return badRequest('routineId + cardIdx requis.')

  const today = localDayStart(new Date(Date.now()))

  // Persist one card's countdown timer (tap-to-start / pause / clear). We merge into
  // the day's run row's timers_json without touching done_idx_json, so a running
  // timer and the ✓ progress coexist. No row yet → insert one with empty progress.
  if ('timer' in body) {
    const existing = await ctx.env.DB.prepare(
      'SELECT done_idx_json, timers_json FROM routine_runs WHERE routine_id = ? AND date = ?',
    )
      .bind(body.routineId, today)
      .first<{ done_idx_json: string; timers_json: string | null }>()
    const timers = sanitizeTimers(existing?.timers_json)
    const entry = normalizeTimer(body.timer)
    if (entry === null) delete timers[body.cardIdx]
    else timers[body.cardIdx] = entry
    const timersJson = Object.keys(timers).length ? JSON.stringify(timers) : null
    const ts = nowSec()
    if (existing) {
      await ctx.env.DB.prepare('UPDATE routine_runs SET timers_json = ?, updated_at = ? WHERE routine_id = ? AND date = ?')
        .bind(timersJson, ts, body.routineId, today)
        .run()
    } else {
      await ctx.env.DB.prepare(
        'INSERT INTO routine_runs (id, routine_id, date, done_idx_json, timers_json, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
      )
        .bind(newId(), body.routineId, today, '[]', timersJson, ts)
        .run()
    }
    return ok({ ok: true })
  }

  const existing = await ctx.env.DB.prepare(
    'SELECT done_idx_json FROM routine_runs WHERE routine_id = ? AND date = ?',
  )
    .bind(body.routineId, today)
    .first<{ done_idx_json: string }>()

  const set = new Set(parseJsonArray<number>(existing?.done_idx_json, isNumber))
  if (body.done === false) set.delete(body.cardIdx)
  else set.add(body.cardIdx)
  const json = JSON.stringify([...set])
  const ts = nowSec()

  if (existing) {
    await ctx.env.DB.prepare('UPDATE routine_runs SET done_idx_json = ?, updated_at = ? WHERE routine_id = ? AND date = ?')
      .bind(json, ts, body.routineId, today)
      .run()
  } else {
    await ctx.env.DB.prepare(
      'INSERT INTO routine_runs (id, routine_id, date, done_idx_json, updated_at) VALUES (?, ?, ?, ?, ?)',
    )
      .bind(newId(), body.routineId, today, json, ts)
      .run()
  }
  return ok({ doneIdx: [...set] })
})

export const onRequestDelete = authed(async (ctx, actor) => {
  const body = await readJson<{ id?: string }>(ctx.request)
  if (!body?.id) return badRequest('id requis.')
  // Free any R2 voice clips + card photos this routine's cards pointed at before
  // the row is gone (best-effort, mirrors the recipe step-image cleanup; a leaked
  // blob is harmless but R2 stays tidy). Reads the keys first; skips if R2 unbound.
  if (ctx.env.PHOTOS) {
    const owns = await ctx.env.DB.prepare(
      'SELECT cards_json, cards_narration_json, cards_photo_json FROM routines WHERE id = ? AND household_id = ?',
    )
      .bind(body.id, actor.householdId)
      .first<{ cards_json: string; cards_narration_json: string | null; cards_photo_json: string | null }>()
    if (owns) {
      for (const key of cardMediaKeys(foldCardMedia(owns.cards_json, owns.cards_narration_json, owns.cards_photo_json)))
        await deleteR2Blob(ctx.env.PHOTOS, key)
    }
  }
  // routine_runs.routine_id FK-references this routine, so D1 blocks the delete
  // until the daily runs are gone. Clear them first in one transaction. Runs are
  // scoped through the routine's own household guard, so a wrong household can't
  // wipe another's runs.
  await ctx.env.DB.batch([
    ctx.env.DB.prepare(
      'DELETE FROM routine_runs WHERE routine_id IN (SELECT id FROM routines WHERE id = ? AND household_id = ?)',
    ).bind(body.id, actor.householdId),
    ctx.env.DB.prepare('DELETE FROM routines WHERE id = ? AND household_id = ?').bind(
      body.id,
      actor.householdId,
    ),
  ])
  return ok({ ok: true })
})
