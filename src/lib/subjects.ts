import { type IconName } from './pipIcons'
import { carnetEmoji, type Carnet } from './carnets'
import { taskPictoFor } from './picto'
import { THING_DEFAULTS } from './things'

// THE ONE ANSWER to « sur quoi, cette tâche ? » (plans/2026-11-06-TACHE-UNIFIEE.md). Name,
// link, icon, colour for any subject kind. A row and a page ask this and nothing else, so a
// carnet, a person, a pet, a project and a trip cannot grow five spellings of the same row
// (`subject-rule.test.ts` fails a `subject_kind` branch anywhere else).
//
// IT DOES NOT FETCH. It reads what the caller already holds, because the board poll is the
// free-tier lever and resolving a subject must not add a query to it. So it answers in two
// strengths, and each is honest:
//   · the kind alone is enough for a leading icon and a link: a row whose subject is not in
//     the lookup still wears the right glyph and still goes to the right page;
//   · the name and the colour need the row, and read null when the lookup does not hold it.
// A ref to something deleted reads as its kind with no name: a soft ref is never rewritten.

export type SubjectKind = 'carnet' | 'person' | 'pet' | 'project' | 'trip'
export interface SubjectRef {
  kind: SubjectKind
  id: string
}

// What a stored row says, for a form opening on it. The client's half of `subjectFromRow`
// (functions/_lib/subject.ts): `carnet_id` reads as kind 'carnet'.
const KINDS: readonly string[] = ['carnet', 'person', 'pet', 'project', 'trip']
export function subjectRefOf(row: { subject_kind?: string | null | undefined; subject_id?: string | null | undefined; carnet_id?: string | null | undefined } | null | undefined): SubjectRef | null {
  if (row?.subject_kind && row.subject_id && KINDS.includes(row.subject_kind)) return { kind: row.subject_kind as SubjectKind, id: row.subject_id }
  return row?.carnet_id ? { kind: 'carnet', id: row.carnet_id } : null
}

// The rows each kind reads. Structural, so the board's snake_case members, a cached /api/cercle
// frame and the /api/tasks `subjects` block all fit without a mapping step.
interface Named {
  id: string
}
export interface SubjectLookup {
  members?: readonly (Named & { display_name: string; colour?: string | null | undefined })[] | undefined
  carnets?: readonly (Named & { name: string; kind: string; color?: string | null | undefined; facts?: Carnet['facts'] | undefined })[] | undefined
  contacts?: readonly (Named & { name: string; colour?: string | null | undefined; member_id?: string | null | undefined })[] | undefined
  pets?: readonly (Named & { name: string; colour?: string | null | undefined; icon?: string | null | undefined })[] | undefined
  projects?: readonly (Named & { title: string; color?: string | null | undefined; icon?: string | null | undefined })[] | undefined
  trips?: readonly (Named & { title: string; colour?: string | null | undefined })[] | undefined
}

export interface Subject {
  ref: SubjectRef | null
  name: string | null
  /** Where the subject lives, or null for no subject. */
  to: string | null
  icon: IconName | null
  /** The subject's own glyph (a carnet's emoji, a pet's or a project's icon), shown over `icon`. */
  emoji: string | null
  colour: string | null
}

const NO_SUBJECT: Subject = { ref: null, name: null, to: null, icon: null, emoji: null, colour: null }

const ICON: Record<SubjectKind, IconName> = {
  carnet: 'book-open-bold',
  person: 'user-bold',
  pet: 'smiley-bold',
  project: 'paint-brush-bold',
  trip: 'map-pin-bold',
}

const link = (ref: SubjectRef): string => {
  switch (ref.kind) {
    case 'carnet':
      return `/cercle/carnet/${ref.id}`
    case 'person':
      return `/cercle/person/${ref.id}`
    case 'pet':
      return `/cercle/pet/${ref.id}`
    case 'project':
      return `/board?view=taches&par=sujet&sujet=project:${ref.id}`
    case 'trip':
      return `/voyage/${ref.id}`
  }
}

export function subjectOf(ref: SubjectRef | null | undefined, lookup: SubjectLookup = {}): Subject {
  if (!ref) return NO_SUBJECT
  const base: Subject = { ref, name: null, to: link(ref), icon: ICON[ref.kind], emoji: null, colour: null }
  const byId = <T extends Named>(rows: readonly T[] | undefined) => rows?.find((r) => r.id === ref.id)
  switch (ref.kind) {
    case 'carnet': {
      const c = byId(lookup.carnets)
      return c
        ? { ...base, name: c.name, emoji: carnetEmoji({ kind: c.kind as Carnet['kind'], facts: c.facts ?? null }), colour: c.color ?? null }
        : base
    }
    case 'person': {
      const m = byId(lookup.members)
      if (m) {
        // A member has a page only through a linked contact; otherwise their door is the family.
        const linked = lookup.contacts?.find((x) => x.member_id === m.id)
        return { ...base, name: m.display_name, colour: m.colour ?? null, to: linked ? `/cercle/person/${linked.id}` : '/maison?section=family' }
      }
      const c = byId(lookup.contacts)
      return c ? { ...base, name: c.name, colour: c.colour ?? null } : base
    }
    case 'pet': {
      const p = byId(lookup.pets)
      return p ? { ...base, name: p.name, emoji: p.icon || null, colour: p.colour ?? null } : base
    }
    case 'project': {
      const p = byId(lookup.projects)
      return p ? { ...base, name: p.title, emoji: p.icon || null, colour: lookColour(p.color) } : base
    }
    case 'trip': {
      const t = byId(lookup.trips)
      return t ? { ...base, name: t.title, colour: t.colour ?? null } : base
    }
  }
}

// ── THE LOOK OF A TASK (0148) ────────────────────────────────────────────────────
// A task wears its own pick, else its subject's, else the task default. Resolved HERE and
// nowhere else: a row, a peek and a form preview all ask `lookOf`, so a carnet's emoji cannot
// lead one list and lose in the next. The server sends the raw columns (TaskItem.icon/color).
//
// THE DEFAULT COLOUR IS NOT A CHOICE. `tasks.colour` and `home_projects.colour` are NOT NULL
// with the sage default since 0001/0074, and every form used to write it unasked. Rebuilding
// two tables to make the column nullable was not worth the risk, so the default value itself
// reads as « not chosen ». It is also the task category's own tint (CATS.chore), so a task that
// lands on it by hand looks exactly the same either way: only a subject's colour shows through.
// Read at CALL time, never at module load: in the production bundle this chunk can evaluate
// before the one holding THING_DEFAULTS (a chunk cycle), and a load-time read crashed the
// board on render (« reading 'chore' », the SW harness on bd7a13db, 2026-11-09).
const taskDefaultColour = (): string => THING_DEFAULTS.chore.colour.toLowerCase()

/** A stored colour as a pick: null when it is the task default, i.e. never chosen. */
export function lookColour(stored: string | null | undefined): string | null {
  return stored && stored.toLowerCase() !== taskDefaultColour() ? stored : null
}

export interface Look {
  /** An emoji to draw, the task's or its subject's. */
  emoji: string | null
  /** Else a Phosphor glyph: the subject kind's. Null = the row's category default. */
  icon: IconName | null
  /** Null = the category default tint. */
  colour: string | null
}

export function lookOf(task: { icon?: string | null | undefined; color?: string | null | undefined }, subject: Subject): Look {
  const emoji = task.icon?.trim() || subject.emoji || null
  return { emoji, icon: emoji ? null : subject.icon, colour: lookColour(task.color) ?? subject.colour ?? null }
}

/** What typing a title SUGGESTS for an icon: a picture for the words, or nothing. Never written
 * by itself: a form offers it as one tap, and a task without a pick keeps inheriting. */
export function suggestIcon(title: string): string | null {
  const t = title.trim()
  return t ? taskPictoFor(t, '') || null : null
}
