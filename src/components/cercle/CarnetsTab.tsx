import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useT } from '../../i18n'
import { imgUrl } from '../../lib/image'
import { faint } from '../../lib/colors'
import { isGuest } from '../../lib/device'
import { useCarnets, carnetEmoji, type Carnet } from '../../lib/carnets'
import { InlineIcon } from '../Icon'
import { EmptyState } from '../EmptyState'
import { Modal } from '../Modal'
import { CarnetForm } from './CarnetForm'
import { HelpTitle, type HelpMode } from '../../lib/helpMode'

// « Le cercle » → Les carnets tab: the household's cared-for things (houses, cars).
// A directory of TOP-LEVEL carnets; tapping one opens its full carnet scene. Mirrors
// the Business tab's isolation (its own query, never the people graph), but a carnet
// navigates to a scene (it has a history + children) rather than a peek.
export function CarnetsTab({ help }: { help?: HelpMode }) {
  const t = useT()
  const nav = useNavigate()
  const ro = isGuest()
  const c = t.carnets
  const [adding, setAdding] = useState(false)

  const { data } = useCarnets()
  const tops = (data?.carnets ?? []).filter((x) => !x.parentId)
  const soonIds = new Set((data?.soon ?? []).map((s) => s.carnetId))

  // A top-level carnet's subtree counts as "needs a look" if it OR any of its
  // children is in the lifecycle "soon" set.
  const childrenOf = (id: string) => (data?.carnets ?? []).filter((x) => x.parentId === id)
  const needsLook = (x: Carnet) => soonIds.has(x.id) || childrenOf(x.id).some((ch) => soonIds.has(ch.id))

  return (
    <section className="cercle-group cercle-carnets">
      <HelpTitle help={help} k="carnets" className="cercle-section__label">
        <InlineIcon name="book-open-bold" size={16} /> {c.title}
      </HelpTitle>
      {help?.bubbleFor('carnets')}
      <p className="cercle-business__hint mono">{c.hint}</p>

      {tops.length === 0 ? (
        <EmptyState guide={{ card: 'carnets' }}>{c.empty}</EmptyState>
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

      {!ro && (
        <button type="button" className="btn btn--ghost cercle-carnets__add" onClick={() => setAdding(true)}>
          <InlineIcon name="plus-bold" size={16} /> {c.add}
        </button>
      )}

      <Modal open={adding} onClose={() => setAdding(false)} title={c.add}>
        <CarnetForm defaultKind="home" onSaved={() => setAdding(false)} onCancel={() => setAdding(false)} />
      </Modal>
    </section>
  )
}
