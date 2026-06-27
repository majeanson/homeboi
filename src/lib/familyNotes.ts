// « Le cercle » → Famille → "Notes & recommandations" (the wire shape from
// /api/family-notes). iOS-Notes-style quick notes scoped to one household member
// (the "Moi" list) or the whole Maisonnée (member_id NULL = family-wide), each
// optionally carrying media. See functions/api/family-notes.ts + migration 0062.
type FamilyNoteMedia = 'audio' | 'drawing' | 'image'

export interface FamilyNote {
  id: string
  member_id: string | null // scope: NULL = Maisonnée (family-wide)
  author_member_id: string | null // who wrote it (pick-your-face attribution)
  title: string // optional explicit heading (iOS-Notes style); '' = derive from body
  text: string // body, stored as lightweight Markdown (see lib/noteMarkdown)
  media_kind: FamilyNoteMedia | null
  media_key: string | null
  scene_key: string | null
  created_at: number
  updated_at: number | null
}

// The composer's "Moi / Maisonnée" toggle value. 'self' carries the picked member id.
export type NoteScope = 'self' | 'family'

// The viewing filter (decision 3): a member face sees THEIR notes + the Maisonnée
// notes always; "Maisonnée" (memberId null) sees only the family-wide notes.
export function visibleNotes(notes: FamilyNote[], memberId: string | null): FamilyNote[] {
  if (!memberId) return notes.filter((n) => n.member_id === null)
  return notes.filter((n) => n.member_id === null || n.member_id === memberId)
}
