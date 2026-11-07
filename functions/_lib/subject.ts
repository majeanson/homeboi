// « Sur quoi ? » — the soft subject ref on a task (migration 0146), server side: reading a
// row and vetting a write. The DISPLAY answer (name, link, icon, colour) is `subjectOf()` in
// src/lib/subjects.ts, which works from data the client already holds, so the board poll
// gains no query.

export const SUBJECT_KINDS = ['carnet', 'person', 'pet', 'project', 'trip'] as const
export type SubjectKind = (typeof SUBJECT_KINDS)[number]
export interface SubjectRef {
  kind: SubjectKind
  id: string
}

const isKind = (v: unknown): v is SubjectKind => typeof v === 'string' && (SUBJECT_KINDS as readonly string[]).includes(v)


// The shape a client sends: `{ kind, id }`, or null to clear. Anything else is no subject.
export function parseSubject(v: unknown): SubjectRef | null {
  if (!v || typeof v !== 'object') return null
  const { kind, id } = v as { kind?: unknown; id?: unknown }
  if (!isKind(kind) || typeof id !== 'string' || !id.trim()) return null
  return { kind, id: id.trim() }
}

// Each kind's home table, and what "still alive" means there. A person is a household
// member OR a circle contact: the two rosters /cercle/person opens on.
const OWNED: Record<SubjectKind, readonly string[]> = {
  carnet: ['SELECT id FROM carnets WHERE id = ? AND household_id = ?'],
  person: [
    'SELECT id FROM members WHERE id = ? AND household_id = ?',
    'SELECT id FROM contacts WHERE id = ? AND household_id = ?',
  ],
  pet: ['SELECT id FROM pets WHERE id = ? AND household_id = ? AND deleted_at IS NULL'],
  project: [`SELECT id FROM home_projects WHERE id = ? AND household_id = ? AND kind = 'plan'`],
  trip: ['SELECT id FROM trips WHERE id = ? AND household_id = ? AND deleted_at IS NULL'],
}

// A subject is only honoured when THIS household owns it, the rule validCarnetId has always
// kept: a foreign or dead id stores NULL rather than a link across households. `self` is the
// row being written, so a project cannot be filed under itself.
export async function validSubject(db: D1Database, householdId: string, raw: unknown, self?: string): Promise<SubjectRef | null> {
  const ref = parseSubject(raw)
  if (!ref || ref.id === self) return null
  for (const sql of OWNED[ref.kind]) {
    if (await db.prepare(sql).bind(ref.id, householdId).first<{ id: string }>()) return ref
  }
  return null
}

// The columns a ref writes on `tasks` and `todos`, which have no carnet_id of their own.
export const subjectBinds = (ref: SubjectRef | null): [string | null, string | null] => (ref ? [ref.kind, ref.id] : [null, null])
