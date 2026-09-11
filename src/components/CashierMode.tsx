import { useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { EmptyState } from './EmptyState'
import { useLang, useT } from '../i18n'
import { type Pick, money, dealValidity, dealEnded, flippFlyerUrl, flippItemUrl, flippListUrl } from '../lib/deals'
import type { ListItem } from '../lib/picks'
import { useFlippClipped, markFlippClipped, resetFlippClipped } from '../lib/flippClipped'
import { flippListPayload, flippAddTextsUrl, flippSendText, flippListOpenUrl } from '../lib/flippList'
import { refreshEndedDeals } from '../lib/picks'
import { isGuest } from '../lib/device'
import { useNotice } from '../lib/toast'
import { FlyerViewer, prefetchFlyer } from './FlyerViewer'
import { FlippPager } from './FlippPager'
import { ZoomableImg } from './ZoomableImg'
import { Icon, InlineIcon } from './Icon'
import { Cluster } from './Layout'
import { Chip } from './Chip'
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
  // The grid door starts at the first pick not yet shown this trip (or the first).
  const pagerStart = Math.max(0, clippable.findIndex((p) => !shown.has(p.itemId)))
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
  const clipDone = clippable.filter((p) => clipped.includes(p.deal.id!)).length
  const clipNext = clippable.find((p) => !clipped.includes(p.deal.id!))
  // « Copier pour Flipp » copies the list in Flipp's own shape, for the bookmark set
  // up in Réglages (lib/flippList): on flipp.com the bookmark pastes it straight
  // into « Ma liste ». Its own button — it was the list door's side effect for an
  // hour, and a side effect nobody sees is one nobody trusts.
  // THE WHOLE LIST goes (Marc: « my full list exported in my flipp app »): a row
  // with a live clipping goes as that clipping; every other unchecked row — plain,
  // or its deal ended, or its store hidden at the till — as a typed item.
  const clippedRows = new Set(clippable.map((p) => p.itemId))
  const terms = rows.filter((r) => !r.checked_at && !clippedRows.has(r.id)).map((r) => r.text)
  // « ENVOYER À FLIPP » — every unchecked line as text, in ONE link, no bookmark:
  // flipp.com's /action adds them as typed items (lib/flippList flippAddTextsUrl),
  // and on a phone with the app that path opens the app. The photos of the staged
  // deals do not travel this way — that is what « Copier pour Flipp » is for.
  const sendTerms = rows.filter((r) => !r.checked_at).map((r) => flippSendText(r.text)).filter(Boolean)
  // A CHECKED line is "in the cart / bought" and stays home — by design, and the
  // reason Marc's deal lines "didn't get sent" (2026-09-10): the till still shows
  // their tiles, so the sent line says how many stayed, instead of leaving a phone
  // to guess. Unchecking a line is the way to send it.
  const keptChecked = rows.filter((r) => !!r.checked_at).length
  const sendUrl = flippAddTextsUrl(sendTerms, postal) ?? flippListUrl(postal)
  // After the tap, the line under the row says exactly what went (count + words):
  // Marc's phone showed fewer lines in Flipp than were sent, and the only way to
  // tell "not sent" from "not shown" is to see the list that left.
  const [sent, setSent] = useState(false)
  // The notice fires while the flipp.com window COVERS this page and is gone before
  // the household comes back (Marc, iPhone, 2026-09-10: « i dont see the notice »;
  // the paste had worked). So the word lives under the button, and stays.
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'refused'>('idle')
  const copyForFlipp = () => {
    navigator.clipboard
      ?.writeText(flippListPayload(clippable, terms))
      .then(() => {
        setCopyState('copied')
        notice(t.shop.flippCopied)
      })
      .catch(() => setCopyState('refused'))
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
          {postal && (clippable.length > 0 || terms.length > 0) && (
            <div className="cashier__flipp">
              <Cluster className="cashier__flipp-row">
                {/* Order = reading order at 390px, where the row wraps: SHOW first (what a
                    till is for — Flipp's own page, framed, one pick after the other), then
                    the words door, the bookmark copy, the tap-by-tap ADD loop under it. */}
                {clippable.length > 0 && (
                  <button type="button" className="btn btn--primary cashier__show-flipp" onClick={() => pageTo(pagerStart)}>
                    <InlineIcon name="storefront-bold" /> {t.shop.showFlipp}
                  </button>
                )}
                <a className={`btn${clippable.length ? '' : ' btn--primary'} cashier__send`} href={sendUrl!} target="_blank" rel="noopener noreferrer" onClick={() => setSent(true)}>
                  <InlineIcon name="arrow-up-right-bold" /> {t.shop.sendToFlipp}
                </a>
                <button type="button" className="btn cashier__copy" onClick={copyForFlipp}>
                  <InlineIcon name="check-bold" /> {t.shop.copyForFlipp}
                </button>
                {clipNext ? (
                  <a
                    className="btn cashier__clip"
                    href={flippItemUrl(clipNext.deal.id, postal)!}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => markFlippClipped(clipNext.deal.id!)}
                  >
                    <InlineIcon name="arrow-up-right-bold" /> {t.shop.clipNext(clipDone + 1, clippable.length)}
                  </a>
                ) : clippable.length > 0 ? (
                  <button type="button" className="btn btn--ghost cashier__clip-reset" onClick={resetFlippClipped}>
                    <InlineIcon name="arrow-counter-clockwise-bold" /> {t.shop.clipAgain}
                  </button>
                ) : null /* nothing live to step through (every deal ended) — no loop, no restart; the list door alone */}
              </Cluster>
              {sent && (
                <p className="cashier__flipp-hint mono cashier__sent">
                  {t.shop.sentToFlipp(sendTerms.length)} — {sendTerms.join(' · ')}
                  {keptChecked > 0 && <> · {t.shop.sentKeptChecked(keptChecked)}</>}
                </p>
              )}
              {copyState !== 'idle' && (
                <p className="cashier__flipp-hint mono">
                  {copyState === 'copied' ? t.shop.flippCopied : t.shop.flippCopyRefused}{' '}
                  {/* Copied → the next step is on flipp.com, in a browser that HAS the
                      bookmark: Safari itself on iOS (lib/flippList flippListOpenUrl). */}
                  {copyState === 'copied' && (
                    <a className="btn btn--ghost cashier__open-flipp" href={flippListOpenUrl(postal)} target="_blank" rel="noopener noreferrer">
                      <InlineIcon name="arrow-up-right-bold" /> {t.shop.openFlipp}
                    </a>
                  )}{' '}
                  {/* The whole walkthrough is one Réglages card away (DISCOVERY: ?focus= names the card). */}
                  <Chip to="/settings?tab=liste&focus=flipp">{t.shop.flippHow}</Chip>
                </p>
              )}
            </div>
          )}
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
