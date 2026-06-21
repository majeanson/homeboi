import { badRequest, notFound, ok, readJson } from '../_lib/json'
import { authed } from '../_lib/route'
import { dayStart, newId, nowSec } from '../_lib/ids'
import { normalizeRecur } from '../_lib/recur'

// Events (the agenda the board merges). Until now events could only be born from
// a capture; this is the operator's direct CRUD so a typo can be fixed and a
// cancelled thing removed. GET is open to any actor (the management list); the
// writes accept any actor — a parent-mode kiosk may edit the agenda too (only
// member admin + device pairing stay operator-only). The board reads events
// through /api/board, not here.
//
// An event may RECUR (recur_json: a {freq,interval?,weekdays?} rule). start_at is
// the anchor; the board expands the series. See _lib/recur.
export const onRequestGet = authed(async (ctx, actor) => {
  // Upcoming one-offs (today forward) PLUS every recurring series (whose anchor
  // may be in the past, e.g. "garbage every Wednesday" set weeks ago).
  const today = dayStart(new Date(Date.now()))
  const { results } = await ctx.env.DB.prepare(
    `SELECT id, title, start_at, all_day, member_id, contact_id, business_id, recur_json, lead_seconds,
            (SELECT first_name FROM contacts WHERE contacts.id = events.contact_id) AS contact_name,
            (SELECT name FROM businesses WHERE businesses.id = events.business_id) AS business_name,
            (SELECT colour FROM businesses WHERE businesses.id = events.business_id) AS business_colour
       FROM events
      WHERE household_id = ? AND (recur_json IS NOT NULL OR start_at >= ?)
      ORDER BY start_at LIMIT 100`,
  )
    .bind(actor.householdId, today)
    .all()
  return ok({ events: results })
})

interface EventBody {
  id?: string
  title?: string
  startAt?: number
  allDay?: boolean
  memberId?: string | null
  contactId?: string | null // #21: a « Le cercle » contact instead of a member
  businessId?: string | null // a « Le cercle » Business (vet, plumber…) — a rendez-vous
  recur?: unknown // {freq,interval?,weekdays?} or null/absent for a one-off
  leadSeconds?: number | null // calm "Bientôt" lead window; null/absent = no reminder
}

const recurJson = (recur: unknown): string | null => {
  const r = normalizeRecur(recur)
  return r ? JSON.stringify(r) : null
}

// An event's "who" is exactly one of business / contact / member. Precedence
// (business → contact → member) so a picked business wins and the others null out —
// the rendez-vous keeps a single, unambiguous answer.
function pickWho(body: EventBody): { businessId: string | null; contactId: string | null; memberId: string | null } {
  const businessId = body.businessId ?? null
  const contactId = businessId ? null : body.contactId ?? null
  const memberId = businessId || contactId ? null : body.memberId ?? null
  return { businessId, contactId, memberId }
}

// How far before the event the board flags it "Bientôt" (calm emphasis, never a
// push — NFR-CALM-1). Clamp to null or [1 s .. 7 days]; 0/absent/garbage = no
// reminder. 7-day cap matches the board's À venir window — a longer lead would
// have nothing to highlight against.
const MAX_LEAD = 7 * 86400
const leadSeconds = (v: unknown): number | null => {
  const n = Number(v)
  return Number.isFinite(n) && n > 0 ? Math.min(Math.floor(n), MAX_LEAD) : null
}

export const onRequestPost = authed(async (ctx, actor) => {
  const body = await readJson<EventBody>(ctx.request)
  const title = body?.title?.trim()
  if (!title || typeof body?.startAt !== 'number') return badRequest('Titre + date requis.')
  const id = newId()
  // An event's "who" is exactly one of business / contact / member — picking one
  // clears the others so the rendez-vous stays a single, unambiguous answer.
  const { businessId, contactId, memberId } = pickWho(body)
  await ctx.env.DB.prepare(
    'INSERT INTO events (id, household_id, member_id, contact_id, business_id, title, start_at, all_day, recur_json, lead_seconds, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  )
    .bind(
      id,
      actor.householdId,
      memberId,
      contactId,
      businessId,
      title,
      Math.floor(body.startAt),
      body.allDay ? 1 : 0,
      recurJson(body.recur),
      leadSeconds(body.leadSeconds),
      nowSec(),
    )
    .run()
  return ok({ id, title })
})

export const onRequestPatch = authed(async (ctx, actor) => {
  const body = await readJson<EventBody>(ctx.request)
  const title = body?.title?.trim()
  if (!body?.id || !title || typeof body?.startAt !== 'number') return badRequest('id + titre + date requis.')
  const { businessId, contactId, memberId } = pickWho(body)
  const res = await ctx.env.DB.prepare(
    'UPDATE events SET title = ?, start_at = ?, all_day = ?, member_id = ?, contact_id = ?, business_id = ?, recur_json = ?, lead_seconds = ? WHERE id = ? AND household_id = ?',
  )
    .bind(
      title,
      Math.floor(body.startAt),
      body.allDay ? 1 : 0,
      memberId,
      contactId,
      businessId,
      recurJson(body.recur),
      leadSeconds(body.leadSeconds),
      body.id,
      actor.householdId,
    )
    .run()
  if (!res.meta.changes) return notFound('Rendez-vous introuvable.')
  return ok({ ok: true })
})

export const onRequestDelete = authed(async (ctx, actor) => {
  const body = await readJson<{ id?: string }>(ctx.request)
  if (!body?.id) return badRequest('id requis.')
  await ctx.env.DB.prepare('DELETE FROM events WHERE id = ? AND household_id = ?')
    .bind(body.id, actor.householdId)
    .run()
  return ok({ ok: true })
})
