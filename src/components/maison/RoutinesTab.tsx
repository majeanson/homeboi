import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { useT } from '../../i18n'
import { EmptyState } from '../EmptyState'
import { useCalm } from '../../lib/calm'
import { api, isUnauthorized } from '../../lib/api'
import { isGuest } from '../../lib/device'
import { live } from '../../lib/query'
import { ROUTINES_KEY } from '../../lib/queryKeys'
import { Loading, PairPrompt } from '../Fallback'
import { InlineIcon } from '../Icon'
import { SectionHeader } from '../SectionHeader'
import { Avatar } from '../Avatar'
import { RoutineRing } from '../RoutineRing'
import { imgUrl } from '../../lib/image'
import { isRoutineTod, todRank, TOD_ICON, TOD_TINT, type RoutineTod } from '../../lib/routineTod'
import { timeOfDay } from '../../lib/timeofday'
import { type HelpMode } from '../../lib/helpMode'

export interface RoutineRow {
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
  // Today's completed step indices — already on the GET payload (from routine_runs,
  // which EMPTIES nightly, NFR-CALM-4). Drives the calm "où on est rendu" ring:
  // proportion done today, NEVER a streak/count-over-time.
  doneIdx?: number[]
}

// The four moment buckets the overview groups into: the three routine cues plus
// "anytime". A neutral clock glyph heads the anytime group (the three real moments
// keep their sunrise/sun/moon cue via TOD_ICON).
type MomentBucket = RoutineTod | 'any'
const MOMENT_ORDER: MomentBucket[] = ['morning', 'afternoon', 'evening', 'any']

export function RoutinesTab({ help }: { help: HelpMode }) {
  const t = useT()
  const { calm } = useCalm()
  const navigate = useNavigate()
  const { data, error } = useQuery({
    queryKey: ROUTINES_KEY,
    queryFn: () => api<{ routines: RoutineRow[] }>('routines'),
    ...live,
  })

  if (isUnauthorized(error)) return <PairPrompt />
  if (!data && !error) return <Loading />
  const routines = data?.routines ?? []

  // Group the overview into the moments of the day, and float the CURRENT moment
  // to the top — the SAME "lean toward what's coming" ranking the toddler picker
  // and the screensaver use (todRank), so the three surfaces never disagree. A
  // CUE, not a gate: empty moments simply don't render, nothing hides.
  const current = timeOfDay(Date.now())
  const buckets: Record<MomentBucket, RoutineRow[]> = { morning: [], afternoon: [], evening: [], any: [] }
  for (const r of routines) buckets[isRoutineTod(r.timeOfDay) ? r.timeOfDay : 'any'].push(r)
  const groups = MOMENT_ORDER.filter((b) => buckets[b].length).sort(
    (a, b) => todRank(current, a === 'any' ? null : a) - todRank(current, b === 'any' ? null : b),
  )

  // One routine card. Extracted so every moment section renders it identically
  // (the grid used to inline this single map).
  const renderCard = (r: RoutineRow) => {
    const tint = r.color ?? '#B06A93'
    // The same step pictures the toddler sees — so a parent recognizes the
    // routine at a glance (toothbrush → pyjamas → book) instead of reading.
    const steps = r.cards.slice(0, 8)
    // The peek shows real info: the moment of day + every step picto (the same
    // emojis the toddler run uses) + the count — not just the name.
    // Today's progress (from the GET payload's per-routine doneIdx). A step can
    // appear in doneIdx beyond the current deck length after an edit, so clamp
    // the count to the deck so the ring never over-fills.
    const doneCount = Math.min((r.doneIdx ?? []).length, r.cards.length)
    const started = doneCount > 0
    // Tap the card, do the routine. There used to be a peek in between, but the card
    // already SHOWS everything it held (the face, the moment, every step picto, the
    // count) and its ▶/✎ buttons already did what its buttons offered — so it was a
    // menu, not a destination. An empty shell has nothing to run into, so it opens the
    // builder instead. « Partager » lives on that builder scene now.
    const openR = () => navigate(r.cards.length ? `/routine/${r.id}/run` : `/routine/${r.id}`)
    // In help mode, a tap EXPLAINS the card (one shared 'card' target) instead.
    const onCard = help.pick('card', openR)
    // The card is NOT a role="button" any more. It held two real buttons (✎ and
    // ▶), which is a nested interactive: a screen reader announces a button whose
    // contents are buttons, and a keyboard user tabs INTO a button from inside a
    // button. `stopPropagation` fixed the mouse behaviour and hid the semantics.
    //
    // Nothing is lost by dropping it, because every action the card's own tap
    // offered is already on one of those buttons: ▶ runs a routine that has
    // steps, ✎ opens the builder — which is exactly where an EMPTY card's tap
    // went. So the div keeps its onClick as a pure MOUSE convenience (a bigger
    // target for the same destination) and the two buttons carry the keyboard and
    // the accessibility tree. Same reasoning as CardMini's "a button inside an
    // anchor is invalid" swap.
    return (
      <div
        key={r.id}
        className="routine-card routine-card--tap"
        style={{ '--tint': tint } as React.CSSProperties}
        onClick={onCard}
      >
        <span className="routine-card__spine" style={{ background: tint }} aria-hidden="true" />
        <div className="routine-card__head">
          {/* The owning member's face via the shared Avatar (a photo-less member
              gets their colour disc for free). Emphasized once today's routine is
              underway — a calm "on y est" cue, faces-not-counts (chore-ledger rule). */}
          <span className={'routine-card__face' + (started ? ' routine-card__face--active' : '')}>
            <Avatar
              kind={r.avatarPhoto ? 'photo' : undefined}
              photo={r.avatarPhoto}
              colour={tint}
              name={r.memberName ?? r.name}
              size={42}
            />
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
          // Kids seam #6: a card-less routine simply never appears on the kid
          // surface — with no cue, that silence read as a bug. Name the state on
          // the PARENT card: a calm « À compléter » chip + why (never a warning).
          <div className="routine-card__steps routine-card__steps--empty mono">
            <span className="chip routine-card__draft">{t.routines.draftBadge}</span> {t.routines.draftHint}
          </div>
        )}
        <div className="routine-card__foot">
          <span className="routine-card__count-wrap">
            {/* Today's progress ring, only once there are steps to track. */}
            {r.cards.length > 0 && (
              <RoutineRing done={doneCount} total={r.cards.length} tint={tint} label={t.routines.progressAria} />
            )}
            <span className="routine-card__count mono">{t.routines.stepsN(r.cards.length)}</span>
          </span>
          <div className="routine-card__actions">
            {/* ✎ Edit in one tap — editing is a first-class card action here,
                not buried two taps deep in the peek. Opens the builder scene
                (kept off the read-only guest). In help mode, explains. */}
            {!isGuest() && (
              <button
                type="button"
                className="routine-card__edit"
                onClick={(e) => {
                  e.stopPropagation()
                  help.pick('card', () => navigate(`/routine/${r.id}`))()
                }}
                aria-label={t.routines.editTitle}
                title={t.routines.editTitle}
              >
                <InlineIcon name="pencil-simple-bold" />
              </button>
            )}
            {/* ▶ Run the routine — the player now works on every surface, so a
                parent can do the routine WITH the kid from their phone, timers
                and all. In help mode the tap explains the card instead. */}
            {r.cards.length > 0 && (
              <button
                type="button"
                className="routine-card__run mono"
                onClick={(e) => {
                  // Don't also open the card's peek (the div's onClick); then
                  // navigate — or, in help mode, explain via the shared target.
                  e.stopPropagation()
                  help.pick('card', () => navigate(`/routine/${r.id}/run`))()
                }}
                aria-label={t.routines.doRoutine}
              >
                <InlineIcon name="play-bold" /> {t.routines.doRoutine}
              </button>
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <>
      {/* The opt-in sticker wall entry — only when « Mode calme » is OFF (the calm
          default hides the whole reward feature). A calm household never sees it. */}
      {!calm && routines.length > 0 && (
        <button type="button" className="routines-sticker-link" onClick={() => navigate('/routine/stickers')}>
          <InlineIcon name="sparkle-bold" /> {t.routines.stickerWallTitle}
        </button>
      )}

      {/* No hint/bubble rendered HERE on purpose: this tab is embedded in Maison
          (pages/Maison.tsx) as one of five section pills, where the page-level
          sectionSwitch already renders the "tap to learn" hint (`help.hint`) for
          EVERY section, and every other help target on that page renders its
          bubble via a per-key `bubbleFor(k)` call. A catch-all `help.bubble` here
          used to double-render: picking any OTHER pill's key while this tab stayed
          mounted (an armed pick never navigates) showed that key's bubble both via
          the page's own bubbleFor AND via this catch-all. The page now renders
          `bubbleFor('card')` right after <RoutinesTab/> instead — this component
          stays a plain data view with no help chrome of its own. (The standalone
          /routines page predates the merge and no longer exists — Routines is only
          ever reached through Maison now.) */}

      {/* The tour anchor wraps BOTH branches so the routines spotlight resolves
          even for a brand-new household with no routines yet (#32). */}
      <div data-tour="routines-grid">
      {routines.length === 0 ? (
        <div className="routines-empty">
          <EmptyState
            guide={{ card: 'routines' }}
            action={{ to: '/maison?plus=routine-pick', label: t.routines.add, icon: 'plus-bold' }}
          >
            {t.routines.parentEmpty}
          </EmptyState>
          {/* The warm in-tab create path — no more "make one in the réglages".
              Opens the builder scene; hidden for a read-only guest. */}
          {!isGuest() && (
            <button
              type="button"
              className="btn btn--primary routines-empty__new"
              onClick={() => navigate('/routine/new')}
            >
              <InlineIcon name="plus-bold" /> {t.routines.newRoutine}
            </button>
          )}
        </div>
      ) : (
        groups.map((b) => {
          // The current moment's section gets a stronger tinted band ("is-now");
          // 'anytime' is never "now" and wears a neutral clock glyph (the three
          // real moments keep their sunrise/sun/moon cue + warm→cool tint).
          const isNow = b !== 'any' && b === current
          return (
            <section
              key={b}
              className={'routines-moment' + (isNow ? ' routines-moment--now' : '')}
              style={{ '--moment-tint': b === 'any' ? 'var(--ink-faint)' : TOD_TINT[b] } as React.CSSProperties}
            >
              <SectionHeader
                icon={b === 'any' ? 'clock-bold' : TOD_ICON[b]}
                iconColor={b === 'any' ? 'var(--ink-soft)' : TOD_TINT[b]}
                title={t.routines.tod[b]}
              />
              <div className="routines-grid">{buckets[b].map(renderCard)}</div>
            </section>
          )
        })
      )}
      </div>
    </>
  )
}
