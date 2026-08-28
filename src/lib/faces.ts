import { imgUrl } from './image'

// THE face shape every household-face control speaks — `MemberSwitcher` (the
// « Aujourd'hui » row), `MemberPicker` (its multi-select sibling), `FaceSelect` (the
// collapsed chip) and every form that scopes a row to a person.
//
// It lives here, not in the component, because THREE different member shapes feed it
// and the mapping is the interesting part (REVIEW-PASS « dir »):
//
//   1. snake_case rows straight from `/api/members` (`lib/members` Member) — the board,
//      the forms, the voyage scene, « Le point du jour ». NEVER remapped to camelCase:
//      that is a standing rule (the raw row shape is the contract).
//   2. camelCase people from the cercle GET (`lib/cercle` Member) — Le cercle, Notes.
//   3. the detail adapter's own `Member` (`board/types`), for peek headers.
//
// The mapping was hand-written at NINE call sites, character-identical apart from
// which convention it read. Nothing was broken, but a field rename on either side
// would have compiled fine and silently blanked the faces on the surfaces that used
// the OTHER shape — the definition of a seam worth making explicit. Now there is one
// function per shape, so a rename breaks the build in one place and names it.
export interface MemberFace {
  id: string
  name: string
  // The face's colour for the initial disc; null falls back to the neutral disc.
  colour: string | null
  // A resolved image URL (e.g. imgUrl(avatar_ref)) or null for the coloured initial.
  photoUrl?: string | null
  // A calm presence accent on the face (e.g. « un mot t'attend ») — a BOOLEAN dot, like the
  // board's "Bientôt" chip. Never a count (NFR-CALM). Optional; absent → no dot.
  dot?: boolean
}

/** The snake_case `/api/members` row — only the fields a face needs. */
interface RawMember {
  id: string
  display_name: string
  colour?: string | null
  avatar_kind?: string | null
  avatar_ref?: string | null
}

/** The camelCase cercle person — only the fields a face needs. */
interface CercleMember {
  id: string
  displayName: string
  colour?: string | null
  avatarKind?: string
  avatarRef?: string
}

// A member's picture, or null when they have none (→ the coloured initial disc).
// The `avatar_kind === 'photo'` test matters: a member can carry an avatar_ref for a
// non-photo kind, and rendering that as an <img> is a broken tile.
const photoOf = (kind: string | null | undefined, ref: string | null | undefined): string | null =>
  kind === 'photo' && ref ? imgUrl(ref) : null

/** ONE `/api/members` row → a face. Named `toFace` because it already was: it lived
 *  in `components/FormScene` and four forms map over it, which is exactly the seam
 *  this file is about — so it moved here rather than becoming a fifth spelling. */
export function toFace(m: RawMember): MemberFace {
  return {
    id: m.id,
    name: m.display_name,
    colour: m.colour ?? null,
    photoUrl: photoOf(m.avatar_kind, m.avatar_ref),
  }
}

/** `/api/members` rows → faces. The common case. */
export function facesFromMembers(members: RawMember[]): MemberFace[] {
  return members.map(toFace)
}

/** Cercle people (camelCase) → faces. */
export function facesFromCercleMembers(members: CercleMember[]): MemberFace[] {
  return members.map((m) => ({
    id: m.id,
    name: m.displayName,
    colour: m.colour ?? null,
    photoUrl: photoOf(m.avatarKind, m.avatarRef),
  }))
}
