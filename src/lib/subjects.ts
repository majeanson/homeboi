import { type IconName } from './pipIcons'
import { carnetEmoji, type Carnet } from './carnets'

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

// The rows each kind reads. Structural, so the board's snake_case members, a cached /api/cercle
// frame and the /api/tasks `subjects` block all fit without a mapping step.
interface Named {
  id: string
}
export interface SubjectLookup {
  members?: readonly (Named & { display_name: string; colour?: string | null | undefined })[] | undefined
  carnets?: readonly (Named & { name: string; kind: string; color?: string | null | undefined; facts?: Carnet['facts'] | undefined })[] | undefined
  contacts?: readonly (Named & { name: string; colour?: string | null | undefined })[] | undefined
  pets?: readonly (Named & { name: string; colour?: string | null | undefined })[] | undefined
  projects?: readonly (Named & { title: string; color?: string | null | undefined })[] | undefined
  trips?: readonly (Named & { title: string; colour?: string | null | undefined })[] | undefined
}

export interface Subject {
  ref: SubjectRef | null
  name: string | null
  /** Where the subject lives, or null for no subject. */
  to: string | null
  icon: IconName | null
  /** A carnet's own glyph, shown over `icon` when it has one. */
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
      if (m) return { ...base, name: m.display_name, colour: m.colour ?? null }
      const c = byId(lookup.contacts)
      return c ? { ...base, name: c.name, colour: c.colour ?? null } : base
    }
    case 'pet': {
      const p = byId(lookup.pets)
      return p ? { ...base, name: p.name, colour: p.colour ?? null } : base
    }
    case 'project': {
      const p = byId(lookup.projects)
      return p ? { ...base, name: p.title, colour: p.color ?? null } : base
    }
    case 'trip': {
      const t = byId(lookup.trips)
      return t ? { ...base, name: t.title, colour: t.colour ?? null } : base
    }
  }
}
