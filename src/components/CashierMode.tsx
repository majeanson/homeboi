import { useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { EmptyState } from './EmptyState'
import { useLang, useT } from '../i18n'
import { type Pick, money, dealValidity, dealEnded, flippFlyerUrl, flippItemUrl } from '../lib/deals'
import type { ListItem } from '../lib/picks'
import { refreshEndedDeals } from '../lib/picks'
import { isGuest } from '../lib/device'
import { useNotice } from '../lib/toast'
import { FlyerViewer, prefetchFlyer } from './FlyerViewer'
import { FlippPager } from './FlippPager'
import { ZoomableImg } from './ZoomableImg'
import { Icon, InlineIcon } from './Icon'
import { Cluster } from './Layout'
import { OfflineBanner } from './OfflineBanner'
import { useModal } from '../lib/useModal'

// "Show the cashier" mode. The user holds the phone (the cashier never does) and
// items hit the belt in an unpredictable order — so this is RANDOM-ACCESS, not a
// sequential stepper:
//   grid — every picked deal as a tile; tap the one being scanned right now.
//   peek — that pick blown up full-screen (store, picture, BIG price, unit price,
//          dates, "view flyer"), with ‹ Retour back to the grid to pick the next.
// A tapped tile dims with a ✓ (ephemeral, this trip only — no count, stays calm) so
// a big cart stays trackable. Deliberately oversized + low-text for use under pressure.
export function CashierMode({
  picks,
  onClose,
  postal,
  rows = [],
}: {
  picks: Pick[]
  onClose: () => void
  /** Every list row (the ['board'] cache), so « Ma liste Flipp » can carry the WHOLE
   *  list: an unchecked row without a live clipping rides as a typed item. */
  rows?: ListItem[]
  /** The household's postal code — Flipp's item page needs it, so without one the
   *  « Montrer Flipp » door does not render at all (a dead link at a till is worse
   *  than none). */
  postal?: string | null
}) {
  const t = useT()
  const { lang } = useLang()
  const qc = useQueryClient()
  // Esc-to-close + scroll-lock + focus-trap. One ref rides whichever view is
  // rendered (only one — grid or peek — is mounted at a time).
  const cashierRef = useRef<HTMLDivElement>(null)
  useModal(cashierRef, onClose)
  // selected === null → the grid; a Pick → its full-screen proof peek.
  const [selected, setSelected] = useState<Pick | null>(null)
  // Which picks have been shown this trip — dims the tile with a ✓ so a big,
  // unordered cart stays trackable. Ephemeral by design (resets when the mode
  // closes), and carries NO count/score, so it stays calm (no streak/points).
  const [shown, setShown] = useState<Set<string>>(() => new Set())
  const [flyerOpen, setFlyerOpen] = useState(false)
  // « MONTRER FLIPP » ONE AFTER THE OTHER (2026-09-11): the index into `clippable` the
  // FlippPager frames, or null when it is closed. Every pick it lands on is marked
  // shown (the tile's ✓), the same as tapping its tile — the pager IS showing.
  const [pagerAt, setPagerAt] = useState<number | null>(null)
  // The pager reads the list through a ref so `pageTo` stays stable across renders.
  const clippableRef = useRef<Pick[]>([])
  const pageTo = (i: number) => {
    const p = clippableRef.current[i]
    if (!p) return
    setPagerAt(i)
    setShown((s) => (s.has(p.itemId) ? s : new Set(s).add(p.itemId)))
  }
  // AN ENDED DEAL GETS NO FLIPP DOOR. Marc, from the phone (2026-09-10): a staged
  // deal from last week's Provigo flyer opened Flipp's « This item is expired » →
  // « Circulaires de Undefined » page — a dead screen, in front of a cashier. The
  // list row already knows (« Aubaine terminée », lib/deals dealEnded: the validTo
  // day fully past); the till now reads the same fact: no item page, not in the
  // loop, not in the paste — and the card says so instead of the dates.
  const notice = useNotice()
  const isEnded = (p: Pick) => dealEnded(p.deal.validTo)
  const clippable = picks.filter((p) => p.deal.id != null && !isEnded(p))
  clippableRef.current = clippable
  // REFRESH THE ENDED ONES (2026-09-10): a week after « Choisir les meilleurs » the
  // grid is all « Aubaine terminée » — Marc's list that night. One tap re-runs this
  // week's best price for exactly those lines (lib/picks refreshEndedDeals); a line
  // with none is unstaged rather than kept as a week-old proof. Writes → not for a
  // guest. The board refetch behind stageDeal redraws the tiles.
  const endedRows = picks.filter(isEnded).map((p) => rows.find((r) => r.id === p.itemId)).filter((r): r is ListItem => !!r)
  const [refreshing, setRefreshing] = useState(false)
  const refreshEnded = async () => {
    if (refreshing) return
    setRefreshing(true)
    const { found, dropped } = await refreshEndedDeals(qc, endedRows)
    setRefreshing(false)
    notice(t.shop.refreshed(found, dropped))
  }

  // Opened at home on wifi → warm each pick's flyer + clipping images so the
  // full-flyer proof is ready at the till even on poor signal. Re-runs only when
  // the set of flyers changes (keyed by flyerKey); prefetchFlyer is cached.
  const flyerKey = picks.map((p) => p.deal.flyerId ?? '').join(',')
  useEffect(() => {
    for (const p of picks) if (p.deal.flyerId != null) prefetchFlyer(qc, p.deal.flyerId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flyerKey, qc])


  // Show a pick: mark it shown (✓) and open its proof.
  const show = (p: Pick) => {
    setShown((s) => (s.has(p.itemId) ? s : new Set(s).add(p.itemId)))
    setSelected(p)
  }

  // Nothing picked yet — CashierPage redirects in this case, but guard anyway.
  if (picks.length === 0) {
    return (
      <div ref={cashierRef} className="cashier" role="dialog" aria-modal="true" aria-label={t.shop.cashierTitle}>
        <div className="cashier__bar">
          <span className="cashier__title">{t.shop.cashierTitle}</span>
          <button type="button" className="btn btn--ghost mono" onClick={onClose} aria-label={t.shop.close}>
            <Icon name="x-bold" size={18} />
          </button>
        </div>
        <EmptyState>{t.shop.none}</EmptyState>
      </div>
    )
  }

  // ---- Grid: every picked deal as a tile, tap the one being scanned ---------
  if (!selected) {
    return (
      <div ref={cashierRef} className="cashier" role="dialog" aria-modal="true" aria-label={t.shop.cashierTitle}>
        <div className="cashier__bar">
          <span className="cashier__title">{t.shop.cashierTitle}</span>
          {/* Reset the within-trip ✓ marks — only when there's something to reset. */}
          {shown.size > 0 && (
            <button type="button" className="btn btn--ghost mono cashier__reset" onClick={() => setShown(new Set())}>
              <InlineIcon name="eye-bold" /> {t.shop.showAgain}
            </button>
          )}
          <button type="button" className="btn btn--ghost mono" onClick={onClose} aria-label={t.shop.close}>
            <Icon name="x-bold" size={18} />
          </button>
        </div>

        {/* The till IS the weak-signal spot (shop seam #2): the cashier scene lives
            outside HubLayout, so it renders the shared offline/stale bar itself —
            cached prices shown to a cashier must read as "not live". */}
        <OfflineBanner />

        <div className="cashier__grid-wrap">
          <p className="cashier__hint mono">{t.shop.tapToShow}</p>
          {endedRows.length > 0 && !isGuest() && (
            <Cluster className="cashier__flipp-row cashier__refresh-row">
              <button type="button" className="btn cashier__refresh" onClick={refreshEnded} disabled={refreshing}>
                <InlineIcon name="arrow-counter-clockwise-bold" /> {refreshing ? t.shop.refreshing : t.shop.refreshEnded(endedRows.length)}
              </button>
            </Cluster>
          )}
          {/* THE FLIPP ROW IS GONE (2026-09-12). It held four doors, and only one of
              them belonged here: « Montrer Flipp » — showing a deal to the cashier who
              is scanning it. That one now lives on the item's own card below, where it
              is contextual. The other three (send my list · send the words · empty the
              Flipp list) are LIST acts done at home before leaving, not at a register
              with someone waiting, and they moved to « Ma liste Flipp » on La liste
              (components/FlippSheet). Marc: « discern montrer à la caisse and flipp
              actions ». The till is a grid you tap to show a price again. */}
          <ul className="cashier__grid">
            {picks.map((p) => {
              const isShown = shown.has(p.itemId)
              const ended = isEnded(p)
              return (
                <li key={p.itemId}>
                  <button
                    type="button"
                    className={`cashier__tile${isShown ? ' is-shown' : ''}${ended ? ' is-ended' : ''}`}
                    onClick={() => show(p)}
                  >
                    {p.deal.image && (
                      <img className="cashier__tile-img" src={p.deal.image} alt="" loading="lazy" />
                    )}
                    <span className="cashier__tile-for">{p.itemText}</span>
                    <span className="cashier__tile-name mono">{p.deal.name}</span>
                    <span className="cashier__tile-price">{money(p.deal.price)}</span>
                    <span className="cashier__tile-store mono">{p.deal.merchant}</span>
                    {ended && <span className="cashier__tile-ended mono">{t.shop.dealEnded}</span>}
                    {isShown && (
                      <span className="cashier__tile-check" aria-label={t.shop.shown}>
                        <Icon name="check-bold" size={14} />
                      </span>
                    )}
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
        {pagerAt != null && postal && clippable.length > 0 && (
          <FlippPager picks={clippable} index={pagerAt} postal={postal} onIndex={pageTo} onClose={() => setPagerAt(null)} />
        )}
      </div>
    )
  }

  // ---- Peek: the picked deal blown up, the proof to hold up at the till -----
  const d = selected.deal
  const ended = isEnded(selected)

  return (
    <div ref={cashierRef} className="cashier" role="dialog" aria-modal="true" aria-label={t.shop.cashierTitle}>
      <div className="cashier__bar">
        <button
          type="button"
          className="btn btn--ghost mono"
          onClick={() => setSelected(null)}
          aria-label={t.common.back}
        >
          <InlineIcon name="caret-left-bold" /> {t.common.back}
        </button>
        <button type="button" className="btn btn--ghost mono" onClick={onClose} aria-label={t.shop.close}>
          <Icon name="x-bold" size={18} />
        </button>
      </div>

      {/* THE PROOF CARD, in the reading order of the item page a cashier already
          knows — Flipp's, verified in a real browser 2026-09-10: small store logo,
          then the photo on a pale block, then name, then a big price, then the
          action row, then the dates and the fine print. Same SHAPE, our colours: a
          cashier who knows that screen recognises this one instantly, without the
          card pretending to be it — the real one is one tap away on the row below.
          (Marc: « make sure it looks 90% like flipp ui ». The 10% left out is their
          palette and wordmark, on purpose.) */}
      <div className="cashier__stage">
        <div className="bigcard">
          <div className="bigcard__media">
            {/* Logo small and first, as on the page it echoes — the store is the
                first thing read, not the loudest. */}
            <span className="bigcard__store">
              {d.logo && <img className="bigcard__logo" src={d.logo} alt="" loading="lazy" />}
              {d.merchant}
            </span>
            {d.image && (
              <div className="bigcard__pic">
                <ZoomableImg className="bigcard__img" src={d.image} alt={d.name} />
              </div>
            )}
          </div>
          <div className="bigcard__info">
            <span className="bigcard__name">{d.name}</span>
            <span className="bigcard__price">{money(d.price)}</span>
            {/* Below the price, as the page does: what the ad also states. The unit
                price is what a match actually turns on (sizes rarely agree); an
                AI-INFERRED size wears ≈ — at a till, a guess must never present itself
                as printed fact. « avant … » is Flipp's sale line, from the field we
                already ingest. */}
            <span className="bigcard__facts mono">
              {d.unitPrice != null && (
                <span className={'bigcard__unit' + (d.unitApprox ? ' bigcard__unit--approx' : '')}>
                  {d.unitApprox && (
                    <>
                      <InlineIcon name="approximate-equals-bold" size={14} />{' '}
                    </>
                  )}
                  {money(d.unitPrice)}
                  {d.unitLabel}
                </span>
              )}
              {d.wasPrice != null && d.wasPrice > (d.price ?? 0) && (
                <span className="bigcard__was">
                  {t.shop.was} {money(d.wasPrice)}
                </span>
              )}
            </span>
            {/* The action row — filled + outlined, side by side, like the page's
                own pair. « MONTRER FLIPP » is the primary door and the answer to "a
                cashier won't take an app that isn't one of the three": one tap opens
                Flipp's own page for THIS item. Built by lib/deals; null without a
                postal code, on purpose. « Voir la circulaire » stays the fast in-app
                path — it opens ON the item, circled. */}
            <Cluster className="bigcard__actions">
              {!ended && postal && flippItemUrl(d.id, postal) && (
                <button
                  type="button"
                  className="btn btn--primary bigcard__flipp"
                  onClick={() => pageTo(Math.max(0, clippable.findIndex((p) => p.itemId === selected.itemId)))}
                >
                  <InlineIcon name="storefront-bold" /> {t.shop.showFlipp}
                </button>
              )}
              {d.flyerId != null && (
                <button type="button" className="btn bigcard__flyer" onClick={() => setFlyerOpen(true)}>
                  <InlineIcon name="file-text-bold" /> {t.shop.viewFlyer}
                </button>
              )}
            </Cluster>
            <span className="bigcard__for">
              {t.shop.matchFor} <strong>{selected.itemText}</strong>
            </span>
            {/* The dates a cashier checks, as the ad states them (« du 8 au 14 sept. »,
                never just an end) — in the page's own register: a plain dated line,
                not a pill. One size up from theirs so it still reads at arm's length. */}
            {/* Ended: the dates give way to the word — the one thing a cashier must
                not be shown as still true. Same predicate as the list row's « ! ». */}
            {ended && (
              <span className="bigcard__ended">
                <InlineIcon name="warning-bold" size={18} />{' '}
                {t.shop.dealEnded}
                {d.validTo && <> — {dealValidity(d.validFrom, d.validTo, lang, { rangeTo: t.shop.dateRangeTo, until: t.shop.until })}</>}
              </span>
            )}
            {!ended && (d.validFrom || d.validTo) && (
              <span className="bigcard__valid">
                <InlineIcon name="calendar-dots-bold" size={18} />{' '}
                {dealValidity(d.validFrom, d.validTo, lang, { rangeTo: t.shop.dateRangeTo, until: t.shop.until })}
              </span>
            )}
            {/* WHERE THIS AD COMES FROM — at the foot, where the page keeps its own
                fine print. Naming the source is the honest form of the argument the
                accepted apps make by being the store's channel. */}
            {d.flyerId != null && (
              <a
                className="bigcard__source"
                href={flippFlyerUrl(d.flyerId, d.merchant, lang)}
                target="_blank"
                rel="noopener noreferrer"
              >
                {t.shop.dealSource(d.merchant)} <InlineIcon name="arrow-up-right-bold" size={12} />
              </a>
            )}
          </div>
        </div>
      </div>

      {pagerAt != null && postal && clippable.length > 0 && (
        <FlippPager picks={clippable} index={pagerAt} postal={postal} onIndex={pageTo} onClose={() => setPagerAt(null)} />
      )}

      {flyerOpen && d.flyerId != null && (
        <FlyerViewer
          flyerId={d.flyerId}
          highlightId={d.id}
          title={d.merchant}
          logo={d.logo}
          premium={d.premium}
          onClose={() => setFlyerOpen(false)}
        />
      )}
    </div>
  )
}
