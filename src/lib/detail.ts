// The "entity detail" peek — one normalized shape every clickable board/kitchen
// item collapses to, so a single sheet (components/detail/EntityDetailSheet) can
// show "a quick picture, a date, relevant text" for ANY of them. Tapping a row
// builds one of these (components/detail/adapters) and opens it through
// useEntityDetail (components/detail/DetailProvider).
//
// Calm by design: it's a read-MOSTLY peek. The few `actions` reuse the existing
// calm-compliant handlers (deferred-undo mark-done, navigate-to-edit) — it never
// invents counts, streaks, or a new write path.
import type { IconName } from '../components/Icon'

// Every kind of thing the peek can describe. Adapters map an entity → a model.
type DetailKind =
  | 'event'
  | 'meal'
  | 'day' // a whole day's meals, informative (La cuisine week grid)
  | 'chore'
  | 'todo'
  | 'leftover'
  | 'note'
  | 'mot' // « Laisse un mot » — a member-to-member message (text / voice / drawing / photo)
  | 'habit' // « Mes habitudes » — a board-card habit row (today's reading + the edit door)
  | 'contact'

// One block of body content. The sheet renders these top-to-bottom.
export type DetailBlock =
  | { kind: 'text'; text: string; hand?: boolean } // a paragraph (hand = handwritten note look)
  | { kind: 'chips'; label?: string; chips: string[]; tones?: (string | undefined)[] } // a tag/chip row; `tones[i]` = a per-chip household hex
  | { kind: 'list'; label?: string; items: string[] } // a short bullet list (a person's relationships, a day's meals)
  | { kind: 'image'; src: string; alt?: string } // a media image (note photo/drawing), tap-to-zoom
  | { kind: 'audio'; src: string } // a media audio memo (a <audio controls>)
  // Tappable chips that ADD/REMOVE membership inline (e.g. a person's named groups in
  // Le cercle). Each option carries its current on/off; onToggle persists the change.
  | { kind: 'togglechips'; label?: string; options: { id: string; label: string; on: boolean }[]; onToggle: (id: string, on: boolean) => void }

// A face to attribute the entity to — drawn with the shared <Avatar>.
export interface DetailWho {
  role?: string // a quiet label before the face ("Cuisine", "Tour de")
  name?: string | null
  colour?: string | null
  avatarKind?: string | null // member.avatar_kind
  avatarRef?: string | null // member.avatar_ref (R2 key)
}

// A button in the sheet footer. Either an in-app `run` (mark done, dismiss) or a
// `href` to navigate to (the existing edit/view scene). Both close the sheet.
export interface DetailAction {
  key: string
  label: string
  icon?: IconName
  primary?: boolean // the marigold filled CTA (e.g. "Modifier" on an event)
  tone?: 'danger' // a destructive action (e.g. "Effacer")
  // This action lives in the sheet's ⋯ overflow menu (ActionMenu in the head),
  // not the visible button row — set EXPLICITLY per action in the adapters (no
  // heuristics): quick-reach + the primary stay visible, the long tail folds.
  overflow?: boolean
  run?: () => void
  href?: string
}

export interface DetailModel {
  kind: DetailKind
  title: string
  accent?: string // hex spine/accent colour (member/slot/category)
  icon?: IconName // a Phosphor control glyph for the header tile
  emoji?: string // OR a content picto (a meal's food, a routine face) — content only
  photo?: string | null // an already-resolved image src (imgUrl()/recipeImg()) for the header
  when?: string // a preformatted date/time label ("Ce soir", "mar. 18 juin · 17 h 30")
  whoLabel?: string // a quiet sub-line under the title (e.g. a meal slot)
  who?: DetailWho | null // a single face chip
  whoStack?: DetailWho[] // several faces (an event's « Qui » — the people it concerns); takes precedence over `who`
  blocks?: DetailBlock[]
  actions?: DetailAction[]
}
