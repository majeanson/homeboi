import { useLang, useT } from '../../i18n'
import { useOperatorT } from '../../i18n.operator'
import { useCarnets } from '../../lib/carnets'
import { fold } from '../../lib/normalize'
import { BOARD_KEY, HOME_PROJECTS_KEY, MONTH_KEY, TASKS_KEY } from '../../lib/queryKeys'
import { recurLabel } from '../../lib/recurLabel'
import { useCreateManyWithUndo } from '../../lib/undoCreate'
import { SEASON_SEEDS, hideSeed, nextAnchorSec, seasonPacks, useHiddenSeeds, type SeasonPack, type SeasonSeed } from '../../lib/year'
import { Disclosure } from '../Disclosure'
import { IconButton } from '../IconButton'
import { InlineIcon } from '../Icon'
import { Cluster } from '../Layout'
import { type TaskItem } from '../../lib/tasks'

const KEYS = [HOME_PROJECTS_KEY, BOARD_KEY, MONTH_KEY, TASKS_KEY]

// The FR-CA season rituals, ready to add (A-4, bmad/09). Accepting one POSTs a normal upkeep
// row (recurrence + week-scale lead + carnet link + its own emoji as the task's icon), so it
// rides the whole existing machinery. A seed hides once ANY row already covers it (keyword
// match), or once this device dismissed it with ✕.
//
// STARTER PACKS (phase 3 of the unified task): the seeds that share a subject and a season
// are offered together, « La maison à l'automne », one tap for all of them and ONE undo that
// takes them all back. A pack is derived from SEASON_SEEDS (`seasonPacks`), never a second
// list. A pack shows its pictures, never a number of tasks (calm). What a pack leaves
// behind, a lone seed or one already covered, is offered on its own as before.
export function SeasonSeeds({ tasks }: { tasks: readonly TaskItem[] }) {
  const t = useT()
  const o18n = useOperatorT()
  const { lang } = useLang()
  const createMany = useCreateManyWithUndo()
  const hidden = useHiddenSeeds()
  const { data: carnetsData } = useCarnets({ live: false })
  const seeds = SEASON_SEEDS.filter((seed) => !hidden.includes(seed.id) && !tasks.some((x) => seed.match.some((k) => fold(x.title).includes(k))))
  if (seeds.length === 0) return null
  const packs = seasonPacks(seeds)
  const inPack = new Set(packs.flatMap((p) => p.seeds.map((s) => s.id)))
  const loose = seeds.filter((s) => !inPack.has(s.id))

  const bodyOf = (seed: SeasonSeed) => {
    const carnet = seed.carnetKind ? (carnetsData?.carnets ?? []).find((x) => x.kind === seed.carnetKind) : undefined
    return {
      kind: 'upkeep',
      title: seed.title[lang],
      icon: seed.emoji,
      at: nextAnchorSec(seed.anchor),
      recur: seed.recur,
      leadSeconds: seed.leadWeeks * 7 * 86_400, // A-6: annual rituals get week-scale « Bientôt »
      carnetId: carnet?.id ?? null,
    }
  }
  const add = (list: readonly SeasonSeed[], message: string) =>
    void createMany({ endpoint: 'home-projects', bodies: list.map(bodyOf), affectedKeys: KEYS, message })
  const packName = (p: SeasonPack) => o18n.home.packName(p.carnetKind, p.season)

  return (
    <Disclosure label={o18n.home.seedsTitle} className="season-seeds">
      <p className="operator__hint mono">{o18n.home.seedsHint}</p>
      {packs.map((p) => (
        <Cluster key={p.id} className="season-seeds__pack">
          <button type="button" className="btn btn--sm" onClick={() => add(p.seeds, t.undo.added(packName(p)))}>
            <InlineIcon name="plus-bold" size={14} /> {packName(p)}
          </button>
          <span className="season-seeds__glyphs" aria-hidden="true">
            {p.seeds.map((s) => s.emoji).join(' ')}
          </span>
          {/* The pictures say what it adds; a screen reader gets the titles themselves. */}
          <span className="sr-only">{p.seeds.map((s) => s.title[lang]).join(', ')}</span>
        </Cluster>
      ))}
      {loose.map((seed) => (
        <Cluster key={seed.id}>
          <button type="button" className="btn btn--sm" onClick={() => add([seed], t.undo.added(seed.title[lang]))}>
            <InlineIcon name="plus-bold" size={14} /> <span aria-hidden="true">{seed.emoji}</span> {seed.title[lang]} · {recurLabel(JSON.stringify(seed.recur), t)}
          </button>
          <IconButton icon="x-bold" label={o18n.home.seedDismiss} size="sm" onClick={() => hideSeed(seed.id)} />
        </Cluster>
      ))}
    </Disclosure>
  )
}
