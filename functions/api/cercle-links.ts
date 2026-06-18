import { badRequest, conflict, notFound, ok, readJson } from '../_lib/json'
import { authed } from '../_lib/route'
import { newId, nowSec } from '../_lib/ids'
import { INVERSES, isRelationshipType as isType } from '../_lib/cercleRelations'

// Relationship EDGES for « Le cercle » — a typed link between two contacts, stored
// ONCE (person_a → person_b) with its derived inverse so either profile can read
// the relation. The server derives reverse_type from the shared INVERSES map
// (functions/_lib/cercleRelations.ts), so a client can never desync the edge.

const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null)

// Both endpoints of an edge must be contacts in THIS household.
async function ownsContacts(db: D1Database, householdId: string, ids: string[]): Promise<boolean> {
  const placeholders = ids.map(() => '?').join(', ')
  const row = await db
    .prepare(`SELECT COUNT(*) AS n FROM contacts WHERE household_id = ? AND id IN (${placeholders})`)
    .bind(householdId, ...ids)
    .first<{ n: number }>()
  return (row?.n ?? 0) === ids.length
}

export const onRequestPost = authed(async (ctx, actor) => {
  const body = await readJson<{ personAId?: string; personBId?: string; type?: string; label?: string; notes?: string }>(
    ctx.request,
  )
  const a = str(body?.personAId)
  const b = str(body?.personBId)
  if (!a || !b) return badRequest('Deux personnes requises.')
  if (a === b) return badRequest('Une personne ne peut pas être liée à elle-même.')
  if (!isType(body?.type)) return badRequest('Type de lien invalide.')
  if (!(await ownsContacts(ctx.env.DB, actor.householdId, [a, b]))) return notFound('Contact introuvable.')

  // One edge per pair+type, regardless of direction — a→b parent and b→a child are
  // the SAME relationship, so don't let it be added twice.
  const dup = await ctx.env.DB.prepare(
    `SELECT id FROM contact_links
      WHERE household_id = ?
        AND ((person_a_id = ? AND person_b_id = ? AND type = ?)
          OR (person_a_id = ? AND person_b_id = ? AND type = ?))`,
  )
    .bind(actor.householdId, a, b, body.type, b, a, INVERSES[body.type])
    .first<{ id: string }>()
  if (dup) return conflict('Ce lien existe déjà.')

  const id = newId()
  const ts = nowSec()
  await ctx.env.DB.prepare(
    `INSERT INTO contact_links (id, household_id, person_a_id, person_b_id, type, reverse_type, label, notes, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(id, actor.householdId, a, b, body.type, INVERSES[body.type], str(body?.label), str(body?.notes), ts, ts)
    .run()
  return ok({ id })
})

export const onRequestPatch = authed(async (ctx, actor) => {
  const body = await readJson<{ id?: string; type?: string; label?: string | null; notes?: string | null }>(ctx.request)
  if (!body?.id) return badRequest('id requis.')

  const owns = await ctx.env.DB.prepare('SELECT id FROM contact_links WHERE id = ? AND household_id = ?')
    .bind(body.id, actor.householdId)
    .first<{ id: string }>()
  if (!owns) return notFound('Lien introuvable.')

  const sets: string[] = []
  const binds: unknown[] = []
  if (body.type !== undefined) {
    if (!isType(body.type)) return badRequest('Type de lien invalide.')
    sets.push('type = ?', 'reverse_type = ?')
    binds.push(body.type, INVERSES[body.type])
  }
  if ('label' in body) {
    sets.push('label = ?')
    binds.push(str(body.label))
  }
  if ('notes' in body) {
    sets.push('notes = ?')
    binds.push(str(body.notes))
  }
  if (sets.length) {
    sets.push('updated_at = ?')
    binds.push(nowSec(), body.id, actor.householdId)
    await ctx.env.DB.prepare(`UPDATE contact_links SET ${sets.join(', ')} WHERE id = ? AND household_id = ?`)
      .bind(...binds)
      .run()
  }
  return ok({ ok: true })
})

export const onRequestDelete = authed(async (ctx, actor) => {
  const body = await readJson<{ id?: string }>(ctx.request)
  if (!body?.id) return badRequest('id requis.')
  await ctx.env.DB.prepare('DELETE FROM contact_links WHERE id = ? AND household_id = ?')
    .bind(body.id, actor.householdId)
    .run()
  return ok({ ok: true })
})
