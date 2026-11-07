import { useLang, useT } from '../../i18n'
import { useOperatorT } from '../../i18n.operator'
import { useCarnets } from '../../lib/carnets'
import { fold } from '../../lib/normalize'
import { BOARD_KEY, HOME_PROJECTS_KEY, MONTH_KEY, TASKS_KEY } from '../../lib/queryKeys'
import { recurLabel } from '../../lib/recurLabel'
import { useWrite, writeFailed } from '../../lib/write'
import { SEASON_SEEDS, hideSeed, nextAnchorSec, useHiddenSeeds, type SeasonSeed } from '../../lib/year'
import { Disclosure } from '../Disclosure'
import { IconButton } from '../IconButton'
import { InlineIcon } from '../Icon'
import { Cluster } from '../Layout'
import { type TaskItem } from '../../lib/tasks'

// The FR-CA season rituals, ready to add (A-4, bmad/09). Accepting one POSTs a normal upkeep
// row (recurrence + week-scale lead + carnet link), so it rides the whole existing machinery.
// A seed hides once ANY row already covers it (keyword match), or once this device dismissed
// it with ✕. It moved here with the rest of the browsing when Réglages went back to settings.
export function SeasonSeeds({ tasks }: { tasks: readonly TaskItem[] }) {
  const t = useT()
  const o18n = useOperatorT()
  const { lang } = useLang()
  const write = useWrite()
  const hidden = useHiddenSeeds()
  const { data: carnetsData } = useCarnets({ live: false })
  const seeds = SEASON_SEEDS.filter((seed) => !hidden.includes(seed.id) && !tasks.some((x) => seed.match.some((k) => fold(x.title).includes(k))))
  if (seeds.length === 0) return null

  function addSeed(seed: SeasonSeed) {
    const carnet = seed.carnetKind ? (carnetsData?.carnets ?? []).find((x) => x.kind === seed.carnetKind) : undefined
    void write('home-projects', {
      method: 'POST',
      body: {
        kind: 'upkeep',
        title: seed.title[lang],
        at: nextAnchorSec(seed.anchor),
        recur: seed.recur,
        leadSeconds: seed.leadWeeks * 7 * 86_400, // A-6: annual rituals get week-scale « Bientôt »
        carnetId: carnet?.id ?? null,
      },
      affectedKeys: [HOME_PROJECTS_KEY, BOARD_KEY, MONTH_KEY, TASKS_KEY],
    }).catch(writeFailed)
  }

  return (
    <Disclosure label={o18n.home.seedsTitle} className="season-seeds">
      <p className="operator__hint mono">{o18n.home.seedsHint}</p>
      {seeds.map((seed) => (
        <Cluster key={seed.id}>
          <button type="button" className="btn btn--sm" onClick={() => addSeed(seed)}>
            <InlineIcon name="plus-bold" size={14} /> <span aria-hidden="true">{seed.emoji}</span> {seed.title[lang]} · {recurLabel(JSON.stringify(seed.recur), t)}
          </button>
          <IconButton icon="x-bold" label={o18n.home.seedDismiss} size="sm" onClick={() => hideSeed(seed.id)} />
        </Cluster>
      ))}
    </Disclosure>
  )
}
