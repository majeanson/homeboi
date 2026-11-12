import { useT } from '../../i18n'
import { useTabParam } from '../../lib/tabParam'
import { SubTabs } from '../SubTabs'
import type { MemberFace } from '../MemberSwitcher'
import { VoyageInfos } from './VoyageInfos'
import { VoyageItinerary } from './VoyageItinerary'
import { VoyageDocuments } from './VoyageDocuments'
import { SharedPackingList } from './SharedPackingList'
import { SharedGearList, SharedMealPlan, type ClaimFace } from './SharedClaims'
import type { SharedPackingItem, SharedTripClaim, Trip, TripNote } from './voyage'

// The BODY of a shared trip — its five sub-tabs — rendered by BOTH the member scene
// (SharedVoyagePage, inside the 'shared-trip-*' VoyageApi) and the public invite preview
// (SharedVoyageJoinPage, inside the same context with `readOnly`). One body so a friend
// who has no account yet sees exactly what joining gives them, never a lookalike that
// drifts (Marc, 2026-11-12: « so they can see what it would look like »).
//
//   itineraire · repas (« Qui cuisine ») · infos · bagages (« Qui apporte quoi » + bags) · documents

const VUES = ['itineraire', 'repas', 'infos', 'bagages', 'documents'] as const

export function SharedTripTabs({
  trip,
  roster,
  notes,
  packing,
  claims,
  myHouseholdId,
}: {
  /** The Trip-shaped view the shared children read (id / dates / media / title). */
  trip: Trip
  roster: ClaimFace[]
  notes: TripNote[]
  packing: SharedPackingItem[]
  claims: SharedTripClaim[]
  /** '' in the public preview — nobody is « me ». */
  myHouseholdId: string
}) {
  const t = useT()
  const [vue, setVue] = useTabParam('vue', 'itineraire', VUES)
  // Pseudo-faces from the roster (id = household id or preview alias) — attribution for
  // notes (sharedNoteToTripNote maps author_household_id → member_id).
  const faces: MemberFace[] = roster.map((m) => ({ id: m.household_id, name: m.label, colour: m.colour, photoUrl: null }))
  const common = { tripId: trip.id, claims, faces: roster, myHouseholdId }

  return (
    <>
      <SubTabs
        ariaLabel={t.voyage.sections}
        value={vue}
        onSelect={setVue}
        options={[
          { key: 'itineraire', label: t.voyage.tabItinerary, icon: 'calendar-dots-bold' },
          { key: 'repas', label: t.sharedVoyage.tabMeals, icon: 'fork-knife-bold' },
          { key: 'infos', label: t.voyage.tabInfos, icon: 'push-pin-bold' },
          { key: 'bagages', label: t.voyage.tabPacking, icon: 'shopping-bag-bold' },
          { key: 'documents', label: t.voyage.tabDocuments, icon: 'file-text-bold' },
        ]}
      />
      {vue === 'itineraire' && <VoyageItinerary trip={trip} notes={notes} faces={faces} />}
      {vue === 'repas' && <SharedMealPlan {...common} start={trip.start_at} end={trip.end_at} />}
      {vue === 'infos' && <VoyageInfos trip={trip} notes={notes} faces={faces} />}
      {vue === 'bagages' && (
        <>
          {/* The trip's common gear leads: it is what a group of friends has to settle
              BEFORE anyone packs a bag (one stove, not four). */}
          <SharedGearList {...common} />
          <SharedPackingList trip={{ id: trip.id, members: roster.map((r) => ({ ...r, role: '' })) }} items={packing} myHouseholdId={myHouseholdId} />
        </>
      )}
      {vue === 'documents' && <VoyageDocuments trip={trip} notes={notes} />}
    </>
  )
}
