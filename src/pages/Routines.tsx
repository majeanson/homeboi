import { useQuery } from '@tanstack/react-query'
import { useLang, useT } from '../i18n'
import { EmptyState } from '../components/EmptyState'
import { useAudience } from '../lib/audience'
import { useEntityDetail } from '../components/detail/DetailProvider'
import { buildRoutine } from '../components/detail/adapters'
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
import { useHelpMode, HelpToggle, HelpHint } from '../lib/helpMode'
import { ROUTINES_HELP } from '../lib/routinesHelp'
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
  // Parallel per-card photo keys (feature #17 C), one R2 key per card ('' = none).
  // When set, the photo replaces the emoji in the step preview — same rule the
  // toddler view follows, so the two surfaces never disagree.
  cardsPhoto?: string[]
}

function RoutinesParent() {
  const t = useT()
  const { lang } = useLang()
  // Tap a routine to peek it (child, steps) with "Ouvrir la routine" to edit —
  // the same shared entity-detail sheet the board uses.
  const detail = useEntityDetail()
  // Contextual "?" help mode (shared hook): arm it in the header, then tap a
  // routine to learn what tapping does + the moment badge, in place. The overview
  // is one flat grid, so its single help target is the card itself.
  const help = useHelpMode(ROUTINES_HELP, () => t.nav.routines)
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
    <main className={'today-feed routines-parent' + (help.active ? ' help-armed' : '')}>
      <HubHead
        title={t.nav.routines}
        icon={CATS.routine.icon}
        iconColor={CATS.routine.deep}
        background={CATS.routine.wash}
        card="routines"
      />

      <SectionIntro card="routines" />

      {/* The overview is a flat grid with no control group to sit the "?" beside,
          so the toggle gets its own quiet right-aligned row (same as La liste). */}
      {help.available && routines.length > 0 && (
        <div className="hub-helprow">
          <HelpToggle active={help.active} onToggle={help.toggle} />
        </div>
      )}
      {help.hint && routines.length > 0 && <HelpHint />}
      {help.bubble}

      {routines.length === 0 ? (
        <EmptyState guide={{ card: 'routines' }}>{t.kid.none}</EmptyState>
      ) : (
        <div className="routines-grid">
          {routines.map((r) => {
            const tint = r.color ?? '#B06A93'
            // The same step pictures the toddler sees — so a parent recognizes the
            // routine at a glance (toothbrush → pyjamas → book) instead of reading.
            const steps = r.cards.slice(0, 8)
            // The peek shows real info: the moment of day + every step picto (the same
            // emojis the toddler run uses) + the count — not just the name.
            const todLabel = isRoutineTod(r.timeOfDay) ? t.routines.tod[r.timeOfDay] : null
            // Hand the peek each step's emoji AND its photo key (parallel to cards),
            // so a card with a parent-set picture shows the picture, not the emoji —
            // the same rule this grid follows just above (feature #17 C).
            const stepPictos = r.cards.map((c, i) => ({ emoji: c.icon, photoKey: r.cardsPhoto?.[i] }))
            const openR = () => detail.open(buildRoutine(r, { t, lang, members: [] }, { todLabel, steps: stepPictos }))
            // In help mode, a tap EXPLAINS the card (one shared 'card' target) via
            // the bubble at the top, instead of opening the peek.
            const onCard = help.pick('card', openR)
            return (
              <div
                key={r.id}
                className="routine-card routine-card--tap"
                style={{ '--tint': tint } as React.CSSProperties}
                role="button"
                tabIndex={0}
                onClick={onCard}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    onCard()
                  }
                }}
              >
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
                        {/* A parent's photo of the real thing wins over the emoji
                            when set (feature #17 C) — the same rule the toddler
                            view follows, so both surfaces show the same picture. */}
                        {r.cardsPhoto?.[i] ? (
                          <img className="routine-card__step-photo" src={imgUrl(r.cardsPhoto[i])} alt="" />
                        ) : (
                          c.icon || '○'
                        )}
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
