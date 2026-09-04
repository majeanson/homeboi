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
  position: number // manual drag order (migration 0111); 0 = never reordered
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

// The ONE display order, mirroring the API's `ORDER BY position, created_at DESC`:
// manual drag order first (migration 0111 — every never-reordered row sits at 0),
// newest-first within a position tie. So an untouched list keeps the iOS-Notes
// most-recent-first feel, and the first drag pins what you see. `?? 0` guards a
// pre-0111 payload (the persisted offline cache restores old shapes) — a missing
// position must read as 0, not poison the comparator with NaN.
export function sortNotes(notes: FamilyNote[]): FamilyNote[] {
  return notes
    .slice()
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0) || (b.updated_at ?? b.created_at) - (a.updated_at ?? a.created_at))
}

// What the EDITOR's body starts as. The editor has no title FIELD — the note's first
// words are its title, iOS style — so a note carrying a legacy stored `title` (from
// before that field was removed) folds it in as the first line here, and the save
// then writes an empty title. Nothing is lost, and the row list already derives its
// heading from that first line. Idempotent: a title that already leads the body is
// never doubled.
export function seedMd(note: FamilyNote | null): string {
  const body = note?.text ?? ''
  const ti = note?.title.trim() ?? ''
  if (!ti) return body
  const first = body.split('\n').find((l) => l.trim())?.trim() ?? ''
  if (first === ti) return body
  return body.trim() ? ti + '\n' + body : ti
}
