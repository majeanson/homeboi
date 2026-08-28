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
  // A voice mot's words, filled in behind the send by Workers AI Whisper
  // (migration 0123). NULL = not transcribed — AI unset (the ordinary local and
  // degraded path), the model failed, or the mot predates the column — so every
  // reader falls back to the media label rather than treating null as broken.
  // A convenience LABEL, never required reading: the audio stays the source.
  transcript?: string | null
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

// What a mot READS AS on a row, a peek title, or a quoted reply: the first written
// line, else the voice transcript (A5 — « Mémo vocal · Papa » told you nothing about
// a message meant to be glanceable, and told a screen reader even less), else the
// media label, else « Un mot ». One chain, so the card and the peek can't drift.
export function motLabel(m: Mot, labels: { memo: string; drawing: string; photo: string; untitled: string }): string {
  const firstLine = (s: string | null | undefined) => s?.split('\n').find((l) => l.trim())?.trim()
  const line = firstLine(m.text)
  if (line) return line
  const spoken = firstLine(m.transcript)
  if (spoken) return spoken
  if (m.media_kind === 'audio') return labels.memo
  if (m.media_kind === 'drawing') return labels.drawing
  if (m.media_kind === 'image') return labels.photo
  return labels.untitled
}

// A scheduled mot stays hidden until its surface_at moment (NULL = surface now). Pure so the
// gate is unit-tested; applied once in useMots so the inbox, « Déjà vus » and the face dot
// all honour it together.
export function isSurfaced(m: Mot, nowSec: number): boolean {
  return m.surface_at == null || m.surface_at <= nowSec
}

// Still waiting in the future — a « Plus tard » mot whose moment hasn't come. The inverse of
// isSurfaced (a surfaced mot is never "scheduled" anymore). Used by the sender outbox to badge
// a mot as programmed and to offer cancel / reschedule before it lands.
export function isScheduled(m: Mot, nowSec: number): boolean {
  return m.surface_at != null && m.surface_at > nowSec
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

// What « Effacer les déjà vus » actually deletes (bmad/11 tier-2 #3): the SEEN
// mots for a face, minus the KEPT ones.
//
// The exclusion is the whole point, not a detail. A « Gardé » badge is someone
// explicitly saying "I want this", and deleting one already asks a confirm — so a
// broom that quietly took keepsakes along with the rest would be the single way
// this feature could destroy something wanted. Nothing here decays on its own
// either: the sweep only ever runs because a human tapped it.
export function sweepableMots(mots: Mot[], face: string | null): Mot[] {
  return visibleMots(mots, face).filter((m) => m.opened_at != null && m.saved_at == null)
}

// The SENDER's outbox — mots this face authored, newest first, INCLUDING not-yet-surfaced
// scheduled ones (the sender should see + be able to pull back a « Plus tard » before it
// lands). Read off the RAW list (useAllMots), never the surface-gated one. Calm: this is the
// only place opened_at is read as a "was it seen?" status, and only for what YOU sent —
// still presence, never a household-wide unread tally.
export function sentMots(mots: Mot[], authorId: string | null): Mot[] {
  if (!authorId) return []
  return mots.filter((m) => m.author_member_id === authorId).slice().sort((a, b) => b.created_at - a.created_at)
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

// The RAW mots cache — every live mot, INCLUDING not-yet-surfaced scheduled ones. Only the
// sender outbox (which must show + cancel a « Plus tard ») reads this; everything the
// RECIPIENT sees goes through useMots below, which gates the schedule.
//
// `live: false` shares the cache off the poll cadence (like useHabits/useCarnets): the
// toddler board reads mots to hear « un mot pour toi » without adding /api/mots to a locked
// kiosk's poll — realtime nudges + focus refetch still keep it fresh (the free-tier lever).
export function useAllMots(opts?: { live?: boolean }): Mot[] {
  const { data } = useQuery({
    queryKey: MOTS_KEY,
    queryFn: () => api<{ mots: Mot[] }>('mots'),
    ...(opts?.live === false ? { staleTime: 5 * 60_000 } : live),
  })
  return data?.mots ?? []
}

// Shared read of the mots cache (board card + face dots both read it live). SCHEDULED mots
// are gated HERE — the single chokepoint — so a not-yet-surfaced mot is absent from the
// inbox, the « Déjà vus » group AND the face dot at once. The live poll re-renders this, so
// a scheduled mot appears within a poll interval of its surface_at (calm: no push).
export function useMots(opts?: { live?: boolean }): Mot[] {
  const now = Date.now() / 1000
  return useAllMots(opts).filter((m) => isSurfaced(m, now))
}

// Does this specific face have a mot waiting for them? Used by the face-row dot.
// Maisonnée mots are surfaced by the at-rest inbox card, not the dot (see above).
export function useFaceHasWaiting(): (faceId: string) => boolean {
  const ids = waitingRecipientIds(useMots())
  return (faceId: string) => ids.has(faceId)
}
