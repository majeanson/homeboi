import { badRequest, notFound, ok, parseJsonArray, readJson } from '../_lib/json'
import { authed } from '../_lib/route'
import { localDayStart, newId, nowSec } from '../_lib/ids'
import { deleteR2Blob } from '../_lib/r2'
import { isValidR2Key } from '../_lib/validate'

// Kid-view visual routines. GET returns each routine with TODAY's completion
// set (which resets daily — the day empties, NFR-CALM-4). "Today" is the
// household's LOCAL day (America/Toronto via localDayStart), so a finished
// routine clears at local MIDNIGHT and can be done again the next morning —
// not at UTC midnight (≈8 PM local), which used to reset it mid-bedtime. POST creates a
// routine (operator). PATCH toggles one card done for today (kiosk-friendly:
// the three-year-old taps it) — or, operator-only, retags the routine's
// time-of-day cue.
interface Card {
  icon: string
  label: string
  narration?: string
  // Optional per-step countdown in seconds (e.g. 120 = a 2-minute teeth brush).
  // The player offers a tap-to-start timer; it's a calm aid, never a gate. A
  // missing/0 value means "no timer". Stored inline in cards_json (no migration).
  seconds?: number
}

const isNumber = (v: unknown): v is number => typeof v === 'number'

// Cards are stored as the client sends them, but the one numeric field a bad
// payload could wedge the countdown UI with is the per-step timer — clamp it to a
// whole number of seconds in a calm range, or drop the key. Every other field
// (icon / label / narration) passes through unchanged, as it always has.
const MAX_TIMER = 3600 // an hour: a sane ceiling — no routine step needs more
function sanitizeCards(cards: Card[]): Card[] {
  return cards.map((c) => {
    const { seconds, ...rest } = c ?? ({} as Card)
    const ok = typeof seconds === 'number' && Number.isFinite(seconds) && seconds > 0
    return ok ? { ...rest, seconds: Math.min(Math.round(seconds as number), MAX_TIMER) } : rest
  })
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

// Per-card media key arrays kept PARALLEL to cards: side[i] is the R2 key for
// card i, or '' when that card has no media. Two of them today — parent-voice
// narration clips (feature #17 A, migration 0040) and card photos (feature #17 C,
// migration 0042) — share this one normalizer. We keep each the SAME LENGTH as
// the deck so the kid view can index it positionally — pad/trim to `count` and
// validate each entry is an R2-key-shaped token ('' otherwise) so a client can't
// stuff junk into the column. Defensive on read: a bad/short row reads as all-''.
function normalizeKeys(v: unknown, count: number): string[] {
  const src = parseJsonArray<unknown>(typeof v === 'string' ? v : JSON.stringify(v ?? []))
  const out: string[] = []
  for (let i = 0; i < count; i++) out.push(isValidR2Key(src[i]) ? (src[i] as string) : '')
  return out
}

export const onRequestGet = authed(async (ctx, actor) => {
  const today = localDayStart(new Date(Date.now()))

  const routines = await ctx.env.DB.prepare(
    `SELECT r.id, r.member_id, r.name, r.cards_json, r.cards_narration_json, r.cards_photo_json, r.time_of_day,
            m.display_name AS member_name,
            m.colour AS color, m.avatar_kind AS avatar_kind, m.avatar_ref AS avatar_photo
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
    }>()

  // Today's runs in one query, keyed by routine.
  const runs = await ctx.env.DB.prepare(
    `SELECT routine_id, done_idx_json, timers_json FROM routine_runs
      WHERE date = ? AND routine_id IN (SELECT id FROM routines WHERE household_id = ?)`,
  )
    .bind(today, actor.householdId)
    .all<{ routine_id: string; done_idx_json: string; timers_json: string | null }>()
  const doneByRoutine = new Map(runs.results.map((r) => [r.routine_id, r.done_idx_json]))
  // Per-step countdown state so a started timer keeps real time across an app close.
  const timersByRoutine = new Map(runs.results.map((r) => [r.routine_id, r.timers_json]))

  const out = routines.results.map((r) => {
    const cards = parseJsonArray<Card>(r.cards_json)
    return {
      id: r.id,
      memberId: r.member_id,
      memberName: r.member_name,
      color: r.color,
      avatarPhoto: r.avatar_kind === 'photo' ? r.avatar_photo : null,
      name: r.name,
      timeOfDay: todOrNull(r.time_of_day),
      cards,
      // Parallel parent-voice clips, one R2 key per card ('' = none → TTS).
      cardsNarration: normalizeKeys(r.cards_narration_json, cards.length),
      // Parallel card photos, one R2 key per card ('' = none → the card's emoji).
      cardsPhoto: normalizeKeys(r.cards_photo_json, cards.length),
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
  const cards = sanitizeCards((body.cards ?? []).slice(0, 12))
  const name = body.name.trim()
  const cardsJson = JSON.stringify(cards)
  // Keep the clip + photo arrays parallel + same-length as the deck (feature #17 A/C).
  const narrationJson = JSON.stringify(normalizeKeys(body.cardsNarration, cards.length))
  const photoJson = JSON.stringify(normalizeKeys(body.cardsPhoto, cards.length))
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
    // The deck whose length governs the parallel clip array: the freshly sent
    // cards when editing them, else the routine's current deck.
    const newCards = Array.isArray(body.cards) ? sanitizeCards(body.cards.slice(0, 12)) : null
    const deckLen = (newCards ?? parseJsonArray<Card>(owns.cards_json)).length
    if (newCards) {
      sets.push('cards_json = ?')
      binds.push(JSON.stringify(newCards))
    }
    // Clips: a fresh array re-aligns to the deck; otherwise re-pad the existing
    // one to the (possibly new) deck length so a card add/remove never desyncs.
    // Same free-the-dropped-blob discipline as photos below — clearing/swapping/
    // removing a card's voice clip must free its R2 audio, or it leaks.
    const prevNarration = normalizeKeys(owns.cards_narration_json, parseJsonArray<Card>(owns.cards_json).length)
    let nextNarration: string[] | null = null
    if (body.cardsNarration !== undefined) nextNarration = normalizeKeys(body.cardsNarration, deckLen)
    else if (newCards) nextNarration = normalizeKeys(owns.cards_narration_json, deckLen)
    if (nextNarration) {
      sets.push('cards_narration_json = ?')
      binds.push(JSON.stringify(nextNarration))
    }
    // Photos: same alignment discipline as the clips above (feature #17 C). We
    // resolve the new key list now (when the edit touches it) so any photo no
    // longer referenced can be freed from R2 after the write — a swapped or
    // removed card photo would otherwise leak its blob.
    const prevPhotos = normalizeKeys(owns.cards_photo_json, parseJsonArray<Card>(owns.cards_json).length)
    let nextPhotos: string[] | null = null
    if (body.cardsPhoto !== undefined) nextPhotos = normalizeKeys(body.cardsPhoto, deckLen)
    else if (newCards) nextPhotos = normalizeKeys(owns.cards_photo_json, deckLen)
    if (nextPhotos) {
      sets.push('cards_photo_json = ?')
      binds.push(JSON.stringify(nextPhotos))
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
    // Free any card photo this edit dropped (best-effort, mirrors the recipe
    // step-image cleanup). Only when the edit actually resolved a new photo list.
    if (ctx.env.PHOTOS && nextPhotos) {
      const kept = new Set(nextPhotos)
      for (const k of prevPhotos) if (k && !kept.has(k)) await deleteR2Blob(ctx.env.PHOTOS, k)
    }
    // Same for narration clips — free any voice clip this edit dropped.
    if (ctx.env.PHOTOS && nextNarration) {
      const kept = new Set(nextNarration)
      for (const k of prevNarration) if (k && !kept.has(k)) await deleteR2Blob(ctx.env.PHOTOS, k)
    }
    return ok({ ok: true })
  }

  // "Recommencer" — wipe today's progress so the routine plays fresh again. We
  // clear the row rather than write an empty array (no row = empty doneIdx, the
  // same state a brand-new day starts in; the next ✓ re-INSERTs it).
  if (body.reset === true) {
    await ctx.env.DB.prepare('DELETE FROM routine_runs WHERE routine_id = ? AND date = ?')
      .bind(body.routineId, localDayStart(new Date(Date.now())))
      .run()
    return ok({ doneIdx: [] })
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
      const cards = parseJsonArray<Card>(owns.cards_json)
      for (const key of normalizeKeys(owns.cards_narration_json, cards.length)) await deleteR2Blob(ctx.env.PHOTOS, key)
      for (const key of normalizeKeys(owns.cards_photo_json, cards.length)) await deleteR2Blob(ctx.env.PHOTOS, key)
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
