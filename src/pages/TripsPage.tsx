import { useNavigate } from 'react-router-dom'
import { useLang, useT } from '../i18n'
import { isGuest } from '../lib/device'
import { todayLocalDay } from '../lib/localDay'
import { useSceneClose, useEscapeKey } from '../lib/sceneNav'
import { Chip } from '../components/Chip'
import { Disclosure } from '../components/Disclosure'
import { EmptyState } from '../components/EmptyState'
import { LoadState } from '../components/Fallback'
import { Icon } from '../components/Icon'
import { ListRow } from '../components/ListRow'
import { SceneHead } from '../components/SceneHead'
import { useTrips, useSharedTrips, tripDateLabel, VOYAGE_ICON, type Trip } from '../components/voyage/voyage'

// « Mes voyages » — the index of trips (solidify 4.4). Until this existed, the board card
// (three rows, next trips only) and /search were the only lists: a trip that was over, or
// a fourth someday idea, could only be reached by remembering its name. Coming trips and
// ideas lead; what is over folds away, so the list reads as what is ahead.
type Row = Trip & { shared: boolean }

export function TripsPage() {
  const t = useT()
  const { lang } = useLang()
  const close = useSceneClose('/board')
  useEscapeKey(close)
  const nav = useNavigate()
  const trips = useTrips()
  const shared = useSharedTrips()
  const today = todayLocalDay()

  const all: Row[] = [
    ...(trips.data?.trips ?? []).map((tr) => ({ ...tr, shared: false })),
    ...(shared.data?.trips ?? []).map((tr) => ({ ...(tr as unknown as Trip), shared: true })),
  ]
  const isPast = (tr: Row) => tr.end_at != null && tr.end_at < today
  const ahead = all
    .filter((tr) => !isPast(tr))
    .sort((a, b) => (a.start_at ?? Number.MAX_SAFE_INTEGER) - (b.start_at ?? Number.MAX_SAFE_INTEGER))
  const past = all.filter(isPast).sort((a, b) => (b.end_at ?? 0) - (a.end_at ?? 0))

  const row = (tr: Row) => (
    <ListRow
      key={tr.id}
      leading={<Icon name={VOYAGE_ICON} size={20} />}
      title={tr.title}
      subtitle={[tr.destination, tripDateLabel(tr, lang) || t.voyage.noDatesYet].filter(Boolean).join(' · ')}
      onActivate={() => nav(tr.shared ? `/voyage/partage/${tr.id}` : `/voyage/${tr.id}`)}
      activateLabel={tr.title}
    />
  )

  return (
    <div className="scene" aria-label={t.voyage.allTrips}>
      <SceneHead title={t.voyage.allTrips} icon={VOYAGE_ICON} card="voyage" onClose={close} />
      <div className="scene__body">
        <LoadState q={trips} shape="row" count={3}>
          {() =>
            all.length === 0 ? (
              <EmptyState tone="calm" action={isGuest() ? undefined : { to: '/voyage/new', label: t.voyage.newTrip }}>
                {t.voyage.noTrips}
              </EmptyState>
            ) : (
              <>
                {!isGuest() && (
                  <Chip to="/voyage/new" icon="plus-bold">
                    {t.voyage.newTrip}
                  </Chip>
                )}
                {ahead.map(row)}
                {past.length > 0 && <Disclosure label={t.voyage.pastTrips}>{past.map(row)}</Disclosure>}
              </>
            )
          }
        </LoadState>
      </div>
    </div>
  )
}
