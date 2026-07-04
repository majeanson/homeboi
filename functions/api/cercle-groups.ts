import { badRequest, notFound, ok, readJson } from '../_lib/json'
import { authed } from '../_lib/route'
import { newId, nowSec } from '../_lib/ids'

// Named people groups (Famille Tremblay, Amis du soccer, etc.).
// POST {name,kind?,colour?}         → create group.
// POST {groupId,personId,personKind} → add person to group.
// PATCH {id,name?,kind?,colour?}    → rename/recolour group.
// DELETE {id}                        → delete group (members cascade from FK).
// DELETE {groupId,personId,personKind} → remove one person from a group.
// Groups list is returned by GET /api/cercle (not here) so no GET needed.

const VALID_KINDS = new Set(['family', 'friends', 'work', 'other'])
const HEX_RE = /^#[0-9a-fA-F]{6}$/

// Family identity follows the group EVERYWHERE. When a group carries a colour, push it
// onto its member people so the family reads as one colour on the board faces, the
// member switcher, and detail peeks — not only the Cercle render-time tint. Members +
// pets carry a `colour` column and cascade (animals included); contacts have none (they
// render at the rose accent / group tint), so they're skipped. Best-effort + household-
// scoped; `colour` is an already-validated hex. Clearing a group's colour to null does
// NOT revert members (their prior colour is unknowable) — a deliberate, simple rule.
async function cascadeGroupColour(db: D1Database, householdId: string, groupId: string, colour: string): Promise<void> {
  await db
    .prepare(
      `UPDATE members SET colour = ?
         WHERE household_id = ?
           AND id IN (SELECT person_id FROM contact_group_members WHERE group_id = ? AND person_kind = 'member')`,
    )
    .bind(colour, householdId, groupId)
    .run()
  await db
    .prepare(
      `UPDATE pets SET colour = ?, updated_at = ?
         WHERE household_id = ?
           AND id IN (SELECT person_id FROM contact_group_members WHERE group_id = ? AND person_kind = 'pet')`,
    )
    .bind(colour, nowSec(), householdId, groupId)
    .run()
}

export const onRequestPost = authed(async (ctx, actor) => {
  const body = await readJson<{
    name?: string
    kind?: string
    colour?: string
    groupId?: string
    personId?: string
    personKind?: string
  }>(ctx.request)

  // Add person to existing group
  if (body?.groupId) {
    if (!body.personId || !body.personKind) return badRequest('personId et personKind requis.')
    if (body.personKind !== 'contact' && body.personKind !== 'member' && body.personKind !== 'pet')
      return badRequest('personKind invalide.')
    const grp = await ctx.env.DB.prepare('SELECT id, colour FROM contact_groups WHERE id = ? AND household_id = ?')
      .bind(body.groupId, actor.householdId)
      .first<{ id: string; colour: string | null }>()
    if (!grp) return notFound('Groupe introuvable.')
    await ctx.env.DB.prepare(
      'INSERT OR IGNORE INTO contact_group_members (group_id, person_id, person_kind) VALUES (?, ?, ?)',
    )
      .bind(body.groupId, body.personId, body.personKind)
      .run()
    // A newly-added member/pet adopts the family's colour so it follows everywhere.
    if (grp.colour && HEX_RE.test(grp.colour)) await cascadeGroupColour(ctx.env.DB, actor.householdId, body.groupId, grp.colour)
    return ok({ ok: true })
  }

  // Create group
  const name = body?.name?.trim()
  if (!name) return badRequest('Nom requis.')
  const kind = VALID_KINDS.has(body?.kind ?? '') ? (body!.kind as string) : 'other'
  const colour = body?.colour && HEX_RE.test(body.colour) ? body.colour : null
  const id = newId()
  await ctx.env.DB.prepare(
    'INSERT INTO contact_groups (id, household_id, name, kind, colour, created_at) VALUES (?, ?, ?, ?, ?, ?)',
  )
    .bind(id, actor.householdId, name, kind, colour, nowSec())
    .run()
  return ok({ id, name })
})

export const onRequestPatch = authed(async (ctx, actor) => {
  const body = await readJson<{ id?: string; name?: string; kind?: string; colour?: string | null }>(ctx.request)
  if (!body?.id) return badRequest('id requis.')
  const grp = await ctx.env.DB.prepare('SELECT id FROM contact_groups WHERE id = ? AND household_id = ?')
    .bind(body.id, actor.householdId)
    .first()
  if (!grp) return notFound('Groupe introuvable.')

  const sets: string[] = []
  const binds: unknown[] = []
  if (typeof body.name === 'string' && body.name.trim()) {
    sets.push('name = ?')
    binds.push(body.name.trim())
  }
  if (body.kind && VALID_KINDS.has(body.kind)) {
    sets.push('kind = ?')
    binds.push(body.kind)
  }
  let newColour: string | null | undefined
  if ('colour' in body) {
    newColour = body.colour && HEX_RE.test(body.colour) ? body.colour : null
    sets.push('colour = ?')
    binds.push(newColour)
  }
  if (!sets.length) return ok({ ok: true })
  binds.push(body.id, actor.householdId)
  await ctx.env.DB.prepare(`UPDATE contact_groups SET ${sets.join(', ')} WHERE id = ? AND household_id = ?`)
    .bind(...binds)
    .run()
  // Recolouring a family cascades onto its members + pets so it follows everywhere.
  if (newColour) await cascadeGroupColour(ctx.env.DB, actor.householdId, body.id, newColour)
  return ok({ ok: true })
})

export const onRequestDelete = authed(async (ctx, actor) => {
  const body = await readJson<{ id?: string; groupId?: string; personId?: string; personKind?: string }>(ctx.request)

  // Remove one person from a group
  if (body?.groupId) {
    if (!body.personId || !body.personKind) return badRequest('personId et personKind requis.')
    await ctx.env.DB.prepare(
      `DELETE FROM contact_group_members
         WHERE group_id = ? AND person_id = ? AND person_kind = ?
           AND group_id IN (SELECT id FROM contact_groups WHERE household_id = ?)`,
    )
      .bind(body.groupId, body.personId, body.personKind, actor.householdId)
      .run()
    return ok({ ok: true })
  }

  // Delete whole group (contact_group_members cascades from the FK)
  if (!body?.id) return badRequest('id requis.')
  const { meta } = await ctx.env.DB.prepare('DELETE FROM contact_groups WHERE id = ? AND household_id = ?')
    .bind(body.id, actor.householdId)
    .run()
  if (!meta.changes) return notFound('Groupe introuvable.')
  return ok({ ok: true })
})
