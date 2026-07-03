import { useMemo, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api, isUnauthorized } from '../lib/api'
import { useWrite } from '../lib/write'
import { useT, useLang } from '../i18n'
import { live } from '../lib/query'
import { imgUrl } from '../lib/image'
import { isGuest } from '../lib/device'
import { formatDayLong, capitalize as cap } from '../lib/format'
import { useSceneClose, useEscapeKey } from '../lib/sceneNav'
import { useTabParam } from '../lib/tabParam'
import { MEMBERS_KEY, TRIPS_KEY, BOARD_KEY, MONTH_KEY, SHARED_TRIPS_KEY } from '../lib/queryKeys'
import { useConfirm } from '../lib/confirm'
import type { Member } from '../lib/members'
import { PairPrompt } from '../components/Fallback'
import { SceneHead } from '../components/SceneHead'
import { SubTabs } from '../components/SubTabs'
import { Chip, ChipGroup } from '../components/Chip'
import { Icon } from '../components/Icon'
import type { MemberFace } from '../components/MemberSwitcher'
import { DetailProvider } from '../components/detail/DetailProvider'
import { useTrips, useTripNotes, useTripPacking, VOYAGE_ICON, type Trip } from '../components/voyage/voyage'
import { VoyageInfos } from '../components/voyage/VoyageInfos'
import { VoyageItinerary } from '../components/voyage/VoyageItinerary'
import { PackingList } from '../components/voyage/PackingList'
import { VoyageDocuments } from '../components/voyage/VoyageDocuments'

// « Voyage » — the trip notebook (Carnet de voyage) as a full-screen scene. New trip
// (/voyage/new) → a create form; an existing trip (/voyage/:id) → four sub-tabs
// (Itinéraire · Infos · Bagages · Documents), or its edit form. Standalone (outside
// HubLayout), wrapped in its own DetailProvider like DayPlanPage. Operator-only data;
// a guest never reaches the trip endpoints (they 403), so an unauthorized read just
// shows the pair/sign-in prompt.
export function VoyagePage() {
  return (
    <DetailProvider>
      <VoyageInner />
    </DetailProvider>
  )
}

const VUES = ['itineraire', 'infos', 'bagages', 'documents'] as const

// `<input type="date">` ⇄ local-midnight unix seconds, the same browser-local
// convention EventForm uses (single-TZ household → matches the server's day buckets).
const secToDateInput = (sec: number | null): string => {
  if (sec == null) return ''
  const d = new Date(sec * 1000)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const dateInputToSec = (ymd: string): number | null =>
  ymd ? Math.floor(new Date(`${ymd}T00:00`).getTime() / 1000) : null

function VoyageInner() {
  const t = useT()
  const { lang } = useLang()
  const nav = useNavigate()
  const write = useWrite()
  const confirm = useConfirm()
  const close = useSceneClose('/board')
  useEscapeKey(close)
  const { id } = useParams()
  // The /voyage/new route is STATIC (no :id segment), so useParams().id is undefined
  // there — `!id` is what marks "create". (`=== 'new'` is kept defensively in case the
  // URL is ever reached via the :id route.)
  const isNew = !id || id === 'new'
  const [editing, setEditing] = useState(false)

  const tripsQ = useTrips()
  const trip = useMemo(() => tripsQ.data?.trips.find((x) => x.id === id), [tripsQ.data, id])

  // Household roster → faces for the member picker, per-member packing, and the
  // "kids/parents stuff" note scoping. Raw snake_case rows (never remap — members.ts).
  const membersQ = useQuery({ queryKey: MEMBERS_KEY, queryFn: () => api<{ members: Member[] }>('members'), ...live })
  const allFaces: MemberFace[] = useMemo(
    () =>
      (membersQ.data?.members ?? []).map((m) => ({
        id: m.id,
        name: m.display_name,
        colour: m.colour,
        photoUrl: m.avatar_kind === 'photo' && m.avatar_ref ? imgUrl(m.avatar_ref) : null,
      })),
    [membersQ.data],
  )

  const [vue, setVue] = useTabParam('vue', 'itineraire', VUES)
  const notesQ = useTripNotes(isNew ? undefined : id)
  const packingQ = useTripPacking(isNew ? undefined : id)

  if (isUnauthorized(tripsQ.error)) return <PairPrompt />
  if (isNew) return <VoyageForm faces={allFaces} onClose={close} />

  if (!trip) {
    return (
      <div className="scene" aria-label={t.voyage.title}>
        <SceneHead title={t.voyage.title} card="voyage" onClose={close} closeLabel={t.common.close} />
        <div className="scene__body">
          <p className="loading mono">{tripsQ.isLoading ? t.common.loading : t.voyage.notFound}</p>
        </div>
      </div>
    )
  }

  if (editing) return <VoyageForm faces={allFaces} trip={trip} onClose={() => setEditing(false)} />

  // Faces restricted to who's on the trip (fall back to the whole roster if none set).
  const tripFaces = trip.members.length ? allFaces.filter((f) => trip.members.includes(f.id)) : allFaces
  const notes = notesQ.data?.notes ?? []
  const packing = packingQ.data?.items ?? []

  // « Partager en direct » — promote this private trip into the cross-household shared
  // store (« Voyage partagé »). A MOVE, not a copy: the private trip soft-deletes and
  // its blobs re-key to the share, so the confirm copy spells out that it's not undoable
  // and drops off the calendar while shared. → the new shared scene.
  async function shareLive() {
    if (!(await confirm({ message: t.sharedVoyage.promoteConfirm, tone: 'danger', confirmLabel: t.sharedVoyage.promote })))
      return
    try {
      const res = await write<{ id?: string }>('shared-trip', {
        method: 'POST',
        body: { fromTripId: trip!.id },
        affectedKeys: [TRIPS_KEY, SHARED_TRIPS_KEY, BOARD_KEY, MONTH_KEY],
      })
      const newId = res && !res.queued ? res.data?.id : undefined
      if (newId) nav(`/voyage/partage/${newId}`)
    } catch {
      /* server rejected — invalidate already refetched; the trip stays private */
    }
  }

  return (
    <div className="scene" aria-label={trip.title}>
      <SceneHead
        title={
          <>
            <Icon name={VOYAGE_ICON} size={20} style={{ display: 'inline-block', verticalAlign: '-0.2em' }} /> {trip.title}
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
        {vue === 'itineraire' && <VoyageItinerary trip={trip} notes={notes} faces={tripFaces} />}
        {vue === 'infos' && <VoyageInfos trip={trip} notes={notes} faces={tripFaces} />}
        {vue === 'bagages' && <PackingList trip={trip} items={packing} faces={tripFaces} />}
        {vue === 'documents' && <VoyageDocuments trip={trip} notes={notes} />}

        {!isGuest() && (
          <div className="voyage__foot voyage-share__foot">
            <button type="button" className="btn btn--ghost mono" onClick={() => setEditing(true)}>
              <Icon name="pencil-simple-bold" size={15} /> {t.voyage.editTrip}
            </button>
            <button type="button" className="btn btn--ghost mono" onClick={() => void shareLive()}>
              <Icon name="users-three-bold" size={15} /> {t.sharedVoyage.shareLive}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// A compact "12 juin – 18 juin" / "12 juin" range for the subtitle.
function tripDateLabel(trip: Trip, lang: 'fr' | 'en'): string {
  if (trip.start_at == null) return ''
  const a = cap(formatDayLong(trip.start_at, lang))
  if (trip.end_at == null || trip.end_at === trip.start_at) return a
  return `${a} – ${cap(formatDayLong(trip.end_at, lang))}`
}

// The create (no trip) / edit (trip given) form: name, destination, date range, who's
// going. POST → replace history with the new trip's scene; PATCH → back to the tabs.
function VoyageForm({ trip, faces, onClose }: { trip?: Trip; faces: MemberFace[]; onClose: () => void }) {
  const t = useT()
  const nav = useNavigate()
  const write = useWrite()
  const confirm = useConfirm()
  useEscapeKey(onClose)
  const editing = !!trip
  const [title, setTitle] = useState(trip?.title ?? '')
  const [destination, setDestination] = useState(trip?.destination ?? '')
  const [start, setStart] = useState(secToDateInput(trip?.start_at ?? null))
  const [end, setEnd] = useState(secToDateInput(trip?.end_at ?? null))
  const [members, setMembers] = useState<string[]>(trip?.members ?? [])
  const [busy, setBusy] = useState(false)

  const toggleMember = (mid: string) =>
    setMembers((prev) => (prev.includes(mid) ? prev.filter((x) => x !== mid) : [...prev, mid]))

  async function save() {
    const value = title.trim()
    if (!value || busy) return
    setBusy(true)
    const body = {
      title: value,
      destination: destination.trim() || null,
      startAt: dateInputToSec(start),
      endAt: dateInputToSec(end),
      members,
    }
    try {
      if (editing) {
        await write('trips', { method: 'PATCH', body: { id: trip!.id, ...body }, affectedKeys: [TRIPS_KEY] })
        onClose()
      } else {
        const res = await write<{ id?: string }>('trips', { method: 'POST', body, affectedKeys: [TRIPS_KEY] })
        const newId = res && !res.queued ? res.data?.id : undefined
        if (newId) nav(`/voyage/${newId}`, { replace: true })
        else onClose() // offline: queued; it appears on replay
      }
    } catch {
      setBusy(false)
    }
  }

  // Delete the whole trip (cascades its notes/itinerary/packing + frees the cover
  // blob server-side). A HEAVY, unrecoverable delete → confirm, not the undo toast.
  async function del() {
    if (!trip || busy) return
    if (!(await confirm({ message: t.voyage.deleteTripConfirm, tone: 'danger', confirmLabel: t.common.delete }))) return
    setBusy(true)
    try {
      await write('trips', { method: 'DELETE', body: { id: trip.id }, affectedKeys: [TRIPS_KEY, BOARD_KEY, MONTH_KEY] })
      nav('/board')
    } catch {
      setBusy(false)
    }
  }

  return (
    <div className="scene" aria-label={editing ? t.voyage.editTrip : t.voyage.newTrip}>
      <SceneHead title={editing ? t.voyage.editTrip : t.voyage.newTrip} card="voyage" onClose={onClose} closeLabel={t.common.close} />
      <div className="scene__body voyage-form">
        <label className="voyage-form__label mono">{t.voyage.tripName}</label>
        <input
          className="input"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={t.voyage.tripNamePlaceholder}
          aria-label={t.voyage.tripName}
          autoFocus={!editing}
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
        {faces.length > 0 && (
          <>
            <label className="voyage-form__label mono">{t.voyage.whoGoing}</label>
            <ChipGroup>
              {faces.map((f) => (
                <Chip key={f.id} selected={members.includes(f.id)} onClick={() => toggleMember(f.id)}>
                  {f.name}
                </Chip>
              ))}
            </ChipGroup>
          </>
        )}
        <button type="button" className="btn btn--primary voyage-form__submit" onClick={() => void save()} disabled={busy || !title.trim()}>
          <Icon name={editing ? 'check-bold' : 'plus-bold'} size={18} /> {editing ? t.common.save : t.voyage.createTrip}
        </button>
        {editing && (
          <button type="button" className="btn btn--ghost voyage-form__delete" onClick={() => void del()} disabled={busy}>
            <Icon name="trash-bold" size={16} /> {t.voyage.deleteTrip}
          </button>
        )}
        {!editing && <p className="voyage-form__hint mono">{t.voyage.createHint}</p>}
      </div>
    </div>
  )
}
