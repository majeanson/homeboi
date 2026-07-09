import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { useT } from '../i18n'
import { EmptyState } from '../components/EmptyState'
import { useAudience } from '../lib/audience'
import { useCalm } from '../lib/calm'
import { api, isUnauthorized } from '../lib/api'
import { isGuest } from '../lib/device'
import { live } from '../lib/query'
import { ROUTINES_KEY } from '../lib/queryKeys'
import { Loading, PairPrompt } from '../components/Fallback'
import { InlineIcon } from '../components/Icon'
import { HubHead } from '../components/HubHead'
import { SectionHeader } from '../components/SectionHeader'
import { Avatar } from '../components/Avatar'
import { RoutineRing } from '../components/RoutineRing'
import { FEELING_EMOJI, isFeeling } from '../lib/feelings'
import { SectionIntro } from '../components/SectionIntro'
import { imgUrl } from '../lib/image'
import { CATS } from '../lib/cats'
import { isRoutineTod, todRank, TOD_ICON, TOD_TINT, type RoutineTod } from '../lib/routineTod'
import { timeOfDay } from '../lib/timeofday'
import { useHelpMode, HelpToggle, HelpHint } from '../lib/helpMode'
import { ROUTINES_HELP } from '../lib/routinesHelp'
import { KidView } from './KidView'

// The Routines tab, two lenses on the same data:
//   - toddler: the picture-card run (the original KidView), where the kid taps
//     and hears each step.
//   - parent: an overview of who has which routine, with create + edit right in
//     the tab. Building/editing open the full-screen builder SCENE (/routine/new,
//     /routine/:id) — a deliberate choice over a height-capped modal, since the
//     name + member chips + picture-card deck would strand inputs under the mobile
//     keyboard (see FormScene). The ＋ FAB and each card's ✎ both land there.
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
  // Today's completed step indices — already on the GET payload (from routine_runs,
  // which EMPTIES nightly, NFR-CALM-4). Drives the calm "où on est rendu" ring:
  // proportion done today, NEVER a streak/count-over-time.
  doneIdx?: number[]
  // #C — today's one-tap feeling ('sun'|'cloud'|'rain'|null), tapped at the finish.
  // A moment of today, shown as a glyph on the card; never aggregated.
  feeling?: string | null
}

// The four moment buckets the overview groups into: the three routine cues plus
// "anytime". A neutral clock glyph heads the anytime group (the three real moments
// keep their sunrise/sun/moon cue via TOD_ICON).
type MomentBucket = RoutineTod | 'any'
const MOMENT_ORDER: MomentBucket[] = ['morning', 'afternoon', 'evening', 'any']

function RoutinesParent() {
  const t = useT()
  const { calm } = useCalm()
  const navigate = useNavigate()
  // Contextual "?" help mode (shared hook): arm it in the header, then tap a
  // routine to learn what tapping does + the moment badge, in place. The overview
  // is one flat grid, so its single help target is the card itself.
  const help = useHelpMode(ROUTINES_HELP, (k) => (k === 'search' ? t.search.title : t.nav.routines))
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
          <div className="routine-card__steps routine-card__steps--empty mono">{t.routines.empty}</div>
        )}
        <div className="routine-card__foot">
          <span className="routine-card__count-wrap">
            {/* Today's progress ring, only once there are steps to track. */}
            {r.cards.length > 0 && (
              <RoutineRing done={doneCount} total={r.cards.length} tint={tint} label={t.routines.progressAria} />
            )}
            {/* Today's feeling, if the child tapped one at the finish (#C) — a glyph,
                never a count. Cleared nightly with the rest of the run. */}
            {isFeeling(r.feeling) && (
              <span
                className="routine-card__feeling"
                title={
                  r.memberName
                    ? t.routines.finishedWith(r.memberName, t.routines.feeling[r.feeling])
                    : t.routines.feeling[r.feeling]
                }
                aria-hidden="true"
              >
                {FEELING_EMOJI[r.feeling]}
              </span>
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
    <main className={'today-feed routines-parent' + (help.active ? ' help-armed' : '')}>
      <HubHead
        title={t.nav.routines}
        icon={CATS.routine.icon}
        iconColor={CATS.routine.deep}
        background={CATS.routine.wash}
        card="routines"
        // The in-place help "?" tucks into the header cluster (beside search +
        // avatar) rather than stranding on its own row above the flat card grid.
        action={
          help.available && routines.length > 0 ? (
            <HelpToggle active={help.active} onToggle={help.toggle} />
          ) : undefined
        }
        searchPick={(run) => help.pick('search', run)}
      />

      <SectionIntro card="routines" />

      {/* The opt-in sticker wall entry — only when « Mode calme » is OFF (the calm
          default hides the whole reward feature). A calm household never sees it. */}
      {!calm && routines.length > 0 && (
        <button type="button" className="routines-sticker-link" onClick={() => navigate('/routine/stickers')}>
          <InlineIcon name="sparkle-bold" /> {t.routines.stickerWallTitle}
        </button>
      )}

      {help.hint && routines.length > 0 && <HelpHint />}
      {help.bubble}

      {/* The tour anchor wraps BOTH branches so the routines spotlight resolves
          even for a brand-new household with no routines yet (#32). */}
      <div data-tour="routines-grid">
      {routines.length === 0 ? (
        <div className="routines-empty">
          <EmptyState guide={{ card: 'routines' }}>{t.routines.parentEmpty}</EmptyState>
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

      {/* Creating AND editing both live on the ＋ FAB now: it opens the manage
          picker (new routine + this list of existing ones, each tappable to edit),
          so the old "Modifier dans les réglages" link would just be a second door
          to the same place — removed. */}
    </main>
  )
}
