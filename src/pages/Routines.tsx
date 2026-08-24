import { useQuery } from '@tanstack/react-query'
import { useT } from '../i18n'
import { useAudience } from '../lib/audience'
import { api } from '../lib/api'
import { live } from '../lib/query'
import { ROUTINES_KEY } from '../lib/queryKeys'
import { HubHead } from '../components/HubHead'
import { SectionIntro } from '../components/SectionIntro'
import { useHelpMode, HelpToggle } from '../lib/helpMode'
import { ROUTINES_HELP } from '../lib/routinesHelp'
import { CATS } from '../lib/cats'
import { RoutinesTab, type RoutineRow } from '../components/maison/RoutinesTab'
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

function RoutinesParent() {
  const t = useT()
  // Contextual "?" help mode (shared hook): arm it in the header, then tap a
  // routine to learn what tapping does + the moment badge, in place. The overview
  // is one flat grid, so its single help target is the card itself.
  const help = useHelpMode(ROUTINES_HELP, (k) => (k === 'search' ? t.search.title : t.nav.routines))
  // Page-level query purely to gate the header's "?" toggle on routines.length > 0
  // (RoutinesTab owns the SAME query for its body) — TanStack dedupes the two
  // subscriptions into a single fetch, so this costs nothing extra.
  const { data } = useQuery({
    queryKey: ROUTINES_KEY,
    queryFn: () => api<{ routines: RoutineRow[] }>('routines'),
    ...live,
  })
  const routines = data?.routines ?? []

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

      <RoutinesTab help={help} />

      {/* Creating AND editing both live on the ＋ FAB now: it opens the manage
          picker (new routine + this list of existing ones, each tappable to edit),
          so the old "Modifier dans les réglages" link would just be a second door
          to the same place — removed. */}
    </main>
  )
}
