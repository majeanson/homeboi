import { createContext, useContext } from 'react'
import { useQuery, type QueryKey } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { live } from '../../lib/query'
import { isSharedTripRealtimeConnected } from '../../lib/realtime'
import {
  TRIPS_KEY,
  TRIP_NOTES_KEY,
  TRIP_PACKING_KEY,
  SHARED_TRIPS_KEY,
  SHARED_TRIP_NOTES_KEY,
  SHARED_TRIP_PACKING_KEY,
} from '../../lib/queryKeys'
import type { IconName } from '../Icon'

// « Voyage » shared types + read hooks + the category taxonomy. One place so the
// scene, the board "Prochain voyage" card, and the day-page header agree on shapes
// and on which categories exist (the Infos tab chips + the day-page itinerary).

export interface Trip {
  id: string
  title: string
  destination: string | null
  start_at: number | null
  end_at: number | null
  members: string[] // member-id soft refs (who's going)
  media_kind: string | null
  media_key: string | null
  colour: string
  notes: string | null
  position: number
  created_at: number
  updated_at: number | null
}

export interface TripNote {
  id: string
  trip_id: string
  category: TripCategory
  label: string | null
  text: string
  media_kind: 'audio' | 'drawing' | 'image' | null
  media_key: string | null
  scene_key: string | null
  member_id: string | null
  date: number | null // null = atemporal info; set = an itinerary day
  position: number
  created_at: number
  updated_at: number | null
}

export interface PackingItem {
  id: string
  trip_id: string
  member_id: string | null // null = the shared list
  text: string
  packed_at: number | null
  position: number
  created_at: number
}

// The ONE category set — used by the Infos chips, a note's heading icon, and the
// day-page itinerary (which writes category 'activity'). i18nKey resolves under
// t.voyage.cat.<key>. Icons are all in the shared Phosphor set (no airplane glyph
// exists, so a flight reads 'departure' via the up-right arrow).
export type TripCategory = 'flight' | 'hotel' | 'car' | 'activity' | 'contact' | 'document' | 'general'

export const TRIP_CATEGORIES: { key: TripCategory; icon: IconName }[] = [
  { key: 'flight', icon: 'arrow-up-right-bold' },
  { key: 'hotel', icon: 'key-bold' },
  { key: 'car', icon: 'car-bold' },
  { key: 'activity', icon: 'map-pin-bold' },
  { key: 'contact', icon: 'phone-bold' },
  { key: 'document', icon: 'file-text-bold' },
  { key: 'general', icon: 'push-pin-bold' },
]

export const tripCategoryIcon = (c: TripCategory): IconName =>
  TRIP_CATEGORIES.find((x) => x.key === c)?.icon ?? 'push-pin-bold'

// The board/scene identity glyph for a trip (no suitcase in the set → a map pin).
export const VOYAGE_ICON: IconName = 'map-pin-bold'

// « Voyage partagé » seam — the SAME voyage components (TripNoteAdd / VoyageInfos /
// VoyageItinerary / VoyageDocuments / PackingList) render both a private household
// trip AND a cross-household shared trip. Rather than thread endpoint/query-key props
// through every level, the write/upload call sites read them from this context. The
// DEFAULT value below is the household wiring, so today — no provider mounted anywhere —
// every component behaves byte-identically; the shared-trip page (plan « Voyage
// partagé ») wraps its subtree in a <VoyageApiContext.Provider> supplying the
// 'shared-trip-*' endpoints + keys.
export interface VoyageApi {
  notesEndpoint: string // 'trip-notes' (default) | 'shared-trip-notes'
  packingEndpoint: string // 'trip-packing' | 'shared-trip-packing'
  mediaEndpoint: string // 'trip-doc-media' | 'shared-trip-media'
  notesKey: (tripId: string) => QueryKey // default [...TRIP_NOTES_KEY, tripId]
  packingKey: (tripId: string) => QueryKey // default [...TRIP_PACKING_KEY, tripId]
  shared: boolean // false by default
}

export const VoyageApiContext = createContext<VoyageApi>({
  notesEndpoint: 'trip-notes',
  packingEndpoint: 'trip-packing',
  mediaEndpoint: 'trip-doc-media',
  notesKey: (tripId) => [...TRIP_NOTES_KEY, tripId],
  packingKey: (tripId) => [...TRIP_PACKING_KEY, tripId],
  shared: false,
})

export function useVoyageApi(): VoyageApi {
  return useContext(VoyageApiContext)
}

export function useTrips() {
  return useQuery({ queryKey: TRIPS_KEY, queryFn: () => api<{ trips: Trip[] }>('trips'), ...live })
}

export function useTripNotes(tripId: string | undefined) {
  return useQuery({
    queryKey: [...TRIP_NOTES_KEY, tripId],
    queryFn: () => api<{ notes: TripNote[] }>(`trip-notes?tripId=${tripId}`),
    enabled: !!tripId,
    ...live,
  })
}

export function useTripPacking(tripId: string | undefined) {
  return useQuery({
    queryKey: [...TRIP_PACKING_KEY, tripId],
    queryFn: () => api<{ items: PackingItem[] }>(`trip-packing?tripId=${tripId}`),
    enabled: !!tripId,
    ...live,
  })
}

// ---- « Voyage partagé » — the cross-household shared trip ---------------------
//
// A shared trip lives in the capability-scoped shared_trips store (migration 0101),
// NOT a household's trips. The SAME voyage components render it through the VoyageApi
// context above pointed at the 'shared-trip-*' endpoints; these hooks + types feed
// SharedVoyagePage / SharedPackingList / the board card the way useTrips feeds the
// household ones. Attribution is a HOUSEHOLD (a membership), never a member id.

// A live membership on a shared trip — a pseudo-face for attribution (household name +
// colour, no photo). Mirrors the `members` array the shared-trip handler shapes.
// (Not exported: consumed only via SharedTrip.members, so no external import needs it.)
interface SharedTripMember {
  household_id: string
  label: string
  colour: string
  role: string // 'owner' | 'member'
}

// One shared trip as shaped by functions/api/shared-trip.ts (SharedTripRow + members +
// myRole). Same field set as Trip minus per-member scoping, plus the membership roster.
export interface SharedTrip {
  id: string
  owner_household_id: string
  title: string
  destination: string | null
  start_at: number | null
  end_at: number | null
  media_kind: string | null
  media_key: string | null
  colour: string
  notes: string | null
  invite_nonce: string
  position: number
  created_at: number
  updated_at: number | null
  members: SharedTripMember[]
  myRole: string // this household's role on the trip
}

// A shared_trip_notes row (functions/api/shared-trip-notes.ts). Same shape as TripNote
// minus member scoping: attribution is author_household_id + a free-text author_label.
export interface SharedTripNote {
  id: string
  shared_trip_id: string
  category: TripCategory
  label: string | null
  text: string
  media_kind: 'audio' | 'drawing' | 'image' | null
  media_key: string | null
  scene_key: string | null
  author_household_id: string | null
  author_label: string | null
  date: number | null
  position: number
  created_at: number
  updated_at: number | null
}

// A shared_trip_packing row (functions/api/shared-trip-packing.ts). Scoped by HOUSEHOLD,
// not member: household_id is whose bag / who may edit; bag_label NULL = the shared bag.
export interface SharedPackingItem {
  id: string
  shared_trip_id: string
  household_id: string
  bag_label: string | null
  text: string
  packed_at: number | null
  position: number
  created_at: number
}

// Poll config for a shared-trip query. Mirrors `live` (src/lib/query.ts) but keyed off
// the PAGE-scoped st: socket (isSharedTripRealtimeConnected(id)), NOT the household
// socket: when THIS trip's push is live, polling drops to a slow safety heartbeat;
// when it's down, polling owns freshness and runs fast. `meta.live` tags it so the
// wake-refetch + the drop catch-up refetch (realtime.ts) include it.
const SHARED_ACTIVE_POLL_MS = 10_000 // no push → fast poll owns freshness
const SHARED_RT_POLL_MS = 60_000 // push live → slow safety heartbeat (push owns instant)
function sharedLive(sharedTripId: string) {
  return {
    refetchInterval: () => (isSharedTripRealtimeConnected(sharedTripId) ? SHARED_RT_POLL_MS : SHARED_ACTIVE_POLL_MS),
    refetchOnWindowFocus: true,
    staleTime: 0,
    meta: { live: true },
  } as const
}

// The list of shared trips this household is a live member of (board card + discovery).
export function useSharedTrips() {
  return useQuery({
    queryKey: SHARED_TRIPS_KEY,
    queryFn: () => api<{ trips: SharedTrip[] }>('shared-trip'),
    ...live,
  })
}

// ONE shared trip by id (the single GET → 404/403 cleanly for a non-member, unlike
// filtering the list). Also returns myHouseholdId so the page can tell OWN vs other
// households' packing bags apart. Keyed under the SHARED_TRIPS_KEY prefix so a
// meta PATCH invalidating ['shared-trips'] refreshes both the list and this single.
export function useSharedTrip(id: string | undefined) {
  return useQuery({
    queryKey: [...SHARED_TRIPS_KEY, id],
    queryFn: () => api<{ trip: SharedTrip; myHouseholdId: string }>(`shared-trip?id=${id}`),
    enabled: !!id,
    ...sharedLive(id ?? ''),
  })
}

export function useSharedTripNotes(id: string | undefined) {
  return useQuery({
    queryKey: [...SHARED_TRIP_NOTES_KEY, id],
    queryFn: () => api<{ notes: SharedTripNote[] }>(`shared-trip-notes?tripId=${id}`),
    enabled: !!id,
    ...sharedLive(id ?? ''),
  })
}

export function useSharedTripPacking(id: string | undefined) {
  return useQuery({
    queryKey: [...SHARED_TRIP_PACKING_KEY, id],
    queryFn: () => api<{ items: SharedPackingItem[] }>(`shared-trip-packing?tripId=${id}`),
    enabled: !!id,
    ...sharedLive(id ?? ''),
  })
}

// Adapt a shared note to the existing TripNote shape so VoyageInfos / VoyageItinerary /
// VoyageDocuments / TripNoteCard render it UNCHANGED. member_id is mapped from
// author_household_id: the page passes household pseudo-faces (id = household_id), so a
// note's attribution resolves to the AUTHORING household's name/colour — the same
// `who={memberName(n.member_id)}` path the household trip uses. Pure (unit-tested).
export function sharedNoteToTripNote(n: SharedTripNote): TripNote {
  return {
    id: n.id,
    trip_id: n.shared_trip_id,
    category: n.category,
    label: n.label,
    text: n.text,
    media_kind: n.media_kind,
    media_key: n.media_key,
    scene_key: n.scene_key,
    member_id: n.author_household_id,
    date: n.date,
    position: n.position,
    created_at: n.created_at,
    updated_at: n.updated_at,
  }
}

// Reorder one itinerary day's entries — the drag→{ id, position }-PATCH derivation
// now lives in lib/reorder (the cercle/board notes list reorders the same way);
// re-exported here so the itinerary call sites + tests keep their import.
export { reorderPatches } from '../../lib/reorder'

// A compact "12 juin – 18 juin" / "12 juin" range — the scene subtitle and the
// album meta line read the same words.
import { formatDayLong, capitalize as cap } from '../../lib/format'
export function tripDateLabel(trip: Trip, lang: 'fr' | 'en'): string {
  if (trip.start_at == null) return ''
  const a = cap(formatDayLong(trip.start_at, lang))
  if (trip.end_at == null || trip.end_at === trip.start_at) return a
  return `${a} – ${cap(formatDayLong(trip.end_at, lang))}`
}

// The inclusive list of local-midnight day starts a trip spans (for the itinerary
// tab + the calendar band). Empty when either bound is missing. Capped so a typo'd
// range can't blow up the UI. Reuses addLocalDays (DST-safe) from the day helpers.
import { addLocalDays } from '../../lib/localDay'
export function tripDays(start: number | null, end: number | null, max = 120): number[] {
  if (start == null || end == null || end < start) return []
  const out: number[] = []
  for (let d = start; d <= end && out.length < max; d = addLocalDays(d, 1)) out.push(d)
  return out
}
