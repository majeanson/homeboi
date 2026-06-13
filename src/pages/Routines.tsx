import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useT } from '../i18n'
import { useAudience } from '../lib/audience'
import { api, isUnauthorized } from '../lib/api'
import { live } from '../lib/query'
import { ROUTINES_KEY } from '../lib/queryKeys'
import { Loading, PairPrompt } from '../components/Fallback'
import { Icon } from '../components/Icon'
import { HelpDot } from '../components/HelpDot'
import { imgUrl } from '../lib/image'
import { dayOrder, isRoutineTod, TOD_EMOJI } from '../lib/routineTod'
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
      <div className="app-head">
        <div>
          <div className="hand-tag">{t.routines.tag}</div>
          <div className="app-head__titlerow">
            <h1 className="greet">{t.nav.routines}</h1>
            <HelpDot card="routines" />
          </div>
        </div>
        <div className="avatar" style={{ background: 'var(--berry-wash)' }}>
          <Icon name="paint-brush-bold" size={26} color="var(--berry-deep, #95527A)" />
        </div>
      </div>

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
                      {TOD_EMOJI[r.timeOfDay]} {t.routines.tod[r.timeOfDay]}
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

      {/* Creating a routine is the ＋ FAB's job on this tab (the contextual Add
          sheet opens straight on the routine builder); the settings link
          deep-links to the matching tab for edits/deletes. */}
      <p className="routines-parent__edit">
        <Link to="/settings?tab=routines" className="btn btn--ghost mono">
          {t.audience.editInSettings}
        </Link>
      </p>
    </main>
  )
}
