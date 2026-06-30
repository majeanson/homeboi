import { useQuery } from '@tanstack/react-query'
import { api } from './api'
import { live } from './query'
import { MOTS_KEY } from './queryKeys'

// « Laisse un mot » — the wire shape from /api/mots + the calm visibility helpers. A mot
// is an INTERNAL member-to-member message that waits, unopened, on the recipient's face.
// See functions/api/mots.ts + migration 0094.
type MotMedia = 'audio' | 'drawing' | 'image'

export interface Mot {
  id: string
  member_id: string | null // RECIPIENT scope: NULL = Maisonnée (everyone)
  author_member_id: string | null // SENDER (pick-your-face)
  text: string
  media_kind: MotMedia | null
  media_key: string | null
  scene_key: string | null
  created_at: number
  updated_at: number | null
  opened_at: number | null // NULL = still waiting (drives the calm heads-up + the face dot)
  saved_at: number | null // NULL = not kept; set = a « Gardé » keepsake
  surface_at: number | null // NULL = surface now; else hidden until this unix second (scheduled)
  reply_to: string | null // the parent mot this answers; NULL = top-level
}

// A scheduled mot stays hidden until its surface_at moment (NULL = surface now). Pure so the
// gate is unit-tested; applied once in useMots so the inbox, « Déjà vus » and the face dot
// all honour it together.
export function isSurfaced(m: Mot, nowSec: number): boolean {
  return m.surface_at == null || m.surface_at <= nowSec
}

// The viewing filter (mirrors familyNotes.visibleNotes): a picked face sees THEIR mots
// PLUS the Maisonnée ones always; "Maisonnée" (face null) sees only the family-wide mots.
// Newest first (the inbox reads most-recent, like the notes list).
export function visibleMots(mots: Mot[], face: string | null): Mot[] {
  const base = face ? mots.filter((m) => m.member_id === null || m.member_id === face) : mots.filter((m) => m.member_id === null)
  return base.slice().sort((a, b) => b.created_at - a.created_at)
}

// The unopened mots waiting for a face — the « un mot t'attend » heads-up set.
export function waitingMots(mots: Mot[], face: string | null): Mot[] {
  return visibleMots(mots, face).filter((m) => m.opened_at == null)
}

// The kept keepsakes for a face — the collapsed « Gardés » group.
export function savedMots(mots: Mot[], face: string | null): Mot[] {
  return visibleMots(mots, face).filter((m) => m.saved_at != null)
}

// Member ids with ≥1 unopened mot addressed TO THEM — feeds the per-face presence DOT.
// Maisonnée mots (recipient null) are DELIBERATELY excluded: they're already discoverable
// on the at-rest board (the « Mots » card shows family-wide mots to everyone), so dotting
// every face for one would be noisy. The dot's job is the case the card can't show at
// rest — a mot for one specific person. Boolean presence only, never a count (NFR-CALM).
export function waitingRecipientIds(mots: Mot[]): Set<string> {
  const ids = new Set<string>()
  for (const m of mots) {
    if (m.opened_at == null && m.member_id !== null) ids.add(m.member_id)
  }
  return ids
}

// Shared read of the mots cache (board card + face dots both read it live). SCHEDULED mots
// are gated HERE — the single chokepoint — so a not-yet-surfaced mot is absent from the
// inbox, the « Déjà vus » group AND the face dot at once. The live poll re-renders this, so
// a scheduled mot appears within a poll interval of its surface_at (calm: no push).
export function useMots(): Mot[] {
  const { data } = useQuery({ queryKey: MOTS_KEY, queryFn: () => api<{ mots: Mot[] }>('mots'), ...live })
  const now = Date.now() / 1000
  return (data?.mots ?? []).filter((m) => isSurfaced(m, now))
}

// Does this specific face have a mot waiting for them? Used by the face-row dot.
// Maisonnée mots are surfaced by the at-rest inbox card, not the dot (see above).
export function useFaceHasWaiting(): (faceId: string) => boolean {
  const ids = waitingRecipientIds(useMots())
  return (faceId: string) => ids.has(faceId)
}
