import type { Env } from '../_lib/env'
import { badRequest, ok, readJson } from '../_lib/json'
import { authed } from '../_lib/route'
import { type Actor } from '../_lib/household'
import { classifyCapture, resolveLang, type Intent } from '../_lib/ai'
import { newId, nowSec } from '../_lib/ids'
import { parseWhen } from '../_lib/whenparse'
import { profileMemberId } from '../_lib/profile'

// THE SPINE. One free-text (or already-transcribed voice) capture in; the
// intent-router classifies it; we route it to the right table. Every capture
// is logged raw first, so a misroute never loses the words and can be
// re-classified later. Works for both operator and kiosk actors.
//
// If `forceType` is sent (the manual type-picker shown when AI is degraded, or
// a correction of a misroute), we skip classification and use it directly.
export const onRequestPost = authed(async (ctx, actor) => {
  const body = await readJson<{ text?: string; source?: string; forceType?: Intent['type'] }>(ctx.request)
  const text = body?.text?.trim()
  if (!text) return badRequest('Texte vide.')
  const source = body?.source === 'voice' ? 'voice' : 'text'

  const intent: Intent = body?.forceType
    ? { type: body.forceType, payload: { text, title: text, item: text } }
    : await classifyCapture(ctx.env, text, resolveLang(ctx.env, ctx.request))

  const ts = nowSec()
  await ctx.env.DB.prepare(
    'INSERT INTO captures (id, household_id, raw_text, source, resolved_type, created_at) VALUES (?, ?, ?, ?, ?, ?)',
  )
    .bind(newId(), actor.householdId, text, source, intent.type, ts)
    .run()

  const routed = await routeIntent(ctx.env, actor, intent, text, ts, profileMemberId(ctx.request))

  return ok({ type: intent.type, degraded: intent.degraded ?? false, routed })
})

async function routeIntent(
  env: Env,
  actor: Actor,
  intent: Intent,
  raw: string,
  ts: number,
  addedBy: string | null,
): Promise<{ kind: string; label: string }> {
  const hh = actor.householdId
  const p = intent.payload

  switch (intent.type) {
    case 'event': {
      const { startAt, allDay } = parseWhen(p.when, Date.now())
      const title = p.title || raw
      await env.DB.prepare(
        'INSERT INTO events (id, household_id, title, start_at, all_day, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      )
        .bind(newId(), hh, title, startAt, allDay ? 1 : 0, ts)
        .run()
      return { kind: 'event', label: title }
    }
    case 'task': {
      const title = p.title || raw
      await env.DB.prepare(
        'INSERT INTO tasks (id, household_id, title, created_at) VALUES (?, ?, ?, ?)',
      )
        .bind(newId(), hh, title, ts)
        .run()
      return { kind: 'task', label: title }
    }
    case 'list-item': {
      const itemText = p.item || p.text || raw
      await env.DB.prepare(
        'INSERT INTO list_items (id, household_id, text, source, added_by, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      )
        .bind(newId(), hh, itemText, 'capture', addedBy, ts)
        .run()
      return { kind: 'list-item', label: itemText }
    }
    case 'pantry-low': {
      // Two writes: record the "low" flag AND drop it on the shared list, so a
      // running-low item shows up where someone will actually buy it.
      const item = p.item || raw
      await env.DB.batch([
        env.DB.prepare('INSERT INTO pantry_low (id, household_id, item, marked_at) VALUES (?, ?, ?, ?)').bind(
          newId(),
          hh,
          item,
          ts,
        ),
        env.DB.prepare(
          'INSERT INTO list_items (id, household_id, text, source, added_by, created_at) VALUES (?, ?, ?, ?, ?, ?)',
        ).bind(newId(), hh, item, 'pantry-low', addedBy, ts),
      ])
      return { kind: 'pantry-low', label: item }
    }
    case 'meal': {
      const { startAt } = parseWhen(p.when, Date.now())
      const title = p.title || raw
      await env.DB.prepare(
        'INSERT INTO meals (id, household_id, date, slot, title, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      )
        .bind(newId(), hh, startAt, p.slot || 'supper', title, ts)
        .run()
      return { kind: 'meal', label: title }
    }
    case 'note':
    default: {
      // A note now has a home: the `notes` table, shown on the Aujourd'hui board
      // until cleared (and still in `captures` as the audit row for re-classify).
      const noteText = p.text || raw
      await env.DB.prepare(
        'INSERT INTO notes (id, household_id, text, member_id, created_at) VALUES (?, ?, ?, ?, ?)',
      )
        .bind(newId(), hh, noteText, addedBy, ts)
        .run()
      return { kind: 'note', label: noteText }
    }
  }
}
