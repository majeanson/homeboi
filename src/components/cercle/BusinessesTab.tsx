import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useT, useLang } from '../../i18n'
import { api } from '../../lib/api'
import { live } from '../../lib/query'
import { useWrite } from '../../lib/write'
import { useDeferredRemoval } from '../../lib/useDeferredRemoval'
import { isGuest } from '../../lib/device'
// « Joindre » (A-6): a real tel:/mailto: reach-out here feeds the rail's ranking
// too — so the quick-dial rail warms up from actual use, not just its own taps.
import { bumpFrequent } from '../../lib/frequents'
import { JOINDRE_SCOPE } from '../../lib/joindre'
import { imgUrl } from '../../lib/image'
import { faint, tintInk } from '../../lib/colors'
import { BUSINESSES_KEY, MEMBERS_KEY, EVENTS_KEY } from '../../lib/queryKeys'
import { nextRdvFor } from '../../lib/nextRdv'
import { type Business } from '../../lib/businesses'
import { useEntityDetail } from '../detail/DetailProvider'
import { buildBusiness } from '../detail/adapters'
import { Icon, InlineIcon } from '../Icon'
import { EmptyState } from '../EmptyState'
import { Modal } from '../Modal'
import { BusinessForm } from './BusinessForm'
import { JoindreRail } from './JoindreRail'
import { EventForm, type EventInit } from '../forms/EventForm'
import { type FormMember } from '../FormScene'
import { scrollBehavior } from '../../lib/motion'

// « Le cercle » → Business tab: the household's services / vendors directory (vet,
// hospital, plumber, business cards…). DELIBERATELY isolated from the people graph —
// its own query/endpoint, never unified into contacts/members. Strictly quick reach
// + notes + linking a rendez-vous (the EventForm "Avec" picker reads the same list).
export function BusinessesTab({
  // A global-search hit deep-links here with the business id (§892): open its peek +
  // scroll it into view, then call onFocused so the parent clears the one-shot focus.
  focusId,
  onFocused,
}: {
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
  // « Planifier un rendez-vous » — opened from a business's peek, hosts the shared
  // EventForm pre-seeded with this vendor as the "Avec". Members feed the form's
  // "concerne" buttons (harmless if the fetch is cold — the business is seeded anyway).
  const [rdv, setRdv] = useState<Business | null>(null)
  const membersQ = useQuery({ queryKey: MEMBERS_KEY, queryFn: () => api<{ members: FormMember[] }>('members') })
  // Upcoming events → the « Prochain rendez-vous » glance on a vendor's peek.
  const eventsQ = useQuery({ queryKey: EVENTS_KEY, queryFn: () => api<{ events: EventInit[] }>('events'), ...live })

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
    const nextRdv = nextRdvFor(eventsQ.data?.events ?? [], (e) => e.business_id === b.id)
    detail.open(
      buildBusiness(b, { t, lang, members: [] }, ro ? { nextRdv } : { onEdit: () => setEditing(b), onDelete: () => remove(b), onSchedule: () => setRdv(b), nextRdv }),
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

  // No heading, no lead line. The section PILL right above says « Business » and is the
  // lit one — repeating it cost a title plus a three-line description before a single
  // commerce, on a tab whose empty state already says what to put here (« Ajoute le
  // vétérinaire, le plombier, la clinique… »).
  //
  // It also removes a DUPLICATE help anchor: pages/Maison wires the section pills with
  // pick={help.pick} and renders help.bubbleFor('business') under that row, so this
  // HelpTitle registered the same key a second time and arming « ? » painted the
  // bubble TWICE. One anchor, on the pill that names the section.
  return (
    <section className="cercle-group cercle-business">
      {shown.length === 0 ? (
        <EmptyState
          guide={{ card: 'cercle', point: 11 }}
          action={{ to: '/maison?section=business&plus=business', label: bz.add, icon: 'plus-bold' }}
        >
          {bz.empty}
        </EmptyState>
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
                <a
                  className="cercle-row__quick"
                  href={`tel:${b.phone}`}
                  aria-label={t.cercle.call}
                  title={t.cercle.call}
                  onClick={() => bumpFrequent(JOINDRE_SCOPE, `business:${b.id}`)}
                >
                  <InlineIcon name="phone-bold" size={16} />
                </a>
              )}
              {b.email && (
                <a
                  className="cercle-row__quick"
                  href={`mailto:${b.email}`}
                  aria-label={t.cercle.write}
                  title={t.cercle.write}
                  onClick={() => bumpFrequent(JOINDRE_SCOPE, `business:${b.id}`)}
                >
                  <InlineIcon name="envelope-bold" size={16} />
                </a>
              )}
            </div>
          )
        })
      )}

      {/* « Joindre » (A-6) — the quick-dial rail at the foot of the Business tab,
          scoped to vendors. Mobile only, self-hides under 2 eligible + for a guest. */}
      <JoindreRail people={[]} businesses={shown} />

      <Modal open={!!editing} onClose={() => setEditing(null)} title={bz.edit}>
        {editing && <BusinessForm value={editing} onSaved={() => setEditing(null)} onCancel={() => setEditing(null)} />}
      </Modal>

      {/* « Planifier un rendez-vous » with this vendor — the shared EventForm, seeded
          with the business as the "Avec". Lands on the board/agenda/month like any event. */}
      <Modal open={!!rdv} onClose={() => setRdv(null)} title={t.cercle.scheduleRdv}>
        {rdv && (
          <EventForm
            members={membersQ.data?.members ?? []}
            seedWith={{ businessId: rdv.id, name: rdv.name }}
            onSaved={() => setRdv(null)}
            onCancel={() => setRdv(null)}
          />
        )}
      </Modal>
    </section>
  )
}
