import type { Contact, Pet, ContactGroupRaw } from './cercle'
import type { Business } from './businesses'
import type { Carnet, CareLog, HomePin } from './carnets'
import type { GalleryDrawing } from './drawingGallery'
import type { FamilyNote } from './familyNotes'
import type { Routine, HomeProject } from '../components/operator/types'
import type { Todo } from './todos'
import type { Habit } from './habits'
import type { Mot } from './mots'
import type { MealRow, MealIdea } from '../components/kitchen/types'
import type { Trip } from '../components/voyage/voyage'
import type { EventRow, NoteRow } from '../components/board/types'
import { plainText } from './noteMarkdown'

// P2-7 (UNIFORMIZING) — THE searchable-entity contract. /search matches every
// kind client-side over the warm query caches; WHICH fields make an entity
// findable used to be chosen ad-hoc inline in SearchPage, so a new feature
// could silently ship UNSEARCHABLE (nobody notices a missing fold-check).
// The rule now: **searchable = has an entry here.** Shipping a new searchable
// kind = add its `primary`/`secondary` extractor to SEARCH_INDEX (one line),
// then render its section in SearchPage.
//
//   primary   — the entity's NAME/title. A primary hit ranks a row (and its
//               whole section) above body-field hits: being NAMED what you
//               typed beats merely containing it.
//   secondary — the body fields (ingredients, notes, tags, details…). Omit it
//               for kinds findable by name only.
//
// Matching itself (fold(), the 0/1/2 ranking, CAP) stays in SearchPage — this
// module only answers "what text does this kind expose?", so it stays pure and
// dumb. The GUIDE is deliberately NOT here: its matcher is bespoke (per-point
// deep-links + token stripping) and lives beside its rendering.

export interface SearchFields<T> {
  primary: (x: T) => string
  secondary?: (x: T) => string
}

// Identity helper so each entry infers its own T while the record stays open.
const entry = <T,>(e: SearchFields<T>): SearchFields<T> => e

// Rows that come pre-shaped by SearchPage (merged pools / payload slices).
export interface PantryRow {
  id: string
  item: string
  reserve: boolean
}
interface ListRowLite {
  id: string
  text: string
}
interface CarLite {
  id: string
  name: string
}

export const SEARCH_INDEX = {
  recipe: entry<{ title: string; ingredients?: string[]; tags?: string[] }>({
    primary: (r) => r.title,
    secondary: (r) => `${(r.ingredients ?? []).join(' ')} ${(r.tags ?? []).join(' ')}`,
  }),
  person: entry<Contact>({
    primary: (c) => `${c.firstName} ${c.lastName} ${c.nickname ?? ''}`,
    secondary: (c) => (c.tags ?? []).join(' '),
  }),
  pet: entry<Pet>({
    primary: (p) => p.name,
    secondary: (p) => `${p.species ?? ''} ${p.breed ?? ''} ${p.notes ?? ''}`,
  }),
  business: entry<Business>({
    primary: (b) => b.name,
    secondary: (b) => `${b.category ?? ''} ${b.phone ?? ''} ${b.address ?? ''} ${b.notes ?? ''}`,
  }),
  routine: entry<Routine>({
    primary: (r) => r.name,
    secondary: (r) => (r.cards ?? []).map((c) => c.label).join(' '),
  }),
  todo: entry<Todo>({ primary: (td) => td.title }),
  pantry: entry<PantryRow>({ primary: (x) => x.item }),
  car: entry<CarLite>({ primary: (c) => c.name }),
  carnet: entry<Carnet>({
    primary: (x) => x.name,
    secondary: (x) => x.notes ?? '',
  }),
  homeProject: entry<HomeProject>({
    primary: (p) => p.title,
    secondary: (p) => p.notes ?? '',
  }),
  careLog: entry<CareLog>({
    primary: (e) => e.title,
    secondary: (e) => e.note ?? '',
  }),
  homePin: entry<HomePin>({
    primary: (p) => p.label,
    secondary: (p) => p.detail ?? '',
  }),
  event: entry<EventRow>({ primary: (e) => e.title }),
  listItem: entry<ListRowLite>({ primary: (li) => li.text }),
  // Cercle family notes: rich-text body folded to its plain words.
  familyNote: entry<FamilyNote>({
    primary: (n) => n.title,
    secondary: (n) => plainText(n.text),
  }),
  // A fridge memo has no NAME — its body is deliberately a SECONDARY hit, so
  // things actually named what you typed rank above a memo that merely says it.
  fridgeNote: entry<NoteRow>({
    primary: () => '',
    secondary: (n) => n.text ?? '',
  }),
  // « Mes habitudes » — findable by title (no notes field on the row; per-day
  // check-in notes live in a separate `days` array, not worth indexing).
  habit: entry<Habit>({ primary: (h) => h.title }),
  // « Laisse un mot » — a mot has NO name; its message text is a SECONDARY hit
  // (mirrors fridgeNote), so a thing actually NAMED what you typed ranks above a
  // mot that merely mentions it. Media-only mots carry no text → never surface.
  mot: entry<Mot>({ primary: () => '', secondary: (m) => m.text ?? '' }),
  // Plan des repas — free-text suppers only (recipe-linked meals already surface
  // via their recipe; SearchPage filters `!recipe_id` before handing them here).
  meal: entry<MealRow>({ primary: (m) => m.title }),
  // Idées de repas — same free-text-only rule as meals.
  mealIdea: entry<MealIdea>({ primary: (i) => i.title }),
  // Groupes (Le cercle) — findable by name (kind is an enum, colour a hex).
  group: entry<ContactGroupRaw>({ primary: (g) => g.name }),
  // Voyage (privé) — trip title, with destination + free-text notes as the body.
  trip: entry<Trip>({
    primary: (t) => t.title,
    secondary: (t) => `${t.destination ?? ''} ${t.notes ?? ''}`,
  }),
} as const

// Kept drawings carry no text of their own — they're matched by their AUTHOR's
// name ("les dessins de Léa"). A factory, since the name lookup is page state.
export const drawingFields = (memberName: Map<string, string>): SearchFields<GalleryDrawing> => ({
  primary: (d) => (d.member_id ? memberName.get(d.member_id) ?? '' : ''),
})
