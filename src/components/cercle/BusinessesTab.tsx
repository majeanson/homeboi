import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useT, useLang } from '../../i18n'
import { api } from '../../lib/api'
import { live } from '../../lib/query'
import { useWrite } from '../../lib/write'
import { useDeferredRemoval } from '../../lib/useDeferredRemoval'
import { isGuest } from '../../lib/device'
import { imgUrl } from '../../lib/image'
import { faint, tintInk } from '../../lib/colors'
import { BUSINESSES_KEY } from '../../lib/queryKeys'
import { type Business } from '../../lib/businesses'
import { useEntityDetail } from '../detail/DetailProvider'
import { buildBusiness } from '../detail/adapters'
import { Icon, InlineIcon } from '../Icon'
import { EmptyState } from '../EmptyState'
import { Modal } from '../Modal'
import { BusinessForm } from './BusinessForm'
import { HelpTitle, type HelpMode } from '../../lib/helpMode'
import { scrollBehavior } from '../../lib/motion'

// « Le cercle » → Business tab: the household's services / vendors directory (vet,
// hospital, plumber, business cards…). DELIBERATELY isolated from the people graph —
// its own query/endpoint, never unified into contacts/members. Strictly quick reach
// + notes + linking a rendez-vous (the EventForm "Avec" picker reads the same list).
export function BusinessesTab({
  help,
  // A global-search hit deep-links here with the business id (§892): open its peek +
  // scroll it into view, then call onFocused so the parent clears the one-shot focus.
  focusId,
  onFocused,
}: {
  help?: HelpMode
  focusId?: string | null
  onFocused?: () => void
}) {
  const t = useT()
  const { lang } = useLang()
  const write = useWrite()
  const detail = useEntityDetail()
  const ro = isGuest()
  const bz = t.cercle.business

  // Adding a business is the ＋ FAB's job now (the cercle chooser's "Nouveau commerce"
  // tile → page-level modal), like person/family/group/connect — so the tab carries no
  // add button of its own. Editing still lives here, reached from a business's peek.
  const [editing, setEditing] = useState<Business | null>(null)

  const { data } = useQuery({ queryKey: BUSINESSES_KEY, queryFn: () => api<{ businesses: Business[] }>('businesses'), ...live })
  const all = data?.businesses ?? []
  const removal = useDeferredRemoval(BUSINESSES_KEY)
  const shown = removal.visible(all)

  function remove(b: Business) {
    removal.remove([b.id], bz.deleted, () =>
      write('businesses', { method: 'DELETE', body: { id: b.id }, affectedKeys: [BUSINESSES_KEY] }),
    )
  }

  function openPeek(b: Business) {
    detail.open(
      buildBusiness(b, { t, lang, members: [] }, ro ? undefined : { onEdit: () => setEditing(b), onDelete: () => remove(b) }),
    )
  }

  // Land a search hit on the exact business: once its row is loaded, open the peek and
  // scroll it into view. `flashId` keeps a one-time highlight pulse on the row AFTER the
  // parent clears its one-shot focusId (a CSS animation that plays once), so the arrival
  // reads even though focusId is consumed immediately.
  const rowRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const [flashId, setFlashId] = useState<string | null>(null)
  useEffect(() => {
    if (!focusId) return
    const b = all.find((x) => x.id === focusId)
    if (!b) return // not loaded yet (or gone) — wait for the next poll
    openPeek(b)
    setFlashId(focusId)
    requestAnimationFrame(() => rowRefs.current[focusId]?.scrollIntoView({ block: 'center', behavior: scrollBehavior() }))
    onFocused?.()
    // openPeek/onFocused are stable enough for this one-shot; re-run only on a new id.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusId, all])
  // Drop the highlight after the pulse so the ring doesn't linger permanently.
  useEffect(() => {
    if (!flashId) return
    const timer = setTimeout(() => setFlashId(null), 3000)
    return () => clearTimeout(timer)
  }, [flashId])

  return (
    <section className="cercle-group cercle-business">
      <HelpTitle help={help} k="business" className="cercle-section__label">
        <InlineIcon name="storefront-bold" size={16} /> {bz.title}
      </HelpTitle>
      {help?.bubbleFor('business')}
      <p className="cercle-business__hint mono">{bz.addHint}</p>

      {shown.length === 0 ? (
        <EmptyState>{bz.empty}</EmptyState>
      ) : (
        shown.map((b) => {
          const photo = b.photoKey ? imgUrl(b.photoKey) : null
          const sub = b.category?.trim() || b.notes?.trim() || null
          return (
            <div
              key={b.id}
              ref={(el) => { rowRefs.current[b.id] = el }}
              className={'cercle-row' + (flashId === b.id ? ' is-focus' : '')}
            >
              <button type="button" className="cercle-row__open" onClick={() => openPeek(b)}>
                <span
                  className="cercle-business__av"
                  aria-hidden="true"
                  style={b.colour && !photo ? { background: faint(b.colour), color: tintInk(b.colour) } : undefined}
                >
                  {photo ? <img src={photo} alt="" /> : <Icon name="storefront-bold" size={22} />}
                </span>
                <span className="cercle-row__main">
                  <span className="cercle-row__name">{b.name}</span>
                  {sub && <span className="cercle-row__sub mono">{sub}</span>}
                </span>
              </button>
              {b.phone && (
                <a className="cercle-row__quick" href={`tel:${b.phone}`} aria-label={t.cercle.call} title={t.cercle.call}>
                  <InlineIcon name="phone-bold" size={16} />
                </a>
              )}
              {b.email && (
                <a className="cercle-row__quick" href={`mailto:${b.email}`} aria-label={t.cercle.write} title={t.cercle.write}>
                  <InlineIcon name="envelope-bold" size={16} />
                </a>
              )}
            </div>
          )
        })
      )}

      <Modal open={!!editing} onClose={() => setEditing(null)} title={bz.edit}>
        {editing && <BusinessForm value={editing} onSaved={() => setEditing(null)} onCancel={() => setEditing(null)} />}
      </Modal>
    </section>
  )
}
