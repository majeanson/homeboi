import { ok } from '../_lib/json'
import { authed } from '../_lib/route'
import { localDayStart } from '../_lib/ids'

// « Depuis ce matin » (A-3, bmad/10) — pull-only "what changed today" peek off the
// board greeting. NOT a feed: no polling, no unread state, nothing kept once the
// sheet closes (see TodayChangesSheet.tsx — gcTime:0, fetch-on-open only). This
// endpoint is the one cold read: six small selects over EXISTING created_at +
// attribution columns, unioned and returned newest-first-ish (the client's pure
// composer, src/lib/sinceMorning.ts, does the final cross-source sort + cap so
// that logic stays unit-tested there rather than duplicated here).
//
// Deliberately EXCLUDED: `mots` (member-to-member messages — already addressed/
// scheduled, would double-surface), and chore/todo/pantry churn (routine upkeep,
// not "what happened" — the chore ledger already covers that ground calmly).
// Events are FACE-LESS on purpose (decided, A-3 of 10-plan.md): an event has no
// author column, so its line never claims a face, just the fact.
//
// Guest actor → { entries: [] } immediately, no query — a babysitter never gets
// a peek into who-did-what.
//
// Each source is capped at 20 rows (bounds the worst case; the client caps the
// merged, sorted result to ~20 for the actual display cap).
const PER_SOURCE_LIMIT = 20

interface ChangeRow {
  id: string
  kind: 'list_item' | 'meal' | 'note' | 'day_note' | 'drawing' | 'event'
  at: number
  text: string
  memberId: string | null
  name: string | null
  avatarKind: string | null
  avatarRef: string | null
  colour: string | null
  authorLabel: string | null
}

export const onRequestGet = authed(async (ctx, actor) => {
  if (actor.scope === 'guest') return ok({ entries: [] })

  const hh = actor.householdId
  const since = localDayStart(new Date(Date.now()))
  const db = ctx.env.DB

  const [listItems, meals, notes, dayNotes, drawings, events] = await Promise.all([
    db
      .prepare(
        `SELECT li.id, li.text, li.created_at AS at, li.added_by AS member_id,
                m.display_name AS name, m.avatar_kind, m.avatar_ref, m.colour
           FROM list_items li
           LEFT JOIN members m ON m.id = li.added_by
          WHERE li.household_id = ? AND li.created_at >= ?
          ORDER BY li.created_at DESC LIMIT ?`,
      )
      .bind(hh, since, PER_SOURCE_LIMIT)
      .all<{
        id: string
        text: string
        at: number
        member_id: string | null
        name: string | null
        avatar_kind: string | null
        avatar_ref: string | null
        colour: string | null
      }>(),
    // Only kid-suggested meals carry attribution (suggested_by is cleared the
    // moment a parent sets the slot directly) — a plain parent-set meal has no
    // "who" and would misread as "Quelqu'un a proposé …", so it's excluded.
    db
      .prepare(
        `SELECT me.id, me.title, me.created_at AS at, me.suggested_by AS member_id,
                m.display_name AS name, m.avatar_kind, m.avatar_ref, m.colour
           FROM meals me
           LEFT JOIN members m ON m.id = me.suggested_by
          WHERE me.household_id = ? AND me.created_at >= ? AND me.suggested_by IS NOT NULL
          ORDER BY me.created_at DESC LIMIT ?`,
      )
      .bind(hh, since, PER_SOURCE_LIMIT)
      .all<{
        id: string
        title: string
        at: number
        member_id: string | null
        name: string | null
        avatar_kind: string | null
        avatar_ref: string | null
        colour: string | null
      }>(),
    db
      .prepare(
        `SELECT n.id, n.text, n.created_at AS at, n.member_id, n.author_label,
                m.display_name AS name, m.avatar_kind, m.avatar_ref, m.colour
           FROM notes n
           LEFT JOIN members m ON m.id = n.member_id
          WHERE n.household_id = ? AND n.created_at >= ?
          ORDER BY n.created_at DESC LIMIT ?`,
      )
      .bind(hh, since, PER_SOURCE_LIMIT)
      .all<{
        id: string
        text: string
        at: number
        member_id: string | null
        author_label: string | null
        name: string | null
        avatar_kind: string | null
        avatar_ref: string | null
        colour: string | null
      }>(),
    db
      .prepare(
        `SELECT dn.id, dn.text, dn.created_at AS at, dn.member_id,
                m.display_name AS name, m.avatar_kind, m.avatar_ref, m.colour
           FROM day_notes dn
           LEFT JOIN members m ON m.id = dn.member_id
          WHERE dn.household_id = ? AND dn.created_at >= ?
          ORDER BY dn.created_at DESC LIMIT ?`,
      )
      .bind(hh, since, PER_SOURCE_LIMIT)
      .all<{
        id: string
        text: string
        at: number
        member_id: string | null
        name: string | null
        avatar_kind: string | null
        avatar_ref: string | null
        colour: string | null
      }>(),
    db
      .prepare(
        `SELECT d.id, d.created_at AS at, d.member_id,
                m.display_name AS name, m.avatar_kind, m.avatar_ref, m.colour
           FROM drawings d
           LEFT JOIN members m ON m.id = d.member_id
          WHERE d.household_id = ? AND d.created_at >= ?
          ORDER BY d.created_at DESC LIMIT ?`,
      )
      .bind(hh, since, PER_SOURCE_LIMIT)
      .all<{
        id: string
        at: number
        member_id: string | null
        name: string | null
        avatar_kind: string | null
        avatar_ref: string | null
        colour: string | null
      }>(),
    db
      .prepare(
        `SELECT id, title, created_at AS at
           FROM events
          WHERE household_id = ? AND created_at >= ?
          ORDER BY created_at DESC LIMIT ?`,
      )
      .bind(hh, since, PER_SOURCE_LIMIT)
      .all<{ id: string; title: string; at: number }>(),
  ])

  const entries: ChangeRow[] = [
    ...listItems.results.map((r) => ({
      id: r.id,
      kind: 'list_item' as const,
      at: r.at,
      text: r.text,
      memberId: r.member_id,
      name: r.name,
      avatarKind: r.avatar_kind,
      avatarRef: r.avatar_ref,
      colour: r.colour,
      authorLabel: null,
    })),
    ...meals.results.map((r) => ({
      id: r.id,
      kind: 'meal' as const,
      at: r.at,
      text: r.title,
      memberId: r.member_id,
      name: r.name,
      avatarKind: r.avatar_kind,
      avatarRef: r.avatar_ref,
      colour: r.colour,
      authorLabel: null,
    })),
    ...notes.results.map((r) => ({
      id: r.id,
      kind: 'note' as const,
      at: r.at,
      text: r.text,
      memberId: r.member_id,
      name: r.name,
      avatarKind: r.avatar_kind,
      avatarRef: r.avatar_ref,
      colour: r.colour,
      authorLabel: r.author_label,
    })),
    ...dayNotes.results.map((r) => ({
      id: r.id,
      kind: 'day_note' as const,
      at: r.at,
      text: r.text,
      memberId: r.member_id,
      name: r.name,
      avatarKind: r.avatar_kind,
      avatarRef: r.avatar_ref,
      colour: r.colour,
      authorLabel: null,
    })),
    ...drawings.results.map((r) => ({
      id: r.id,
      kind: 'drawing' as const,
      at: r.at,
      text: '',
      memberId: r.member_id,
      name: r.name,
      avatarKind: r.avatar_kind,
      avatarRef: r.avatar_ref,
      colour: r.colour,
      authorLabel: null,
    })),
    ...events.results.map((r) => ({
      id: r.id,
      kind: 'event' as const,
      at: r.at,
      text: r.title,
      memberId: null,
      name: null,
      avatarKind: null,
      avatarRef: null,
      colour: null,
      authorLabel: null,
    })),
  ]

  return ok({ entries })
})
