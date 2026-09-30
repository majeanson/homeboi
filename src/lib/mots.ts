import { useQuery } from '@tanstack/react-query'
import { api } from './api'
import { live } from './query'
import { MOTS_KEY } from './queryKeys'

// « Mots » — the fridge, read as MOTS: a paper that may be addressed to one face, may wait
// unopened on it, may be kept, may be scheduled. ONE table since 2026-09-29 (migration
// 0142): the member-to-member « Laisse un mot » (its own `mots` table until then) moved
// onto the fridge notes. This module keeps the shape every reader already used — so the
// face dot, Souvenirs, the toddler board, « Pour toi » and search read the one table
// without learning a second vocabulary — and maps the wire row onto it in ONE place.
type MotMedia = 'audio' | 'drawing' | 'image'

export interface Mot {
  id: string
  member_id: string | null // RECIPIENT scope: NULL = Maisonnée (everyone) — notes.for_member_id
  author_member_id: string | null // AUTHOR (pick-your-face) — notes.member_id
  text: string
  // A voice note's words, filled in behind the send by Workers AI Whisper (0123 on mots,
  // 0142 on notes). NULL = not transcribed — AI unset, the model failed, or it predates
  // the column — so every reader falls back to the media label. A convenience LABEL,
  // never required reading: the audio stays the source.
  transcript?: string | null
  media_kind: MotMedia | null
  media_key: string | null
  scene_key: string | null
  created_at: number
  updated_at: number | null
  opened_at: number | null // NULL = still waiting (drives the face dot) — addressed ones only
  saved_at: number | null // NULL = not kept; set = on the Souvenirs shelf
  surface_at: number | null // NULL = surface now; else hidden until this unix second (scheduled)
  // Retired from the fridge. Only a KEPT one comes back from the server like this — the
  // Souvenirs shelf still shows it; nothing else does.
  dismissed_at: number | null
  // Who left it when it arrived through « La boîte aux lettres » — « — Papi ».
  author_label: string | null
}

// The /api/notes row, as the server sends it.
interface NoteWire {
  id: string
  text: string
  member_id: string | null
  for_member_id: string | null
  created_at: number
  updated_at: number | null
  media_kind: MotMedia | null
  media_key: string | null
  scene_key: string | null
  opened_at: number | null
  saved_at: number | null
  surface_at: number | null
  transcript: string | null
  dismissed_at: number | null
  author_label: string | null
}

// The ONE mapping. `member_id` means the RECIPIENT on a Mot and the AUTHOR on a note
// row — a trap written down once, here, instead of in every reader.
export function motFromNote(n: NoteWire): Mot {
  return {
    id: n.id,
    member_id: n.for_member_id,
    author_member_id: n.member_id,
    text: n.text ?? '',
    transcript: n.transcript,
    media_kind: n.media_kind,
    media_key: n.media_key,
    scene_key: n.scene_key,
    created_at: n.created_at,
    updated_at: n.updated_at,
    opened_at: n.opened_at,
    saved_at: n.saved_at,
    surface_at: n.surface_at,
    dismissed_at: n.dismissed_at ?? null,
    author_label: n.author_label ?? null,
  }
}

// What a mot READS AS on a row or a peek title: the first written line, else the voice
// transcript (A5 — « Mémo vocal · Papa » told you nothing about a message meant to be
// glanceable, and told a screen reader even less), else the media label, else « Un mot ».
// One chain, so the card and the peek can't drift.
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
// gate is unit-tested; applied once in useMots so every recipient-side reader honours it.
export function isSurfaced(m: Mot, nowSec: number): boolean {
  return m.surface_at == null || m.surface_at <= nowSec
}

// Still waiting in the future — a « Plus tard » mot whose moment hasn't come. Used by the
// author's outbox to badge it as programmed and to offer moving it before it lands.
export function isScheduled(m: Mot, nowSec: number): boolean {
  return m.surface_at != null && m.surface_at > nowSec
}

// On the fridge right now (not retired). A kept-and-retired one lives on the shelf only.
const onFridge = (m: Mot) => m.dismissed_at == null

// The viewing filter (mirrors familyNotes.visibleNotes): a picked face sees THEIR mots
// PLUS the Maisonnée ones always; "Maisonnée" (face null) sees only the family-wide mots.
// Newest first.
export function visibleMots(mots: Mot[], face: string | null): Mot[] {
  const base = mots.filter(onFridge).filter((m) => m.member_id === null || (face != null && m.member_id === face))
  return base.slice().sort((a, b) => b.created_at - a.created_at)
}

// The unopened mots waiting for ONE face — the « un mot pour toi » set. Only an ADDRESSED
// mot can wait: a family-wide one is simply on the fridge for everyone to see (every fridge
// paper is a mot since 0142, and « waiting » on them all would be a count of the fridge).
export function waitingMots(mots: Mot[], face: string | null): Mot[] {
  if (!face) return []
  return visibleMots(mots, face).filter((m) => m.member_id === face && m.opened_at == null)
}

// The kept keepsakes for a face — the Souvenirs shelf. INCLUDES the ones already retired
// from the fridge: keeping is exactly what makes them outlive it.
export function savedMots(mots: Mot[], face: string | null): Mot[] {
  return mots
    .filter((m) => m.saved_at != null && (m.member_id === null || (face != null && m.member_id === face)))
    .sort((a, b) => b.created_at - a.created_at)
}

// The AUTHOR's outbox — mots this face left FOR SOMEONE (addressed, or scheduled), newest
// first, INCLUDING not-yet-surfaced ones (the author should see + move a « Plus tard »
// before it lands). An ordinary family-wide paper is not « sent »: it is just on the
// fridge, where its author already sees it. Calm: the only place opened_at reads as a
// "was it seen?" status, and only for what YOU sent — presence, never a tally.
export function sentMots(mots: Mot[], authorId: string | null): Mot[] {
  if (!authorId) return []
  const now = Date.now() / 1000
  return mots
    .filter(onFridge)
    .filter((m) => m.author_member_id === authorId && (m.member_id !== null || isScheduled(m, now)))
    .sort((a, b) => b.created_at - a.created_at)
}

// Member ids with ≥1 unopened mot addressed TO THEM — feeds the per-face presence DOT.
// Family-wide mots are excluded: they're on the fridge for everyone already. The dot's job
// is the case the fridge can't show at rest — a mot for one specific person. Boolean
// presence only, never a count (NFR-CALM).
export function waitingRecipientIds(mots: Mot[]): Set<string> {
  const ids = new Set<string>()
  for (const m of mots) {
    if (onFridge(m) && m.opened_at == null && m.member_id !== null) ids.add(m.member_id)
  }
  return ids
}

// The RAW cache — every live mot, INCLUDING not-yet-surfaced scheduled ones and kept ones
// already retired. Only the outbox and the shelf read this raw; everything the RECIPIENT
// sees goes through useMots below, which gates the schedule.
//
// `live: false` shares the cache off the poll cadence (like useHabits/useCarnets): the
// toddler board reads mots to hear « un mot pour toi » without adding a poll to a locked
// kiosk — realtime nudges + focus refetch still keep it fresh (the free-tier lever).
//
// The cache holds the WIRE shape (`{ notes }`, exactly what /api/notes answers) and the
// mapping runs in `select`: the discovery probe reads the same key raw (lib/discovery),
// and one key holding two shapes is how a probe and a card quietly break each other.
export function useAllMots(opts?: { live?: boolean }): Mot[] {
  const { data } = useQuery({
    queryKey: MOTS_KEY,
    queryFn: () => api<{ notes: NoteWire[] }>('notes'),
    select: (d) => (d?.notes ?? []).map(motFromNote),
    ...(opts?.live === false ? { staleTime: 5 * 60_000 } : live),
  })
  return data ?? []
}

// Shared read of the cache with SCHEDULED mots gated out — the single chokepoint, so a
// not-yet-surfaced mot is absent from the dot, « Pour toi » and the toddler tiles at once.
export function useMots(opts?: { live?: boolean }): Mot[] {
  const now = Date.now() / 1000
  return useAllMots(opts).filter((m) => isSurfaced(m, now))
}

// Does this specific face have a mot waiting for them? Used by the face-row dot.
export function useFaceHasWaiting(): (faceId: string) => boolean {
  const ids = waitingRecipientIds(useMots())
  return (faceId: string) => ids.has(faceId)
}
