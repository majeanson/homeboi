import { useQuery } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { live } from '../../lib/query'
import { TRIPS_KEY, TRIP_NOTES_KEY, TRIP_PACKING_KEY } from '../../lib/queryKeys'
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
