import { useEffect, useState } from 'react'
import { Link, useParams, useNavigate } from 'react-router-dom'
import { ApiError, isUnauthorized } from '../lib/api'
import { queryClient } from '../lib/query'
import { useWrite } from '../lib/write'
import { useConfirm } from '../lib/confirm'
import { useT, useLang } from '../i18n'
import { formatDayLong, capitalize as cap } from '../lib/format'
import { isGuest } from '../lib/device'
import { useSceneClose, useEscapeKey } from '../lib/sceneNav'
import { useTabParam } from '../lib/tabParam'
import { SHARED_TRIPS_KEY, SHARED_TRIP_NOTES_KEY, SHARED_TRIP_PACKING_KEY, TRIPS_KEY, BOARD_KEY, MONTH_KEY } from '../lib/queryKeys'
import { connectSharedTripRealtime } from '../lib/realtime'
import { PairPrompt } from '../components/Fallback'
import { StatusMessage } from '../components/StatusMessage'
import { SceneHead } from '../components/SceneHead'
import { SubTabs } from '../components/SubTabs'
import { Chip } from '../components/Chip'
import { Icon } from '../components/Icon'
import { EmptyState } from '../components/EmptyState'
import { ColorPicker } from '../components/ColorPicker'
import type { MemberFace } from '../components/MemberSwitcher'
import { DetailProvider } from '../components/detail/DetailProvider'
import {
  useSharedTrip,
  useSharedTripNotes,
  useSharedTripPacking,
  sharedNoteToTripNote,
  VoyageApiContext,
  VOYAGE_ICON,
  type VoyageApi,
  type SharedTrip,
  type Trip,
} from '../components/voyage/voyage'
import { VoyageInfos } from '../components/voyage/VoyageInfos'
import { VoyageItinerary } from '../components/voyage/VoyageItinerary'
import { VoyageDocuments } from '../components/voyage/VoyageDocuments'
import { SharedPackingList } from '../components/voyage/SharedPackingList'
import { VoyageShareModal } from '../components/voyage/VoyageShareModal'

// « Voyage partagé » — the shared-trip twin of VoyagePage: ONE trip live-edited by up to
// 6 households, a full-screen scene at /voyage/partage/:id. It renders the SAME four
// sub-tab components as the private trip by wrapping its subtree in a VoyageApiContext
// pointed at the 'shared-trip-*' endpoints + keys (so writes go to the shared store);
// only Bagages differs (SharedPackingList — per-household bags). Attribution is a
// HOUSEHOLD: notes render through sharedNoteToTripNote against pseudo-faces built from
// the membership roster. A page-scoped st: realtime socket (connectSharedTripRealtime)
// nudges every open board when another household writes; polling is the fallback.
export function SharedVoyagePage() {
  return (
    <DetailProvider>
      <SharedVoyageInner />
    </DetailProvider>
  )
}

const VUES = ['itineraire', 'infos', 'bagages', 'documents'] as const

// The shared-trip context: same shape as the household default, pointed at the
// 'shared-trip-*' endpoints + keys. Static, so it lives at module scope.
const SHARED_API: VoyageApi = {
  notesEndpoint: 'shared-trip-notes',
  packingEndpoint: 'shared-trip-packing',
  mediaEndpoint: 'shared-trip-media',
  notesKey: (tid) => [...SHARED_TRIP_NOTES_KEY, tid],
  packingKey: (tid) => [...SHARED_TRIP_PACKING_KEY, tid],
  shared: true,
}

// `<input type="date">` ⇄ local-midnight unix seconds (same convention as VoyagePage).
const secToDateInput = (sec: number | null): string => {
  if (sec == null) return ''
  const d = new Date(sec * 1000)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const dateInputToSec = (ymd: string): number | null =>
  ymd ? Math.floor(new Date(`${ymd}T00:00`).getTime() / 1000) : null

function SharedVoyageInner() {
  const t = useT()
  const { lang } = useLang()
  const close = useSceneClose('/board')
  useEscapeKey(close)
  const { id } = useParams()
  const nav = useNavigate()
  const write = useWrite()
  const confirm = useConfirm()
  const [editing, setEditing] = useState(false)
  const [sharing, setSharing] = useState(false)
  const [actErr, setActErr] = useState<string | null>(null)
  const [vue, setVue] = useTabParam('vue', 'itineraire', VUES)

  const tripQ = useSharedTrip(id)
  const notesQ = useSharedTripNotes(id)
  const packingQ = useSharedTripPacking(id)

  // Open the page-scoped st: realtime socket while this trip is mounted (the returned
  // function IS the cleanup). Uses the shared singleton queryClient so invalidations
  // land in the same cache the hooks read from.
  useEffect(() => {
    if (!id) return
    return connectSharedTripRealtime(queryClient, id)
  }, [id])

  // A signed-out visitor (401) needs to sign in — the pair/sign-in door, like VoyagePage.
  if (isUnauthorized(tripQ.error)) return <PairPrompt />

  const trip = tripQ.data?.trip
  const myHouseholdId = tripQ.data?.myHouseholdId ?? ''

  // Dissolved (404) or no-longer-a-member (403 after leaving / being removed): a calm
  // "n'existe plus" with a way back — never an error page.
  const gone = tripQ.error instanceof ApiError && (tripQ.error.status === 404 || tripQ.error.status === 403)
  if (gone || (!trip && !tripQ.isLoading)) {
    return (
      <div className="scene" aria-label={t.voyage.title}>
        <SceneHead title={t.voyage.title} card="voyage" onClose={close} closeLabel={t.common.close} />
        <div className="scene__body">
          <EmptyState tone="calm">{t.sharedVoyage.gone}</EmptyState>
          <p className="voyage-form__hint mono">{t.sharedVoyage.goneHint}</p>
          <Link className="btn btn--ghost mono" to="/board">
            <Icon name="arrow-left-bold" size={15} /> {t.sharedVoyage.backToBoard}
          </Link>
        </div>
      </div>
    )
  }

  if (!trip) {
    return (
      <div className="scene" aria-label={t.voyage.title}>
        <SceneHead title={t.voyage.title} card="voyage" onClose={close} closeLabel={t.common.close} />
        <div className="scene__body">
          <p className="loading mono">{t.common.loading}</p>
        </div>
      </div>
    )
  }

  if (editing) return <SharedVoyageForm trip={trip} onClose={() => setEditing(false)} />

  const isOwner = trip.myRole === 'owner'

  // « Quitter le voyage » — drop our household's grant. Always visible in the scene
  // foot (not buried in the share sheet): the way OUT must be as findable as the way
  // in. Two quick confirms: the leave itself (danger — access is lost, a new invite
  // link is needed to come back), then whether to export a private copy first.
  async function leaveTrip() {
    if (!(await confirm({ message: t.sharedVoyage.leaveConfirm, confirmLabel: t.sharedVoyage.leave, tone: 'danger' })))
      return
    const keep = await confirm({
      message: t.sharedVoyage.keepCopyAsk,
      confirmLabel: t.sharedVoyage.keepCopyYes,
      cancelLabel: t.sharedVoyage.keepCopyNo,
      tone: 'default',
    })
    try {
      await write('shared-trip-leave', {
        method: 'POST',
        body: { sharedTripId: trip!.id, keepCopy: keep },
        // keepCopy exports a private trip → refresh the household trip surfaces too.
        affectedKeys: [SHARED_TRIPS_KEY, TRIPS_KEY, BOARD_KEY, MONTH_KEY],
      })
      nav('/board')
    } catch (e) {
      setActErr((e as Error).message)
    }
  }

  // « Dissoudre » — the owner's way out (v1 has no ownership transfer): tears the trip
  // down for every household. Heavy + unrecoverable → danger confirm, never an undo.
  async function dissolveTrip() {
    if (!(await confirm({ message: t.sharedVoyage.dissolveConfirm, confirmLabel: t.sharedVoyage.dissolve, tone: 'danger' })))
      return
    try {
      await write('shared-trip', {
        method: 'DELETE',
        body: { id: trip!.id },
        affectedKeys: [SHARED_TRIPS_KEY, TRIPS_KEY, BOARD_KEY, MONTH_KEY],
      })
      nav('/board')
    } catch (e) {
      setActErr((e as Error).message)
    }
  }

  // Pseudo-faces from the membership roster (id = household_id, no photo) — attribution
  // for notes (sharedNoteToTripNote maps author_household_id → member_id).
  const faces: MemberFace[] = trip.members.map((m) => ({ id: m.household_id, name: m.label, colour: m.colour, photoUrl: null }))
  // A Trip-shaped view for the shared children (they read id / dates / media / title only).
  const tripForChildren: Trip = {
    id: trip.id,
    title: trip.title,
    destination: trip.destination,
    start_at: trip.start_at,
    end_at: trip.end_at,
    members: [],
    media_kind: trip.media_kind,
    media_key: trip.media_key,
    colour: trip.colour,
    notes: trip.notes,
    position: trip.position,
    created_at: trip.created_at,
    updated_at: trip.updated_at,
  }
  const notes = (notesQ.data?.notes ?? []).map(sharedNoteToTripNote)
  const packing = packingQ.data?.items ?? []

  return (
    <VoyageApiContext.Provider value={SHARED_API}>
      <div className="scene" aria-label={trip.title}>
        <SceneHead
          title={
            <>
              <Icon name={VOYAGE_ICON} size={20} style={{ display: 'inline-block', verticalAlign: '-0.2em' }} /> {trip.title}{' '}
              {/* The badge IS the door to the share sheet — reachable without scrolling
                  to the foot (the sheet holds the invite link + household roster). */}
              <Chip icon="users-three-bold" onClick={() => setSharing(true)} ariaLabel={t.sharedVoyage.shareTitle} title={t.sharedVoyage.shareTitle}>
                {t.sharedVoyage.badge}
              </Chip>
            </>
          }
          subtitle={[trip.destination, tripDateLabel(trip, lang)].filter(Boolean).join(' · ') || undefined}
          card="voyage"
          onClose={close}
          closeLabel={t.common.close}
        />
        <div className="scene__body">
          <SubTabs
            ariaLabel={t.voyage.sections}
            value={vue}
            onSelect={setVue}
            options={[
              { key: 'itineraire', label: t.voyage.tabItinerary, icon: 'calendar-dots-bold' },
              { key: 'infos', label: t.voyage.tabInfos, icon: 'push-pin-bold' },
              { key: 'bagages', label: t.voyage.tabPacking, icon: 'shopping-bag-bold' },
              { key: 'documents', label: t.voyage.tabDocuments, icon: 'file-text-bold' },
            ]}
          />
          {vue === 'itineraire' && <VoyageItinerary trip={tripForChildren} notes={notes} faces={faces} />}
          {vue === 'infos' && <VoyageInfos trip={tripForChildren} notes={notes} faces={faces} />}
          {vue === 'bagages' && <SharedPackingList trip={trip} items={packing} myHouseholdId={myHouseholdId} />}
          {vue === 'documents' && <VoyageDocuments trip={tripForChildren} notes={notes} />}

          {!isGuest() && (
            <>
              {actErr && <StatusMessage tone="error">{actErr}</StatusMessage>}
              <div className="voyage__foot voyage-share__foot">
                <button type="button" className="btn btn--ghost mono" onClick={() => setEditing(true)}>
                  <Icon name="pencil-simple-bold" size={15} /> {t.sharedVoyage.editTrip}
                </button>
                {/* The membership lifecycle lives HERE, always visible — leaving must not
                    hide behind « Inviter ». Members leave; the owner dissolves (v1 has no
                    ownership transfer). */}
                {isOwner ? (
                  <button type="button" className="btn btn--ghost mono voyage-form__delete" onClick={() => void dissolveTrip()}>
                    <Icon name="trash-bold" size={15} /> {t.sharedVoyage.dissolve}
                  </button>
                ) : (
                  <button type="button" className="btn btn--ghost mono voyage-form__delete" onClick={() => void leaveTrip()}>
                    <Icon name="door-bold" size={15} /> {t.sharedVoyage.leave}
                  </button>
                )}
                <button type="button" className="btn btn--primary mono" onClick={() => setSharing(true)}>
                  <Icon name="users-three-bold" size={15} /> {t.sharedVoyage.invite}
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      <VoyageShareModal open={sharing} onClose={() => setSharing(false)} trip={trip} myHouseholdId={myHouseholdId} />
    </VoyageApiContext.Provider>
  )
}

// A compact "12 juin – 18 juin" / "12 juin" range for the subtitle.
function tripDateLabel(trip: SharedTrip, lang: 'fr' | 'en'): string {
  if (trip.start_at == null) return ''
  const a = cap(formatDayLong(trip.start_at, lang))
  if (trip.end_at == null || trip.end_at === trip.start_at) return a
  return `${a} – ${cap(formatDayLong(trip.end_at, lang))}`
}

// The shared-trip meta edit: title / destination / dates / colour (no member chips —
// who's on a shared trip is the household roster, managed via « Inviter »). Any member
// may edit (last-write-wins). PATCH invalidates the SHARED_TRIPS_KEY prefix, which
// covers both the list and this single trip's cache.
function SharedVoyageForm({ trip, onClose }: { trip: SharedTrip; onClose: () => void }) {
  const t = useT()
  const write = useWrite()
  useEscapeKey(onClose)
  const [title, setTitle] = useState(trip.title)
  const [destination, setDestination] = useState(trip.destination ?? '')
  const [start, setStart] = useState(secToDateInput(trip.start_at))
  const [end, setEnd] = useState(secToDateInput(trip.end_at))
  const [colour, setColour] = useState(trip.colour)
  const [busy, setBusy] = useState(false)

  async function save() {
    const value = title.trim()
    if (!value || busy) return
    setBusy(true)
    try {
      await write('shared-trip', {
        method: 'PATCH',
        body: {
          id: trip.id,
          title: value,
          destination: destination.trim() || null,
          startAt: dateInputToSec(start),
          endAt: dateInputToSec(end),
          colour,
        },
        affectedKeys: [SHARED_TRIPS_KEY],
      })
      onClose()
    } catch {
      setBusy(false)
    }
  }

  return (
    <div className="scene" aria-label={t.sharedVoyage.editTrip}>
      <SceneHead title={t.sharedVoyage.editTrip} card="voyage" onClose={onClose} closeLabel={t.common.close} />
      <div className="scene__body voyage-form">
        <label className="voyage-form__label mono">{t.voyage.tripName}</label>
        <input
          className="input"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={t.voyage.tripNamePlaceholder}
          aria-label={t.voyage.tripName}
        />
        <label className="voyage-form__label mono">{t.voyage.destination}</label>
        <input
          className="input"
          value={destination}
          onChange={(e) => setDestination(e.target.value)}
          placeholder={t.voyage.destinationPlaceholder}
          aria-label={t.voyage.destination}
        />
        <div className="voyage-form__dates">
          <span className="voyage-form__date">
            <label className="voyage-form__label mono">{t.voyage.startDate}</label>
            <input className="input" type="date" value={start} max={end || undefined} onChange={(e) => setStart(e.target.value)} />
          </span>
          <span className="voyage-form__date">
            <label className="voyage-form__label mono">{t.voyage.endDate}</label>
            <input className="input" type="date" value={end} min={start || undefined} onChange={(e) => setEnd(e.target.value)} />
          </span>
        </div>
        <label className="voyage-form__label mono">{t.sharedVoyage.tripColour}</label>
        <ColorPicker value={colour} onChange={setColour} label={t.sharedVoyage.tripColour} />
        <button
          type="button"
          className="btn btn--primary voyage-form__submit"
          onClick={() => void save()}
          disabled={busy || !title.trim()}
        >
          <Icon name="check-bold" size={18} /> {t.common.save}
        </button>
      </div>
    </div>
  )
}
