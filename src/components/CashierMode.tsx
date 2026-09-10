import { useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { EmptyState } from './EmptyState'
import { useLang, useT } from '../i18n'
import { type Pick, money, dealValidity, flippFlyerUrl, flippItemUrl, flippListUrl } from '../lib/deals'
import { useFlippClipped, markFlippClipped, resetFlippClipped } from '../lib/flippClipped'
import { flippListPayload } from '../lib/flippList'
import { useNotice } from '../lib/toast'
import { FlyerViewer, prefetchFlyer } from './FlyerViewer'
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
}: {
  picks: Pick[]
  onClose: () => void
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
  // THE FLIPP LOOP (2026-09-10). Marc: « any way to pre-create the list and then
  // show it from flipp? » No — probed in a real browser: flipp.com's « Ajouter à la
  // liste » writes that browser's own localStorage and makes no request, the list
  // page reads no URL parameter, the app's list is account-synced behind an
  // undocumented backend. Nothing on OUR origin writes a Flipp list (the one thing
  // that can is a bookmark running on theirs — lib/flippList, below). What is easy
  // without any setup is stepping through it with THEIR button: one tap here opens
  // the next pick's Flipp page, one tap there adds it, come back — and « Ma liste
  // Flipp » then shows the clippings the way Flipp shows them. Where the loop
  // stands is remembered per device (a clipping lives in that same browser);
  // only picks that carry a Flipp id can take part, and the whole row needs the
  // postal code the item page needs. ONE row, no hint line: the grid is scanned
  // at a till, and the page the step opens carries the next instruction itself.
  const clipped = useFlippClipped()
  const clippable = picks.filter((p) => p.deal.id != null)
  const clipDone = clippable.filter((p) => clipped.includes(p.deal.id!)).length
  const clipNext = clippable.find((p) => !clipped.includes(p.deal.id!))
  // « Ma liste Flipp » also COPIES the picks in Flipp's own list shape, for the
  // bookmark set up in Réglages (lib/flippList): on flipp.com the bookmark pastes
  // them straight into « Ma liste ». One tap opens their list and readies the paste;
  // a phone without the bookmark loses nothing. Said once in the notice bar — the
  // clipboard is invisible otherwise. Clipboard refused (no gesture, no permission):
  // the link still opens, silently — a notice about a copy that did not happen
  // would be a lie.
  const notice = useNotice()
  const copyForFlipp = () => {
    navigator.clipboard
      ?.writeText(flippListPayload(clippable))
      .then(() => notice(t.shop.flippCopied))
      .catch(() => {})
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
          {postal && clippable.length > 0 && (
            <div className="cashier__flipp">
              <Cluster className="cashier__flipp-row">
                {clipNext ? (
                  <a
                    className="btn btn--primary cashier__clip"
                    href={flippItemUrl(clipNext.deal.id, postal)!}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => markFlippClipped(clipNext.deal.id!)}
                  >
                    <InlineIcon name="arrow-up-right-bold" /> {t.shop.clipNext(clipDone + 1, clippable.length)}
                  </a>
                ) : (
                  <button type="button" className="btn btn--ghost cashier__clip-reset" onClick={resetFlippClipped}>
                    <InlineIcon name="arrow-counter-clockwise-bold" /> {t.shop.clipAgain}
                  </button>
                )}
                {/* Primary once the loop is done — the list is then the thing to show. */}
                <a
                  className={'btn cashier__flipp-list' + (clipNext ? '' : ' btn--primary')}
                  href={flippListUrl(postal)!}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={copyForFlipp}
                >
                  <InlineIcon name="shopping-bag-bold" /> {t.shop.flippList}
                </a>
              </Cluster>
            </div>
          )}
          <ul className="cashier__grid">
            {picks.map((p) => {
              const isShown = shown.has(p.itemId)
              return (
                <li key={p.itemId}>
                  <button
                    type="button"
                    className={`cashier__tile${isShown ? ' is-shown' : ''}`}
                    onClick={() => show(p)}
                  >
                    {p.deal.image && (
                      <img className="cashier__tile-img" src={p.deal.image} alt="" loading="lazy" />
                    )}
                    <span className="cashier__tile-for">{p.itemText}</span>
                    <span className="cashier__tile-name mono">{p.deal.name}</span>
                    <span className="cashier__tile-price">{money(p.deal.price)}</span>
                    <span className="cashier__tile-store mono">{p.deal.merchant}</span>
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
      </div>
    )
  }

  // ---- Peek: the picked deal blown up, the proof to hold up at the till -----
  const d = selected.deal

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
              {flippItemUrl(d.id, postal) && (
                <a
                  className="btn btn--primary bigcard__flipp"
                  href={flippItemUrl(d.id, postal)!}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <InlineIcon name="arrow-up-right-bold" /> {t.shop.showFlipp}
                </a>
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
            {(d.validFrom || d.validTo) && (
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
