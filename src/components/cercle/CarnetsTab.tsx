import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useT } from '../../i18n'
import { api } from '../../lib/api'
import { useWrite } from '../../lib/write'
import { isGuest } from '../../lib/device'
import { imgUrl } from '../../lib/image'
import { faint } from '../../lib/colors'
import { useCarnets, carnetEmoji, type Carnet } from '../../lib/carnets'
import { CARNETS_KEY, BOARD_KEY } from '../../lib/queryKeys'
import { Icon } from '../Icon'
import { Disclosure } from '../Disclosure'
import { EmptyState } from '../EmptyState'

const ARCHIVED_CARNETS_KEY = [...CARNETS_KEY, 'archived']

// « Le cercle » → Les carnets tab: the household's cared-for things (houses, cars).
// A directory of TOP-LEVEL carnets; tapping one opens its full carnet scene. Mirrors
// the Business tab's isolation (its own query, never the people graph), but a carnet
// navigates to a scene (it has a history + children) rather than a peek. Adding a
// carnet is the ＋ FAB's job now (the cercle chooser's "Nouveau carnet" tile opens
// the CarnetForm on /cercle via ?add=carnet), so this tab carries no add button of
// its own — the same single-entry pattern as the Business tab.
export function CarnetsTab() {
  const t = useT()
  const nav = useNavigate()
  const c = t.carnets

  const write = useWrite()
  const ro = isGuest()
  const { data } = useCarnets()
  const tops = (data?.carnets ?? []).filter((x) => !x.parentId)
  const soonIds = new Set((data?.soon ?? []).map((s) => s.carnetId))

  // Archived carnets (the reversible-archive roots) — only fetched for an operator, so
  // a kiosk/guest never adds the extra read. Restoring clears archived_at on its subtree.
  const { data: archData } = useQuery({
    queryKey: ARCHIVED_CARNETS_KEY,
    queryFn: () => api<{ carnets: Carnet[] }>('carnets?archived=1'),
    enabled: !ro,
  })
  const archived = archData?.carnets ?? []
  async function restore(x: Carnet) {
    await write('carnets', {
      method: 'PATCH',
      body: { id: x.id, restore: true },
      affectedKeys: [CARNETS_KEY, ARCHIVED_CARNETS_KEY, BOARD_KEY],
    }).catch(() => {})
  }

  // A top-level carnet's subtree counts as "needs a look" if it OR any of its
  // children is in the lifecycle "soon" set.
  const childrenOf = (id: string) => (data?.carnets ?? []).filter((x) => x.parentId === id)
  const needsLook = (x: Carnet) => soonIds.has(x.id) || childrenOf(x.id).some((ch) => soonIds.has(ch.id))

  // Same as the Business tab beside it: the lit section pill already says « Carnets »,
  // the empty state already says what a carnet is for, and the pill row already owns
  // the 'carnets' help anchor — this heading was a second one, which made an armed
  // « ? » paint the bubble twice.
  return (
    <section className="cercle-group cercle-carnets">
      {tops.length === 0 ? (
        <EmptyState
          guide={{ card: 'carnets' }}
          action={{ to: '/maison?section=carnets&plus=carnet', label: c.add, icon: 'plus-bold' }}
        >
          {c.empty}
        </EmptyState>
      ) : (
        tops.map((x) => {
          const photo = x.mediaKey ? imgUrl(x.mediaKey) : null
          const kids = childrenOf(x.id)
          const sub = kids.length ? c.childCount(kids.length) : c.kind[x.kind]
          return (
            <div key={x.id} className="cercle-row">
              <button type="button" className="cercle-row__open" onClick={() => nav(`/cercle/carnet/${x.id}`)}>
                <span className="cercle-business__av" aria-hidden="true" style={!photo ? { background: faint(x.color) } : undefined}>
                  {photo ? <img src={photo} alt="" /> : <span className="cercle-carnets__emoji">{carnetEmoji(x)}</span>}
                </span>
                <span className="cercle-row__main">
                  <span className="cercle-row__name">{x.name}</span>
                  <span className="cercle-row__sub mono">{sub}</span>
                </span>
                {needsLook(x) && <span className="cercle-carnets__flag" title={c.toWatch} aria-label={c.toWatch} />}
              </button>
            </div>
          )
        })
      )}

      {/* Reversible archive: a restore list so « supprimer » (which archives) isn't a
          one-way delete. Collapsed by default (calm); only shown when something's here. */}
      {!ro && archived.length > 0 && (
        <Disclosure label={c.archivedTitle} count={archived.length}>
          {archived.map((x) => (
            <div key={x.id} className="cercle-row">
              <span className="cercle-business__av" aria-hidden="true" style={{ background: faint(x.color) }}>
                <span className="cercle-carnets__emoji">{carnetEmoji(x)}</span>
              </span>
              <span className="cercle-row__main">
                <span className="cercle-row__name">{x.name}</span>
                <span className="cercle-row__sub mono">{c.kind[x.kind]}</span>
              </span>
              <button type="button" className="btn btn--sm btn--ghost" onClick={() => void restore(x)}>
                <Icon name="arrow-counter-clockwise-bold" size={15} /> {c.restore}
              </button>
            </div>
          ))}
        </Disclosure>
      )}
    </section>
  )
}
