import type { Env } from '../_lib/env'
import { badRequest, ok, readJson, withAiError } from '../_lib/json'
import { authed } from '../_lib/route'
import { type Actor } from '../_lib/household'
import { classifyCapture, resolveLang, type Intent } from '../_lib/ai'
import { aiUsable } from '../_lib/aiPref'
import { localDayStart, newId, nowSec } from '../_lib/ids'
import { parseWhen } from '../_lib/whenparse'
import { profileMemberId } from '../_lib/profile'
import { resolveMemberByName } from '../_lib/members'

// THE SPINE. One free-text (or already-transcribed voice) capture in; the
// intent-router classifies it; we route it to the right table. Every capture
// is logged raw first, so a misroute never loses the words and can be
// re-classified later. Works for both operator and kiosk actors.
//
// If `forceType` is sent (the manual type-picker shown when AI is degraded, or
// a correction of a misroute), we skip classification and use it directly.
//
// A correction also passes `undo` — the exact rows the FIRST routing inserted
// (returned to the client as `routed.cleanup`). We delete those before re-routing,
// so "non, plutôt…" moves the capture to the right place instead of duplicating it.
// This also covers the degraded path, where the fallback note is auto-created and
// must be removed when the human then picks the real type.
export const onRequestPost = authed(async (ctx, actor) => {
  const body = await readJson<{
    text?: string
    source?: string
    forceType?: Intent['type']
    undo?: Cleanup[]
  }>(ctx.request)
  const text = body?.text?.trim()
  if (!text) return badRequest('Texte vide.')
  const source = body?.source === 'voice' ? 'voice' : 'text'

  // Undo the previous (mis)routing before we lay down the corrected row.
  if (body?.undo) await applyCleanup(ctx.env, actor.householdId, body.undo)

  // A fresh sink per request: if the router's AI call fails (it still degrades to
  // a note), report.error gets the message and we tag the response so the client
  // can pop the acknowledge-into-log notice.
  const report = { error: null as string | null }
  // AI off (binding unset OR household switched it off in Réglages ▸ IA) → skip the
  // router entirely and degrade to a note, exactly like an AI failure. The capture
  // is still logged raw + the human can re-route it, so nothing is lost.
  const aiOn = await aiUsable(ctx.env, actor)
  const intent: Intent = body?.forceType
    ? { type: body.forceType, payload: { text, title: text, item: text } }
    : aiOn
      ? await classifyCapture(ctx.env, text, resolveLang(ctx.env, ctx.request), report)
      : { type: 'note', payload: { text, title: text, item: text }, degraded: true }

  const ts = nowSec()
  await ctx.env.DB.prepare(
    'INSERT INTO captures (id, household_id, raw_text, source, resolved_type, created_at) VALUES (?, ?, ?, ?, ?, ?)',
  )
    .bind(newId(), actor.householdId, text, source, intent.type, ts)
    .run()

  const routed = await routeIntent(ctx.env, actor, intent, text, ts, profileMemberId(ctx.request))

  return withAiError(ok({ type: intent.type, degraded: intent.degraded ?? false, routed }), report)
})

// One row a routing inserted, named so the client can ask us to undo it on a
// correction. `table` is checked against an allowlist before it touches SQL.
type Cleanup = { table: string; id: string }

// Only these tables can be cleaned up, and only within the actor's household — so
// a round-tripped ref grants no reach the actor doesn't already have.
const CLEANUP_TABLES = new Set(['events', 'tasks', 'list_items', 'pantry_low', 'meals', 'meal_leftovers', 'notes'])

async function applyCleanup(env: Env, hh: string, undo: Cleanup[]): Promise<void> {
  const dels = (Array.isArray(undo) ? undo : [])
    .filter((r) => r && typeof r.id === 'string' && typeof r.table === 'string' && CLEANUP_TABLES.has(r.table))
    .map((r) => env.DB.prepare(`DELETE FROM ${r.table} WHERE id = ? AND household_id = ?`).bind(r.id, hh))
  if (dels.length) await env.DB.batch(dels)
}

// The valid meal slots — the router's proposed slot is checked against these
// before it reaches the row (mirrors functions/api/meals.ts).
const MEAL_SLOTS = new Set(['breakfast', 'lunch', 'supper', 'snack', 'dessert'])

async function routeIntent(
  env: Env,
  actor: Actor,
  intent: Intent,
  raw: string,
  ts: number,
  addedBy: string | null,
): Promise<{ kind: string; label: string; cleanup: Cleanup[] }> {
  const hh = actor.householdId
  const p = intent.payload

  // "...pour Léa", "...for Dad": the router echoes a person hint; resolve it to a
  // real member so the thing lands ON that person (event/meal/chore), not just in
  // the words. Read-only and forgiving — an unmatched name simply assigns no one.
  const forMember = await resolveMemberByName(env, hh, p.person)
  // Append " · Name" to the ack so the capture confirms WHO it was filed for.
  const withWho = (label: string) => (forMember ? `${label} · ${forMember.displayName}` : label)

  switch (intent.type) {
    case 'event': {
      const { startAt, allDay } = parseWhen(p.when, Date.now())
      const title = p.title || raw
      const id = newId()
      await env.DB.prepare(
        'INSERT INTO events (id, household_id, member_id, title, start_at, all_day, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      )
        .bind(id, hh, forMember?.id ?? null, title, startAt, allDay ? 1 : 0, ts)
        .run()
      return { kind: 'event', label: withWho(title), cleanup: [{ table: 'events', id }] }
    }
    case 'task': {
      const title = p.title || raw
      const id = newId()
      // A named person ("Léa sort les vidanges") becomes a one-person rotation, so
      // the chore shows as their turn; no name → the open, unassigned rotation.
      const rotation = forMember ? JSON.stringify([forMember.id]) : '[]'
      await env.DB.prepare(
        'INSERT INTO tasks (id, household_id, title, rotation_json, created_at) VALUES (?, ?, ?, ?, ?)',
      )
        .bind(id, hh, title, rotation, ts)
        .run()
      return { kind: 'task', label: withWho(title), cleanup: [{ table: 'tasks', id }] }
    }
    case 'list-item': {
      const itemText = p.item || p.text || raw
      const id = newId()
      await env.DB.prepare(
        'INSERT INTO list_items (id, household_id, text, source, added_by, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      )
        .bind(id, hh, itemText, 'capture', addedBy, ts)
        .run()
      return { kind: 'list-item', label: itemText, cleanup: [{ table: 'list_items', id }] }
    }
    case 'pantry-low': {
      // Two writes: record the "low" flag AND drop it on the shared list, so a
      // running-low item shows up where someone will actually buy it.
      const item = p.item || raw
      const lowId = newId()
      const listId = newId()
      await env.DB.batch([
        env.DB.prepare('INSERT INTO pantry_low (id, household_id, item, marked_at) VALUES (?, ?, ?, ?)').bind(
          lowId,
          hh,
          item,
          ts,
        ),
        env.DB.prepare(
          'INSERT INTO list_items (id, household_id, text, source, added_by, created_at) VALUES (?, ?, ?, ?, ?, ?)',
        ).bind(listId, hh, item, 'pantry-low', addedBy, ts),
      ])
      return {
        kind: 'pantry-low',
        label: item,
        cleanup: [
          { table: 'pantry_low', id: lowId },
          { table: 'list_items', id: listId },
        ],
      }
    }
    case 'meal': {
      const { startAt } = parseWhen(p.when, Date.now())
      // meals.date is a household-LOCAL midnight (day-bucketed, no time-of-day) —
      // snap whatever parseWhen resolved to that day, like the leftover branch.
      const date = localDayStart(new Date(startAt * 1000))
      const title = p.title || raw
      // Validate the slot the router proposed — never trust it blindly into the row.
      const slot = p.slot && MEAL_SLOTS.has(p.slot) ? p.slot : 'supper'
      const id = newId()
      // A named person is the cook ("souper tacos jeudi, Marc cuisine") — feeds the
      // board's "ce soir" cook row.
      await env.DB.prepare(
        'INSERT INTO meals (id, household_id, date, slot, title, cook_member_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      )
        .bind(id, hh, date, slot, title, forMember?.id ?? null, ts)
        .run()
      return { kind: 'meal', label: withWho(title), cleanup: [{ table: 'meals', id }] }
    }
    case 'leftover': {
      // A cooked dish with extra. With a STATED day ("...pour demain") it's a real
      // badged meal on that day; with no day it lands in the undated "Restants à
      // finir" pool (like pantry-low's complement, it never touches the shopping
      // list). No quantity either way. Planning a pooled one happens later from the
      // kitchen's Restants strip.
      const title = p.title || p.item || raw
      if (p.when) {
        const { startAt } = parseWhen(p.when, Date.now())
        const date = localDayStart(new Date(startAt * 1000))
        const slot = p.slot && MEAL_SLOTS.has(p.slot) ? p.slot : 'supper'
        const id = newId()
        await env.DB.prepare(
          'INSERT INTO meals (id, household_id, date, slot, title, cook_member_id, created_at, is_leftover) VALUES (?, ?, ?, ?, ?, ?, ?, 1)',
        )
          .bind(id, hh, date, slot, title, forMember?.id ?? null, ts)
          .run()
        return { kind: 'leftover', label: withWho(title), cleanup: [{ table: 'meals', id }] }
      }
      const id = newId()
      await env.DB.prepare(
        'INSERT INTO meal_leftovers (id, household_id, title, created_at) VALUES (?, ?, ?, ?)',
      )
        .bind(id, hh, title, ts)
        .run()
      return { kind: 'leftover', label: title, cleanup: [{ table: 'meal_leftovers', id }] }
    }
    case 'note':
    default: {
      // A note now has a home: the `notes` table, shown on the Aujourd'hui board
      // until cleared (and still in `captures` as the audit row for re-classify).
      // Clamp to the same 280 the notes endpoint enforces — one capture can't bloat
      // the board payload.
      const noteText = (p.text || raw).slice(0, 280)
      const id = newId()
      await env.DB.prepare(
        'INSERT INTO notes (id, household_id, text, member_id, created_at) VALUES (?, ?, ?, ?, ?)',
      )
        .bind(id, hh, noteText, addedBy, ts)
        .run()
      return { kind: 'note', label: noteText, cleanup: [{ table: 'notes', id }] }
    }
  }
}
