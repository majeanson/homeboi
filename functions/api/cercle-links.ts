import { badRequest, conflict, notFound, ok, readJson } from '../_lib/json'
import { authed } from '../_lib/route'
import { newId, nowSec } from '../_lib/ids'
import { INVERSES, isRelationshipType as isType } from '../_lib/cercleRelations'

// Relationship EDGES for « Le cercle » — a typed link between two PEOPLE, stored
// ONCE (person_a → person_b) with its derived inverse so either side can read the
// relation. A "person" is polymorphic (migration 0050): a contact OR a household
// member, identified by (kind, id). The server derives reverse_type from the shared
// INVERSES map (functions/_lib/cercleRelations.ts) so a client can never desync the
// edge, and validates each endpoint against ITS table for this household.

type Kind = 'contact' | 'member'
const kindOf = (v: unknown): Kind => (v === 'member' ? 'member' : 'contact')
const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null)

interface Person {
  id: string
  kind: Kind
}

// Every endpoint must be a real person in THIS household — a contact id in
// `contacts`, a member id in `members`. One COUNT per table that's actually used.
async function ownsPersons(db: D1Database, householdId: string, people: Person[]): Promise<boolean> {
  const byKind = (kind: Kind) => people.filter((p) => p.kind === kind).map((p) => p.id)
  const check = async (table: 'contacts' | 'members', ids: string[]): Promise<boolean> => {
    if (ids.length === 0) return true
    const placeholders = ids.map(() => '?').join(', ')
    const row = await db
      .prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE household_id = ? AND id IN (${placeholders})`)
      .bind(householdId, ...ids)
      .first<{ n: number }>()
    return (row?.n ?? 0) === ids.length
  }
  return (await check('contacts', byKind('contact'))) && (await check('members', byKind('member')))
}

export const onRequestPost = authed(async (ctx, actor) => {
  const body = await readJson<{
    aId?: string
    aKind?: string
    bId?: string
    bKind?: string
    // Back-compat: phase-1 callers sent personAId/personBId (contact↔contact).
    personAId?: string
    personBId?: string
    type?: string
    label?: string
    notes?: string
  }>(ctx.request)
  const aId = str(body?.aId ?? body?.personAId)
  const bId = str(body?.bId ?? body?.personBId)
  const aKind = kindOf(body?.aKind)
  const bKind = kindOf(body?.bKind)
  if (!aId || !bId) return badRequest('Deux personnes requises.')
  if (aId === bId && aKind === bKind) return badRequest('Une personne ne peut pas être liée à elle-même.')
  if (!isType(body?.type)) return badRequest('Type de lien invalide.')
  if (!(await ownsPersons(ctx.env.DB, actor.householdId, [{ id: aId, kind: aKind }, { id: bId, kind: bKind }])))
    return notFound('Personne introuvable.')

  // One edge per pair+type, either direction — a→b parent and b→a child are the
  // SAME relationship. Match on (id, kind) both ways so contact/member endpoints
  // can't sneak a duplicate.
  const dup = await ctx.env.DB.prepare(
    `SELECT id FROM contact_links
      WHERE household_id = ?
        AND ((person_a_id = ? AND person_a_kind = ? AND person_b_id = ? AND person_b_kind = ? AND type = ?)
          OR (person_a_id = ? AND person_a_kind = ? AND person_b_id = ? AND person_b_kind = ? AND type = ?))`,
  )
    .bind(actor.householdId, aId, aKind, bId, bKind, body.type, bId, bKind, aId, aKind, INVERSES[body.type])
    .first<{ id: string }>()
  if (dup) return conflict('Ce lien existe déjà.')

  const id = newId()
  const ts = nowSec()
  await ctx.env.DB.prepare(
    `INSERT INTO contact_links
       (id, household_id, person_a_id, person_a_kind, person_b_id, person_b_kind, type, reverse_type, label, notes, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(id, actor.householdId, aId, aKind, bId, bKind, body.type, INVERSES[body.type], str(body?.label), str(body?.notes), ts, ts)
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
