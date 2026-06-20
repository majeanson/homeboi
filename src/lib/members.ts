// The canonical household-member ("Maisonnée") row. ONE definition the whole app
// shares, instead of the four near-identical snake_case copies that had drifted
// across board/types, operator/types, HeartButton, ProfilePicker and idleDebug.
//
// CRITICAL: this mirrors the RAW /api/members DB row and stays snake_case
// (display_name, avatar_kind, …). The whole frontend reads those fields directly —
// NEVER remap to camelCase (doing so once crashed + blanked the app; see project
// memory babillard-members-api-shape). « Le cercle »'s camelCase `Member` (from
// /api/cercle, in lib/cercle.ts) is a DISTINCT contact model — do not merge them.

/** The base every member projection shares — enough to render a person's face on
 *  the board / list / pickers. The lighter /board payload sends exactly this, with
 *  the avatar fields optional (a glance may omit them); the face pickers read the
 *  same shape and guard the avatar before use. */
export interface Member {
  id: string
  display_name: string
  colour: string
  is_child: number
  avatar_kind?: string
  avatar_ref?: string
}

/** The full Réglages row — every column the member editor and the « Le cercle »
 *  bridge read. /api/members returns this complete shape, so the avatar fields are
 *  always present here (narrowed from the base's optional). */
export interface OperatorMember extends Member {
  avatar_kind: string
  avatar_ref: string
  email: string | null
  phone: string | null
  birthday: string | null
  notes: string | null
  gender: string | null
}
