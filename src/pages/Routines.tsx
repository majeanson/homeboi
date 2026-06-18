import { useQuery } from '@tanstack/react-query'
import { useT } from '../i18n'
import { useAudience } from '../lib/audience'
import { api, isUnauthorized } from '../lib/api'
import { live } from '../lib/query'
import { ROUTINES_KEY } from '../lib/queryKeys'
import { Loading, PairPrompt } from '../components/Fallback'
import { InlineIcon } from '../components/Icon'
import { HubHead } from '../components/HubHead'
import { SectionIntro } from '../components/SectionIntro'
import { imgUrl } from '../lib/image'
import { CATS } from '../lib/cats'
import { dayOrder, isRoutineTod, TOD_ICON, TOD_TINT } from '../lib/routineTod'
import { KidView } from './KidView'

// The Routines tab, two lenses on the same data:
//   - toddler: the picture-card run (the original KidView), where the kid taps
//     and hears each step.
//   - parent: a read overview of who has which routine; building/editing still
//     lives in Réglages for now (the form there is unchanged).
export function Routines() {
  const { audience } = useAudience()
  if (audience === 'toddler') return <KidView />
  return <RoutinesParent />
}

interface RoutineRow {
  id: string
  name: string
  memberName: string | null
  color: string | null
  avatarPhoto: string | null
  timeOfDay: string | null
  cards: { icon?: string }[]
}

function RoutinesParent() {
  const t = useT()
  const { data, error } = useQuery({
    queryKey: ROUTINES_KEY,
    queryFn: () => api<{ routines: RoutineRow[] }>('routines'),
    ...live,
  })

  if (isUnauthorized(error)) return <PairPrompt />
  if (!data && !error) return <Loading />
  // Day order (matin → après-midi → soir → n'importe quand), so the overview
  // reads like the day itself.
  const routines = [...(data?.routines ?? [])].sort(
    (a, b) => dayOrder(a.timeOfDay) - dayOrder(b.timeOfDay),
  )

  return (
    <main className="today-feed routines-parent">
      <HubHead
        title={t.nav.routines}
        icon={CATS.routine.icon}
        iconColor={CATS.routine.deep}
        background={CATS.routine.wash}
        card="routines"
      />

      <SectionIntro card="routines" />

      {routines.length === 0 ? (
        <p className="feed-empty">{t.kid.none}</p>
      ) : (
        <div className="routines-grid">
          {routines.map((r) => {
            const tint = r.color ?? '#B06A93'
            // The same step pictures the toddler sees — so a parent recognizes the
            // routine at a glance (toothbrush → pyjamas → book) instead of reading.
            const steps = r.cards.slice(0, 8)
            return (
              <div key={r.id} className="routine-card" style={{ '--tint': tint } as React.CSSProperties}>
                <span className="routine-card__spine" style={{ background: tint }} aria-hidden="true" />
                <div className="routine-card__head">
                  <span
                    className="routine-card__av"
                    style={{ background: r.avatarPhoto ? 'var(--card)' : tint }}
                  >
                    {r.avatarPhoto ? (
                      <img src={imgUrl(r.avatarPhoto)} alt="" />
                    ) : (
                      (r.memberName ?? r.name).slice(0, 1).toUpperCase()
                    )}
                  </span>
                  <div className="routine-card__title">
                    <span className="routine-card__name">{r.name}</span>
                    {r.memberName && <span className="routine-card__who mono">{r.memberName}</span>}
                  </div>
                  {/* The moment cue, when set — matches the chip in Réglages. */}
                  {isRoutineTod(r.timeOfDay) && (
                    <span className="routine-card__tod mono" title={t.routines.tod[r.timeOfDay]}>
                      <InlineIcon name={TOD_ICON[r.timeOfDay]} size={14} color={TOD_TINT[r.timeOfDay]} />{' '}
                      {t.routines.tod[r.timeOfDay]}
                    </span>
                  )}
                </div>
                {steps.length > 0 ? (
                  <div className="routine-card__steps" aria-hidden="true">
                    {steps.map((c, i) => (
                      <span key={i} className="routine-card__step">
                        {c.icon || '○'}
                      </span>
                    ))}
                    {r.cards.length > steps.length && (
                      <span className="routine-card__more mono">+{r.cards.length - steps.length}</span>
                    )}
                  </div>
                ) : (
                  <div className="routine-card__steps routine-card__steps--empty mono">{t.routines.empty}</div>
                )}
                <div className="routine-card__count mono">{t.routines.stepsN(r.cards.length)}</div>
              </div>
            )
          })}
        </div>
      )}

      {/* Creating AND editing both live on the ＋ FAB now: it opens the manage
          picker (new routine + this list of existing ones, each tappable to edit),
          so the old "Modifier dans les réglages" link would just be a second door
          to the same place — removed. */}
    </main>
  )
}
